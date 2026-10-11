<?php
/**
 * Handler for Hunts
 */

/**
 * Resolve the hunt's seat from seat_id. Returns [seat_id, seat name];
 * hunts.seat keeps the name for display and the seat text filter.
 * A seat from another hunting area (e.g. after changing the area) is dropped.
 */
function resolveSeat($db, $seatId, $huntingAreaId) {
    if (!$seatId || !$huntingAreaId) {
        return [null, null];
    }

    $stmt = $db->prepare("SELECT id, name FROM seats WHERE id = ? AND hunting_area_id = ?");
    $stmt->execute([$seatId, $huntingAreaId]);
    $seat = $stmt->fetch();

    return $seat ? [$seat['id'], $seat['name']] : [null, null];
}

function handleHunts($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                // Single hunt with details
                $stmt = $db->prepare("
                    SELECT h.*, ha.name as hunting_area_name 
                    FROM hunts h
                    LEFT JOIN hunting_areas ha ON h.hunting_area_id = ha.id
                    WHERE h.id = ?
                ");
                $stmt->execute([$id]);
                $hunt = $stmt->fetch();
                
                if (!$hunt) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Hunt not found']);
                    return;
                }
                
                // Observed animals
                $stmt = $db->prepare("
                    SELECT oa.*, aspec.name as animal_species_name, aspec.category
                    FROM observed_animals oa
                    LEFT JOIN animal_species aspec ON oa.animal_species_id = aspec.id
                    WHERE oa.hunt_id = ?
                ");
                $stmt->execute([$id]);
                $hunt['observed_animals'] = $stmt->fetchAll();
                
                // Harvested animals
                $stmt = $db->prepare("
                    SELECT ha.*, aspec.name as animal_species_name, aspec.category
                    FROM harvested_animals ha
                    LEFT JOIN animal_species aspec ON ha.animal_species_id = aspec.id
                    WHERE ha.hunt_id = ?
                ");
                $stmt->execute([$id]);
                $hunt['harvested_animals'] = $stmt->fetchAll();
                
                // Weather data
                $stmt = $db->prepare("
                    SELECT * FROM weather_data 
                    WHERE hunt_id = ?
                ");
                $stmt->execute([$id]);
                $hunt['weather_data'] = $stmt->fetch();
                
                echo json_encode($hunt);
            } else {
                // Filter parameters
                require_once __DIR__ . '/../helpers/hunting_season.php';
                
                $hunting_area_id = $_GET['hunting_area_id'] ?? null;
                $season_year = $_GET['season_year'] ?? null;
                $year = $_GET['year'] ?? null; // Legacy support
                $month = $_GET['month'] ?? null;
                $animal_species_id = $_GET['animal_species_id'] ?? null;
                
                // Advanced filter parameters
                $hunt_type = $_GET['hunt_type'] ?? null;
                $has_observed = isset($_GET['has_observed']) && $_GET['has_observed'] === 'true';
                $has_harvested = isset($_GET['has_harvested']) && $_GET['has_harvested'] === 'true';
                $wind_direction = $_GET['wind_direction'] ?? null;
                $temperature_min = $_GET['temperature_min'] ?? null;
                $temperature_max = $_GET['temperature_max'] ?? null;
                $precipitation_min = $_GET['precipitation_min'] ?? null;
                $precipitation_max = $_GET['precipitation_max'] ?? null;
                $date_from = $_GET['date_from'] ?? null;
                $date_to = $_GET['date_to'] ?? null;
                $seat = $_GET['seat'] ?? null;
                
                // Convert empty string to null
                if ($animal_species_id === '') {
                    $animal_species_id = null;
                }
                if ($hunting_area_id === '') {
                    $hunting_area_id = null;
                }
                if ($hunt_type === '') {
                    $hunt_type = null;
                }
                if ($seat === '') {
                    $seat = null;
                }
                
                $limit = $_GET['limit'] ?? 9999;
                $offset = $_GET['offset'] ?? 0;
                
                $sql = "
                    SELECT DISTINCT h.*,
                           ha.name as hunting_area_name,
                           wd.id as weather_id,
                           wd.temperature as weather_temperature,
                           wd.weather_code as weather_weather_code,
                           wd.wind_direction as weather_wind_direction,
                           COALESCE(obs_sum.observed_count, 0) as observed_count,
                           COALESCE(harv_sum.harvested_count, 0) as harvested_count
                    FROM hunts h
                    LEFT JOIN hunting_areas ha ON h.hunting_area_id = ha.id
                    LEFT JOIN weather_data wd ON h.id = wd.hunt_id
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as observed_count
                        FROM observed_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) obs_sum ON h.id = obs_sum.hunt_id
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as harvested_count
                        FROM harvested_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) harv_sum ON h.id = harv_sum.hunt_id
                    WHERE 1=1
                ";
                $params = [];
                
                if ($hunting_area_id) {
                    $sql .= " AND h.hunting_area_id = ?";
                    $params[] = $hunting_area_id;
                }
                
                // Filter by animal species (either observed or harvested)
                if ($animal_species_id) {
                    $sql .= " AND (h.id IN (SELECT hunt_id FROM observed_animals WHERE animal_species_id = ?) 
                             OR h.id IN (SELECT hunt_id FROM harvested_animals WHERE animal_species_id = ?))";
                    $params[] = $animal_species_id;
                    $params[] = $animal_species_id;
                }
                
                // Hunt type filter
                if ($hunt_type) {
                    $sql .= " AND h.hunt_type = ?";
                    $params[] = $hunt_type;
                }
                
                // Activity filters
                if ($has_observed) {
                    $sql .= " AND EXISTS (SELECT 1 FROM observed_animals WHERE hunt_id = h.id AND quantity > 0)";
                }
                
                if ($has_harvested) {
                    $sql .= " AND EXISTS (SELECT 1 FROM harvested_animals WHERE hunt_id = h.id AND quantity > 0)";
                }
                
                // Weather filters
                if ($wind_direction) {
                    // Convert wind direction name to degree range
                    $windRanges = [
                        'N' => [337.5, 22.5],
                        'NO' => [22.5, 67.5],
                        'O' => [67.5, 112.5],
                        'SO' => [112.5, 157.5],
                        'S' => [157.5, 202.5],
                        'SW' => [202.5, 247.5],
                        'W' => [247.5, 292.5],
                        'NW' => [292.5, 337.5]
                    ];
                    
                    if (isset($windRanges[$wind_direction])) {
                        list($min, $max) = $windRanges[$wind_direction];
                        if ($wind_direction === 'N') {
                            // North wraps around 0/360
                            $sql .= " AND (wd.wind_direction >= ? OR wd.wind_direction <= ?)";
                        } else {
                            $sql .= " AND wd.wind_direction BETWEEN ? AND ?";
                        }
                        $params[] = $min;
                        $params[] = $max;
                    }
                }
                
                if ($temperature_min !== null && $temperature_min !== '') {
                    $sql .= " AND wd.temperature >= ?";
                    $params[] = (float)$temperature_min;
                }
                
                if ($temperature_max !== null && $temperature_max !== '') {
                    $sql .= " AND wd.temperature <= ?";
                    $params[] = (float)$temperature_max;
                }
                
                if ($precipitation_min !== null && $precipitation_min !== '') {
                    $sql .= " AND wd.precipitation >= ?";
                    $params[] = (float)$precipitation_min;
                }
                
                if ($precipitation_max !== null && $precipitation_max !== '') {
                    $sql .= " AND wd.precipitation <= ?";
                    $params[] = (float)$precipitation_max;
                }
                
                // Date range filters
                if ($date_from) {
                    $sql .= " AND h.date >= ?";
                    $params[] = $date_from;
                }
                
                if ($date_to) {
                    $sql .= " AND h.date <= ?";
                    $params[] = $date_to;
                }
                
                // Seat filter (partial match)
                if ($seat) {
                    $sql .= " AND h.seat LIKE ?";
                    $params[] = '%' . $seat . '%';
                }
                
                if ($season_year) {
                    $seasonFilter = getHuntingSeasonWhereClause($season_year, 'h.date');
                    if (!empty($seasonFilter['where'])) {
                        $sql .= " AND " . $seasonFilter['where'];
                        $params = array_merge($params, $seasonFilter['params']);
                    }
                }

                if ($year) {
                    $sql .= " AND YEAR(h.date) = ?";
                    $params[] = $year;
                }
                
                if ($month) {
                    $sql .= " AND MONTH(h.date) = ?";
                    $params[] = $month;
                }
                
                $sql .= " ORDER BY h.date DESC, h.time_from DESC LIMIT ? OFFSET ?";
                $params[] = (int)$limit;
                $params[] = (int)$offset;
                
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
                $hunts = $stmt->fetchAll();

                // Nest the weather summary so the list needs no request per hunt
                foreach ($hunts as &$hunt) {
                    $hunt['weather_data'] = $hunt['weather_id'] ? [
                        'temperature' => $hunt['weather_temperature'],
                        'weather_code' => $hunt['weather_weather_code'],
                        'wind_direction' => $hunt['weather_wind_direction']
                    ] : null;
                    unset($hunt['weather_id'], $hunt['weather_temperature'],
                          $hunt['weather_weather_code'], $hunt['weather_wind_direction']);
                }
                unset($hunt);

                // Species per hunt ("Erlegt: Rehwild - Bock") in two queries instead of one per hunt
                if ($hunts) {
                    $placeholders = implode(',', array_fill(0, count($hunts), '?'));
                    $huntIds = array_column($hunts, 'id');
                    $summaries = ['observed_animals' => [], 'harvested_animals' => []];
                    foreach (array_keys($summaries) as $table) {
                        $stmt = $db->prepare("
                            SELECT a.hunt_id, aspec.name, SUM(a.quantity) as quantity
                            FROM $table a
                            JOIN animal_species aspec ON a.animal_species_id = aspec.id
                            WHERE a.hunt_id IN ($placeholders) AND a.quantity > 0
                            GROUP BY a.hunt_id, aspec.name
                            ORDER BY aspec.name
                        ");
                        $stmt->execute($huntIds);
                        foreach ($stmt->fetchAll() as $row) {
                            $summaries[$table][$row['hunt_id']][] = ['name' => $row['name'], 'quantity' => (int)$row['quantity']];
                        }
                    }
                    foreach ($hunts as &$hunt) {
                        $hunt['observed_summary'] = $summaries['observed_animals'][$hunt['id']] ?? [];
                        $hunt['harvested_summary'] = $summaries['harvested_animals'][$hunt['id']] ?? [];
                    }
                    unset($hunt);
                }

                echo json_encode($hunts);
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            
            $db->beginTransaction();
            
            try {
                list($seatId, $seatName) = resolveSeat($db, $data['seat_id'] ?? null, $data['hunting_area_id'] ?? null);

                // Create hunt
                $stmt = $db->prepare("
                    INSERT INTO hunts (date, hunting_area_id, hunt_type, seat_id, seat, time_from, time_to, weather, temperature, notes, costs)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $data['date'] ?? date('Y-m-d'),
                    $data['hunting_area_id'] ?? null,
                    $data['hunt_type'] ?? 'Ansitz',
                    $seatId,
                    $seatName,
                    $data['time_from'] ?? null,
                    $data['time_to'] ?? null,
                    $data['weather'] ?? null,
                    $data['temperature'] ?? null,
                    $data['notes'] ?? null,
                    $data['costs'] ?? null
                ]);
                
                $hunt_id = $db->lastInsertId();
                
                // Add observed animals
                if (isset($data['observed_animals']) && is_array($data['observed_animals'])) {
                    $stmt = $db->prepare("
                        INSERT INTO observed_animals (hunt_id, animal_species_id, quantity, notes) 
                        VALUES (?, ?, ?, ?)
                    ");
                    foreach ($data['observed_animals'] as $animal) {
                        $stmt->execute([
                            $hunt_id,
                            $animal['animal_species_id'],
                            $animal['quantity'] ?? 1,
                            $animal['notes'] ?? null
                        ]);
                    }
                }
                
                // Add harvested animals
                if (isset($data['harvested_animals']) && is_array($data['harvested_animals'])) {
                    $stmt = $db->prepare("
                        INSERT INTO harvested_animals (hunt_id, animal_species_id, quantity, weight, shot_distance, notes) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    ");
                    foreach ($data['harvested_animals'] as $animal) {
                        $stmt->execute([
                            $hunt_id,
                            $animal['animal_species_id'],
                            $animal['quantity'] ?? 1,
                            $animal['weight'] ?? null,
                            $animal['shot_distance'] ?? null,
                            $animal['notes'] ?? null
                        ]);
                    }
                }
                
                $db->commit();
                
                // Fetch the weather right away (after the commit: a failure must not lose the hunt)
                require_once __DIR__ . '/weather.php';
                $weather = updateWeatherForHunt($db, $hunt_id);
                
                http_response_code(201);
                echo json_encode(['id' => $hunt_id, 'weather' => $weather, 'message' => 'Hunt successfully created']);
            } catch (Exception $e) {
                $db->rollBack();
                throw $e;
            }
            break;
            
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Weather is refetched when date or hunting area change, or when none was fetched yet
            $stmt = $db->prepare("
                SELECT h.date, h.hunting_area_id, (SELECT COUNT(*) FROM weather_data WHERE hunt_id = h.id) as has_weather
                FROM hunts h WHERE h.id = ?
            ");
            $stmt->execute([$id]);
            $before = $stmt->fetch();
            
            $db->beginTransaction();
            
            try {
                list($seatId, $seatName) = resolveSeat($db, $data['seat_id'] ?? null, $data['hunting_area_id'] ?? null);

                // Update hunt
                $stmt = $db->prepare("
                    UPDATE hunts 
                    SET date = ?, hunting_area_id = ?, hunt_type = ?, seat_id = ?, seat = ?, time_from = ?, time_to = ?,
                        weather = ?, temperature = ?, notes = ?, costs = ?
                    WHERE id = ?
                ");
                $stmt->execute([
                    $data['date'] ?? date('Y-m-d'),
                    $data['hunting_area_id'] ?? null,
                    $data['hunt_type'] ?? 'Ansitz',
                    $seatId,
                    $seatName,
                    $data['time_from'] ?? null,
                    $data['time_to'] ?? null,
                    $data['weather'] ?? null,
                    $data['temperature'] ?? null,
                    $data['notes'] ?? null,
                    $data['costs'] ?? null,
                    $id
                ]);
                
                // Delete existing observed animals
                $stmt = $db->prepare("DELETE FROM observed_animals WHERE hunt_id = ?");
                $stmt->execute([$id]);
                
                // Add new observed animals
                if (isset($data['observed_animals']) && is_array($data['observed_animals'])) {
                    $stmt = $db->prepare("
                        INSERT INTO observed_animals (hunt_id, animal_species_id, quantity, notes) 
                        VALUES (?, ?, ?, ?)
                    ");
                    foreach ($data['observed_animals'] as $animal) {
                        $stmt->execute([
                            $id,
                            $animal['animal_species_id'],
                            $animal['quantity'] ?? 1,
                            $animal['notes'] ?? null
                        ]);
                    }
                }
                
                // Delete existing harvested animals
                $stmt = $db->prepare("DELETE FROM harvested_animals WHERE hunt_id = ?");
                $stmt->execute([$id]);
                
                // Add new harvested animals
                if (isset($data['harvested_animals']) && is_array($data['harvested_animals'])) {
                    $stmt = $db->prepare("
                        INSERT INTO harvested_animals (hunt_id, animal_species_id, quantity, weight, shot_distance, notes) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    ");
                    foreach ($data['harvested_animals'] as $animal) {
                        $stmt->execute([
                            $id,
                            $animal['animal_species_id'],
                            $animal['quantity'] ?? 1,
                            $animal['weight'] ?? null,
                            $animal['shot_distance'] ?? null,
                            $animal['notes'] ?? null
                        ]);
                    }
                }
                
                $db->commit();
                
                $weather = 'unchanged';
                if ($before && (!$before['has_weather']
                        || $before['date'] !== ($data['date'] ?? null)
                        || (int)$before['hunting_area_id'] !== (int)($data['hunting_area_id'] ?? 0))) {
                    require_once __DIR__ . '/weather.php';
                    $weather = updateWeatherForHunt($db, $id);
                }
                
                echo json_encode(['weather' => $weather, 'message' => 'Hunt successfully updated']);
            } catch (Exception $e) {
                $db->rollBack();
                throw $e;
            }
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $stmt = $db->prepare("DELETE FROM hunts WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['message' => 'Hunt successfully deleted']);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

