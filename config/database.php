<?php
/**
 * Database Configuration
 * The access data lives in config.php (copy of config.example.php, not in Git)
 */

if (!file_exists(__DIR__ . '/config.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    die(json_encode(['error' => 'config/config.php fehlt: config/config.example.php kopieren und die Zugangsdaten eintragen.']));
}
require_once __DIR__ . '/config.php';

define('DB_CHARSET', 'utf8mb4');

/**
 * Get database connection
 */
function getDBConnection() {
    static $conn = null;
    
    if ($conn === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            
            $conn = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            // Check if database doesn't exist
            if (strpos($e->getMessage(), 'Unknown database') !== false) {
                throw new Exception('Database "' . DB_NAME . '" does not exist. Please import database/schema.sql into it.');
            }
            throw new Exception('Database connection failed: ' . $e->getMessage());
        }
    }
    
    return $conn;
}
