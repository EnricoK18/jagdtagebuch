<?php
/**
 * API Router for Hunting Database
 */

// Error reporting for debugging (remove in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');
// No CORS headers: the API is only used by the app's own pages (same origin)

require_once __DIR__ . '/../config/database.php';

// API Routing
$request_uri = $_SERVER['REQUEST_URI'];
$request_method = $_SERVER['REQUEST_METHOD'];

// Check if resource is provided via query parameter (fallback)
if (isset($_GET['resource'])) {
    $resource = $_GET['resource'];
    $id = $_GET['id'] ?? null;
} else {
    // Parse from URL path
    $path = parse_url($request_uri, PHP_URL_PATH);
    $path = trim($path, '/');
    $path_parts = explode('/', $path);

    // Find and remove everything up to and including 'api'
    $api_index = array_search('api', $path_parts);
    if ($api_index !== false) {
        $path_parts = array_slice($path_parts, $api_index + 1);
    }

    $resource = $path_parts[0] ?? '';
    $id = $path_parts[1] ?? null;
}

try {
    if (empty($resource)) {
        http_response_code(400);
        echo json_encode(['error' => 'No resource specified']);
        exit;
    }

    switch ($resource) {
        case 'hunting-areas':
            require_once __DIR__ . '/handlers/hunting_areas.php';
            handleHuntingAreas($request_method, $id);
            break;
            
        case 'animal-species':
            require_once __DIR__ . '/handlers/animal_species.php';
            handleAnimalSpecies($request_method, $id);
            break;
            
        case 'hunts':
            require_once __DIR__ . '/handlers/hunts.php';
            handleHunts($request_method, $id);
            break;
            
        case 'observed-animals':
            require_once __DIR__ . '/handlers/observed_animals.php';
            handleObservedAnimals($request_method, $id);
            break;
            
        case 'harvested-animals':
            require_once __DIR__ . '/handlers/harvested_animals.php';
            handleHarvestedAnimals($request_method, $id);
            break;
            
        case 'reports':
            require_once __DIR__ . '/handlers/reports.php';
            handleReports($request_method, $id);
            break;
            
        case 'hunting-seasons':
            require_once __DIR__ . '/handlers/hunting_seasons.php';
            handleHuntingSeasons($request_method, $id);
            break;
            
        case 'weather':
            require_once __DIR__ . '/handlers/weather.php';
            handleWeather($request_method, $id);
            break;
            
        case 'seats':
            require_once __DIR__ . '/handlers/seats.php';
            handleSeats($request_method, $id);
            break;
            
        case 'backup':
            require_once __DIR__ . '/handlers/backup.php';
            handleBackup($request_method);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Resource not found: ' . $resource]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    // Log full error details, but don't expose SQL or file paths to the client
    error_log("API Error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    echo json_encode(['error' => 'Interner Serverfehler. Details stehen im PHP-Fehlerlog.']);
}
