<?php
/**
 * Handler for Weather API Integration
 * Uses Open-Meteo Historical Weather API
 */

function handleWeather($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                // Get weather data for a specific hunt
                $stmt = $db->prepare("
                    SELECT * FROM weather_data 
                    WHERE hunt_id = ?
                ");
                $stmt->execute([$id]);
                $weather = $stmt->fetch();
                
                if (!$weather) {
                    http_response_code(404);
                    echo json_encode(['error' => 'No weather data found for this hunt']);
                    return;
                }
                
                echo json_encode($weather);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Hunt ID required']);
            }
            break;
            
        case 'POST':
            // Fetch weather data from Open-Meteo API
            $data = json_decode(file_get_contents('php://input'), true);
            
            $latitude = $data['latitude'] ?? null;
            $longitude = $data['longitude'] ?? null;
            $date = $data['date'] ?? null;
            $huntId = $data['hunt_id'] ?? null;
            
            if (!$latitude || !$longitude || !$date) {
                http_response_code(400);
                echo json_encode(['error' => 'Latitude, longitude, and date are required']);
                return;
            }
            
            try {
                $weatherData = fetchWeatherFromAPI($latitude, $longitude, $date);
                
                // If hunt_id is provided, save to database
                if ($huntId) {
                    storeWeatherData($db, $huntId, $weatherData);
                }
                
                echo json_encode($weatherData);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to fetch weather data: ' . $e->getMessage()]);
            }
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Hunt ID required']);
                return;
            }
            
            $stmt = $db->prepare("DELETE FROM weather_data WHERE hunt_id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['message' => 'Weather data deleted successfully']);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

/**
 * Insert or update the weather record of a hunt
 */
function storeWeatherData($db, $huntId, $weatherData) {
    $stmt = $db->prepare("SELECT id FROM weather_data WHERE hunt_id = ?");
    $stmt->execute([$huntId]);
    
    if ($stmt->fetch()) {
        $stmt = $db->prepare("
            UPDATE weather_data 
            SET temperature = ?, precipitation = ?, wind_speed = ?, 
                wind_direction = ?, pressure = ?, humidity = ?, 
                cloud_cover = ?, weather_code = ?, fetched_at = CURRENT_TIMESTAMP
            WHERE hunt_id = ?
        ");
    } else {
        $stmt = $db->prepare("
            INSERT INTO weather_data 
            (temperature, precipitation, wind_speed, wind_direction, 
             pressure, humidity, cloud_cover, weather_code, hunt_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
    }
    $stmt->execute([
        $weatherData['temperature'],
        $weatherData['precipitation'],
        $weatherData['wind_speed'],
        $weatherData['wind_direction'],
        $weatherData['pressure'],
        $weatherData['humidity'],
        $weatherData['cloud_cover'],
        $weatherData['weather_code'],
        $huntId
    ]);
}

/**
 * Fetch and store the weather of a hunt from its date and hunting area coordinates.
 * Returns 'ok', 'no_coordinates' or 'failed' - never throws, so saving a hunt can't fail because of it.
 */
function updateWeatherForHunt($db, $huntId) {
    try {
        $stmt = $db->prepare("
            SELECT h.date, ha.latitude, ha.longitude
            FROM hunts h
            JOIN hunting_areas ha ON ha.id = h.hunting_area_id
            WHERE h.id = ?
        ");
        $stmt->execute([$huntId]);
        $hunt = $stmt->fetch();
        
        if (!$hunt || !$hunt['latitude'] || !$hunt['longitude']) {
            return 'no_coordinates';
        }
        
        storeWeatherData($db, $huntId, fetchWeatherFromAPI($hunt['latitude'], $hunt['longitude'], $hunt['date']));
        return 'ok';
    } catch (Exception $e) {
        error_log('Weather for hunt ' . $huntId . ' failed: ' . $e->getMessage());
        return 'failed';
    }
}

/**
 * Fetch weather data from Open-Meteo API
 */
function fetchWeatherFromAPI($latitude, $longitude, $date) {
    // The historical archive lags a few days behind; recent days come from the
    // forecast API, which also serves the past weeks
    $daysAgo = (int)floor((time() - strtotime($date)) / 86400);
    $url = $daysAgo <= 10
        ? 'https://api.open-meteo.com/v1/forecast'
        : 'https://archive-api.open-meteo.com/v1/archive';
    
    // Build query parameters
    $params = [
        'latitude' => $latitude,
        'longitude' => $longitude,
        'start_date' => $date,
        'end_date' => $date,
        'hourly' => 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl,relative_humidity_2m,cloud_cover,weather_code',
        'timezone' => 'Europe/Berlin'
    ];
    
    $queryString = http_build_query($params);
    $apiUrl = $url . '?' . $queryString;
    
    // Make API request (with a timeout, so saving a hunt never hangs on it)
    $context = stream_context_create(['http' => ['timeout' => 8]]);
    $response = @file_get_contents($apiUrl, false, $context);
    
    if ($response === false) {
        throw new Exception('Failed to connect to weather API');
    }
    
    $data = json_decode($response, true);
    
    if (!isset($data['hourly'])) {
        throw new Exception('Invalid API response');
    }
    
    // Calculate daily averages from hourly data
    $hourly = $data['hourly'];
    
    // Filter out null values and calculate averages
    $temps = array_filter($hourly['temperature_2m'], function($v) { return $v !== null; });
    $precip = array_filter($hourly['precipitation'], function($v) { return $v !== null; });
    $windSpeeds = array_filter($hourly['wind_speed_10m'], function($v) { return $v !== null; });
    $windDirs = array_filter($hourly['wind_direction_10m'], function($v) { return $v !== null; });
    $pressures = array_filter($hourly['pressure_msl'], function($v) { return $v !== null; });
    $humidities = array_filter($hourly['relative_humidity_2m'], function($v) { return $v !== null; });
    $cloudCovers = array_filter($hourly['cloud_cover'], function($v) { return $v !== null; });
    $weatherCodes = array_filter($hourly['weather_code'], function($v) { return $v !== null; });

    // The archive lags a few days behind; don't store an empty record for recent dates
    if (count($temps) === 0) {
        throw new Exception('Für dieses Datum liegen noch keine Wetterdaten vor (das Archiv hängt einige Tage hinterher)');
    }

    return [
        'temperature' => count($temps) > 0 ? round(array_sum($temps) / count($temps), 2) : null,
        'precipitation' => count($precip) > 0 ? round(array_sum($precip), 2) : null,
        'wind_speed' => count($windSpeeds) > 0 ? round(array_sum($windSpeeds) / count($windSpeeds), 2) : null,
        'wind_direction' => averageWindDirection($windDirs, $hourly['wind_speed_10m']),
        'pressure' => count($pressures) > 0 ? round(array_sum($pressures) / count($pressures), 2) : null,
        'humidity' => count($humidities) > 0 ? round(array_sum($humidities) / count($humidities)) : null,
        'cloud_cover' => count($cloudCovers) > 0 ? round(array_sum($cloudCovers) / count($cloudCovers)) : null,
        // WMO codes are categories, not values: use the most severe one of the day (like Open-Meteo's daily code)
        'weather_code' => count($weatherCodes) > 0 ? max($weatherCodes) : null
    ];
}

/**
 * Average wind direction as a vector mean weighted by wind speed,
 * so that e.g. 350° and 10° give 0° (north) instead of 180°
 */
function averageWindDirection($directions, $speeds) {
    if (count($directions) === 0) {
        return null;
    }

    $x = 0;
    $y = 0;
    foreach ($directions as $hour => $direction) {
        $weight = $speeds[$hour] ?? 1;
        $x += $weight * sin(deg2rad($direction));
        $y += $weight * cos(deg2rad($direction));
    }

    if (abs($x) < 1e-9 && abs($y) < 1e-9) {
        return null; // calm or no prevailing direction
    }

    return (int)round(fmod(rad2deg(atan2($x, $y)) + 360, 360)) % 360;
}
