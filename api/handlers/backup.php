<?php
/**
 * Handler for Backup: export and import of all data as JSON.
 * Same format as the offline app (mobile/js/db.js), so data can move between web app and phone.
 */

// Tables in insert order (parents before children)
const BACKUP_TABLES = ['hunting_areas', 'animal_species', 'seats', 'hunts',
    'observed_animals', 'harvested_animals', 'weather_data'];

function handleBackup($method) {
    $db = getDBConnection();

    switch ($method) {
        case 'GET':
            $backup = createBackup($db);
            header('Content-Disposition: attachment; filename="jagdtagebuch_sicherung_' . date('Y-m-d_Hi') . '.json"');
            echo json_encode($backup, JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            $backup = json_decode(file_get_contents('php://input'), true);
            if (!is_array($backup) || ($backup['format'] ?? '') !== 'jagddatenbank-backup' || !is_array($backup['tables'] ?? null)) {
                http_response_code(400);
                echo json_encode(['error' => 'Das ist keine Sicherung des Jagdtagebuchs.']);
                return;
            }

            // Keep the current data on the server before replacing it
            $backupDir = __DIR__ . '/../../database/backups';
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0775, true);
            }
            $savedAs = 'vor_import_' . date('Y-m-d_His') . '.json';
            file_put_contents("$backupDir/$savedAs", json_encode(createBackup($db), JSON_UNESCAPED_UNICODE));

            try {
                $counts = restoreBackup($db, $backup['tables']);
            } catch (Exception $e) {
                http_response_code(400);
                error_log('Backup import failed: ' . $e->getMessage());
                echo json_encode(['error' => 'Import fehlgeschlagen, es wurde nichts geändert: ' . $e->getMessage()]);
                return;
            }

            echo json_encode([
                'message' => 'Import fertig',
                'counts' => $counts,
                'previous_data' => "database/backups/$savedAs"
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

function createBackup($db) {
    $tables = [];
    foreach (BACKUP_TABLES as $table) {
        $tables[$table] = $db->query("SELECT * FROM $table ORDER BY id")->fetchAll();
    }
    return [
        'format' => 'jagddatenbank-backup',
        'version' => 1,
        'source' => 'web',
        'exported_at' => date('c'),
        'tables' => $tables
    ];
}

/**
 * Replace all data with the backup's rows (ids are kept, so the references stay intact)
 */
function restoreBackup($db, $tables) {
    $counts = [];
    // DELETE instead of TRUNCATE: TRUNCATE commits implicitly and can't be rolled back
    $db->beginTransaction();
    try {
        foreach (array_reverse(BACKUP_TABLES) as $table) {
            $db->exec("DELETE FROM $table");
        }
        foreach (BACKUP_TABLES as $table) {
            $columns = $db->query("SHOW COLUMNS FROM $table")->fetchAll(PDO::FETCH_COLUMN);
            $rows = $tables[$table] ?? [];
            foreach ($rows as $row) {
                $cols = array_values(array_filter($columns, fn($c) => array_key_exists($c, $row)));
                $sql = "INSERT INTO $table (`" . implode('`, `', $cols) . "`) VALUES ("
                    . implode(', ', array_fill(0, count($cols), '?')) . ")";
                $values = array_map(fn($c) => is_array($row[$c]) ? json_encode($row[$c]) : $row[$c], $cols);
                $db->prepare($sql)->execute($values);
            }
            $counts[$table] = count($rows);
        }
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    return $counts;
}
