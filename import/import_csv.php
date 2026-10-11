<?php
/**
 * CSV Import Script for Hunting Database
 */

require_once __DIR__ . '/../config/database.php';

// Set execution time limit for large files
set_time_limit(300);

// Animal names as written in the CSV (lowercase) to species names in the database.
// General terms ("Rehe", "Schweine") map to the general species, specific ones to the specific species.
$animalMappings = [
    'reh' => 'Rehwild', 'rehe' => 'Rehwild', 'reh?' => 'Rehwild', 'rehwild' => 'Rehwild',
    'bock' => 'Rehwild - Bock', 'böcke' => 'Rehwild - Bock',
    'ricke' => 'Rehwild - Ricke', 'ricken' => 'Rehwild - Ricke',
    'kitz' => 'Rehwild - Kitz', 'kitze' => 'Rehwild - Kitz', 'kitzen' => 'Rehwild - Kitz', 'kitzbock' => 'Rehwild - Kitz',
    'schmalreh' => 'Rehwild - Schmalreh', 'schmalrehe' => 'Rehwild - Schmalreh', 'sr' => 'Rehwild - Schmalreh',
    'jährling' => 'Rehwild - Jährling', 'jährlinge' => 'Rehwild - Jährling',
    'sau' => 'Schwarzwild', 'sauen' => 'Schwarzwild', 'schwein' => 'Schwarzwild', 'schweine' => 'Schwarzwild',
    'wildschwein' => 'Schwarzwild', 'schwarzwild' => 'Schwarzwild',
    'keiler' => 'Schwarzwild - Keiler', 'bache' => 'Schwarzwild - Bache',
    'frischling' => 'Schwarzwild - Frischling', 'frischlinge' => 'Schwarzwild - Frischling', 'frili' => 'Schwarzwild - Frischling',
    'ükeiler' => 'Schwarzwild - Überläufer-Keiler', 'ukeiler' => 'Schwarzwild - Überläufer-Keiler',
    'überläufer-keiler' => 'Schwarzwild - Überläufer-Keiler',
    'übache' => 'Schwarzwild - Überläufer-Bache', 'überläufer-bache' => 'Schwarzwild - Überläufer-Bache',
    'rotwild' => 'Rotwild', 'hirsch' => 'Rotwild - Hirsch', 'alttier' => 'Rotwild - Alttier', 'kalb' => 'Rotwild - Kalb',
    'fuchs' => 'Fuchs', 'hase' => 'Hase', 'dachs' => 'Dachs', 'waschbär' => 'Waschbär',
    'fasan' => 'Fasan', 'ente' => 'Ente'
];

/**
 * Map a CSV animal name to the database species name (unknown names are kept as written)
 */
function mapAnimalName($name) {
    global $animalMappings;
    $name = trim($name);
    return $animalMappings[mb_strtolower($name, 'UTF-8')] ?? $name;
}

/**
 * Whether a CSV animal name is plural ("Rehe", "Kitze") and so stands for several animals
 */
function isPluralAnimal($name) {
    $plurals = ['rehe', 'böcke', 'ricken', 'kitze', 'kitzen', 'schmalrehe', 'jährlinge',
                'sauen', 'schweine', 'frischlinge'];
    return in_array(mb_strtolower(trim($name), 'UTF-8'), $plurals);
}

/**
 * Parse a quantity like "3" or "10+14"
 */
function parseQuantity($text) {
    preg_match_all('/\d+/', (string)$text, $matches);
    return array_sum(array_map('intval', $matches[0]));
}

/**
 * Parse animal names from text, e.g. "Bock, Kitz, Kitz", "2 x Bock, 1 x Ricke", "Ricke mit 2 Kitzen".
 * Animals without their own count share the rest of $quantity equally (remainder goes to the first ones),
 * so "Rehe, Schweine" with 20 becomes 10 Rehwild + 10 Schwarzwild. Returns [['name' => ..., 'quantity' => ...]].
 */
function parseAnimals($text, $quantity = null) {
    $text = trim((string)$text);
    if ($text === '') {
        return [];
    }

    $items = []; // [name, count or null]
    $rawNames = []; // item index => name as written, for items without count
    foreach (preg_split('/[,;+]/', $text) as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        if (preg_match('/^(.+?)\s+mit\s+(\d+)\s+(\S+)$/iu', $part, $m)) {
            // "Ricke mit 2 Kitzen"
            $items[] = [mapAnimalName($m[1]), 1];
            $items[] = [mapAnimalName($m[3]), (int)$m[2]];
        } elseif (preg_match('/^(\d+)\s*(?:x\s*)?(\D.*)$/iu', $part, $m)) {
            // "2 x Bock" or "2 Kitze"
            $items[] = [mapAnimalName($m[2]), (int)$m[1]];
        } else {
            $rawNames[count($items)] = $part;
            $items[] = [mapAnimalName($part), null];
        }
    }

    // Distribute the remaining total equally over animals without their own count. If some of them are
    // written in plural ("Bock, Rehe"), the singular ones count as 1 and the plural ones share the rest.
    $open = array_keys(array_filter($items, fn($i) => $i[1] === null));
    $plural = array_values(array_filter($open, fn($key) => isPluralAnimal($rawNames[$key])));
    if ($plural && count($plural) < count($open)) {
        foreach (array_diff($open, $plural) as $key) {
            $items[$key][1] = 1;
        }
        $open = $plural;
    }
    if ($open) {
        $explicit = array_sum(array_map(fn($i) => $i[1] ?? 0, $items));
        $rest = max(0, parseQuantity($quantity) - $explicit);
        $base = intdiv($rest, count($open));
        $remainder = $rest % count($open);
        foreach ($open as $n => $key) {
            $items[$key][1] = max(1, $base + ($n < $remainder ? 1 : 0));
        }
    }

    // One entry per species
    $animals = [];
    foreach ($items as [$name, $count]) {
        if ($count > 0) {
            $animals[$name] = ($animals[$name] ?? 0) + $count;
        }
    }
    $result = [];
    foreach ($animals as $name => $count) {
        $result[] = ['name' => $name, 'quantity' => $count];
    }
    return $result;
}

/**
 * Convert time string to time range
 */
function convertTime($timeStr) {
    $timeStr = strtolower(trim($timeStr));
    
    // Same times the UI uses for each time of day (see getTimeOfDay in js/app.js)
    $times = [
        'morgens' => '08:00:00',
        'mittags' => '13:00:00',
        'abends' => '18:00:00',
        'nachts' => '22:00:00'
    ];

    if (isset($times[$timeStr])) {
        return ['from' => $times[$timeStr], 'to' => null];
    }
    
    return ['from' => null, 'to' => null];
}

/**
 * Convert date from DD.MM.YY or DD.MM.YYYY to YYYY-MM-DD
 */
function convertDate($dateStr) {
    if (empty($dateStr)) {
        return null;
    }
    
    // Remove any whitespace
    $dateStr = trim($dateStr);
    
    // Try to parse date
    $parts = explode('.', $dateStr);
    if (count($parts) === 3) {
        $day = (int)trim($parts[0]);
        $month = (int)trim($parts[1]);
        $year = (int)trim($parts[2]);
        
        // Handle two-digit years (assume 2000-2099)
        if ($year < 100) {
            $year += 2000;
        }
        
        // Validate date components
        if ($day < 1 || $day > 31 || $month < 1 || $month > 12 || $year < 1900 || $year > 2100) {
            return null;
        }
        
        // Validate actual date (e.g., check if Feb 30 is invalid)
        if (!checkdate($month, $day, $year)) {
            return null;
        }
        
        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }
    
    return null;
}

/**
 * Get or create hunting area
 */
function getOrCreateHuntingArea($db, $name) {
    if (empty($name)) {
        return null;
    }
    
    // Try to find existing
    $stmt = $db->prepare("SELECT id FROM hunting_areas WHERE name = ?");
    $stmt->execute([$name]);
    $area = $stmt->fetch();
    
    if ($area) {
        return $area['id'];
    }
    
    // Create new
    $stmt = $db->prepare("INSERT INTO hunting_areas (name) VALUES (?)");
    $stmt->execute([$name]);
    return $db->lastInsertId();
}

/**
 * Get or create animal species
 */
function getOrCreateAnimalSpecies($db, $name) {
    if (empty($name)) {
        return null;
    }
    
    // Try to find existing
    $stmt = $db->prepare("SELECT id FROM animal_species WHERE name = ?");
    $stmt->execute([$name]);
    $species = $stmt->fetch();
    
    if ($species) {
        return $species['id'];
    }
    
    // Determine category
    $category = 'Wild';
    $baseName = explode(' - ', $name)[0]; // "Rehwild - Bock" -> "Rehwild"
    if (in_array($baseName, ['Rehwild', 'Rotwild', 'Schwarzwild'])) {
        $category = 'Schalenwild';
    } elseif (in_array($name, ['Fuchs', 'Dachs'])) {
        $category = 'Raubwild';
    } elseif (in_array($name, ['Fasan', 'Ente'])) {
        $category = 'Federwild';
    }
    
    // Create new
    $stmt = $db->prepare("INSERT INTO animal_species (name, category) VALUES (?, ?)");
    $stmt->execute([$name, $category]);
    return $db->lastInsertId();
}

// Main import function
function importCSV($csvFile) {
    $db = getDBConnection();
    $db->beginTransaction();
    
    try {
        $handle = fopen($csvFile, 'r');
        if (!$handle) {
            throw new Exception("Could not open CSV file: $csvFile");
        }
        
        // Read header
        $header = fgetcsv($handle, 1000, ';');
        if (!$header) {
            throw new Exception("Could not read CSV header");
        }
        
        // Clean header (remove BOM and whitespace)
        $header = array_map(function($h) {
            return trim($h, "\xEF\xBB\xBF \t\n\r\0\x0B");
        }, $header);
        
        // Map header to indices
        $headerMap = array_flip($header);
        
        // Debug: verify header mapping
        if (empty($headerMap['Datum']) && !isset($headerMap['Datum'])) {
            throw new Exception("Header 'Datum' not found. Available headers: " . implode(', ', $header));
        }
        
        $imported = 0;
        $skipped = 0;
        $errors = [];
        
        // Read data rows
        $lineNum = 1;
        while (($row = fgetcsv($handle, 1000, ';')) !== false) {
            $lineNum++;
            
            try {
                // Skip empty rows
                if (empty(array_filter($row, function($v) { return trim($v) !== ''; }))) {
                    continue;
                }
                
                // Ensure row has enough columns
                while (count($row) < count($header)) {
                    $row[] = '';
                }
                
                // Get values - handle potential encoding issues
                // Use array index if header map fails (fallback)
                $dateIndex = isset($headerMap['Datum']) ? $headerMap['Datum'] : 0;
                $revierIndex = isset($headerMap['Revier']) ? $headerMap['Revier'] : 2;
                
                $dateStr = isset($row[$dateIndex]) ? trim($row[$dateIndex]) : '';
                $date = convertDate($dateStr);
                $timeStr = isset($row[$headerMap['Zeit'] ?? 1]) ? trim($row[$headerMap['Zeit'] ?? 1]) : '';
                $revierName = isset($row[$revierIndex]) ? trim($row[$revierIndex]) : '';
                $seat = trim($row[$headerMap['Sitz']] ?? '');
                $huntType = trim($row[$headerMap['Jagdart']] ?? 'Ansitz');
                $harvestedWild = trim($row[$headerMap['Wild - Abschuss']] ?? '');
                $harvestedQuantity = trim($row[$headerMap['Anzahl - Abschuss']] ?? '');
                $observedWild = trim($row[$headerMap['Wild Anblick']] ?? '');
                $observedQuantity = trim($row[$headerMap['Anzahl - Anblick']] ?? '');
                $notes = trim($row[$headerMap['Bemerkung']] ?? '');
                $costs = trim($row[$headerMap['Kosten']] ?? '');

                // Rows up to hunting year 2020 were written before the "Flucht" column existed,
                // so their observed animals, count and notes sit one column to the left
                if ((int)($row[$headerMap['Jahr']] ?? 0) <= 2020) {
                    $observedWild = trim($row[$headerMap['Flucht']] ?? '');
                    $observedQuantity = trim($row[$headerMap['Wild Anblick']] ?? '');
                    $notes = trim($row[$headerMap['Anzahl - Anblick']] ?? '');
                }

                // Validate required fields
                if (empty($date)) {
                    $skipped++;
                    $errors[] = "Line $lineNum: Missing or invalid date (raw: '$dateStr')";
                    continue;
                }
                
                if (empty($revierName)) {
                    $skipped++;
                    $errors[] = "Line $lineNum: Missing revier name (date: '$dateStr')";
                    continue;
                }
                
                // Get or create hunting area
                $huntingAreaId = getOrCreateHuntingArea($db, $revierName);
                if (!$huntingAreaId) {
                    $skipped++;
                    $errors[] = "Line $lineNum: Could not create hunting area";
                    continue;
                }
                
                // Convert time
                $timeRange = convertTime($timeStr);
                
                // Convert costs
                $costsValue = null;
                if (!empty($costs)) {
                    $costsValue = str_replace(',', '.', $costs);
                    $costsValue = preg_replace('/[^0-9.]/', '', $costsValue);
                    $costsValue = !empty($costsValue) ? (float)$costsValue : null;
                }
                
                // Insert hunt
                $stmt = $db->prepare("
                    INSERT INTO hunts (date, hunting_area_id, hunt_type, seat, time_from, time_to, notes, costs)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $date,
                    $huntingAreaId,
                    $huntType ?: 'Ansitz',
                    $seat ?: null,
                    $timeRange['from'],
                    $timeRange['to'],
                    $notes ?: null,
                    $costsValue
                ]);
                
                $huntId = $db->lastInsertId();
                
                // Add harvested animals
                if (!empty($harvestedWild)) {
                    $harvestedAnimals = parseAnimals($harvestedWild, $harvestedQuantity);
                    foreach ($harvestedAnimals as $animal) {
                        $speciesId = getOrCreateAnimalSpecies($db, $animal['name']);
                        if ($speciesId) {
                            $stmt = $db->prepare("
                                INSERT INTO harvested_animals (hunt_id, animal_species_id, quantity)
                                VALUES (?, ?, ?)
                            ");
                            $stmt->execute([$huntId, $speciesId, $animal['quantity']]);
                        }
                    }
                }
                
                // Add observed animals
                if (!empty($observedWild)) {
                    $observedAnimals = parseAnimals($observedWild, $observedQuantity);
                    foreach ($observedAnimals as $animal) {
                        $speciesId = getOrCreateAnimalSpecies($db, $animal['name']);
                        if ($speciesId) {
                            $stmt = $db->prepare("
                                INSERT INTO observed_animals (hunt_id, animal_species_id, quantity)
                                VALUES (?, ?, ?)
                            ");
                            $stmt->execute([$huntId, $speciesId, $animal['quantity']]);
                        }
                    }
                }
                
                $imported++;
                
            } catch (Exception $e) {
                $skipped++;
                $errors[] = "Line $lineNum: " . $e->getMessage();
            }
        }
        
        fclose($handle);
        
        $db->commit();
        
        return [
            'success' => true,
            'imported' => $imported,
            'skipped' => $skipped,
            'errors' => $errors
        ];
        
    } catch (Exception $e) {
        $db->rollBack();
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

// Run import if called directly (not when included for its functions)
$calledDirectly = realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__);
if ($calledDirectly && (php_sapi_name() === 'cli' || isset($_GET['run']))) {
    if (php_sapi_name() !== 'cli') {
        header('Content-Type: text/plain; charset=utf-8');
    }

    $csvFile = __DIR__ . '/../Jagdtagebuch.csv';

    if (!file_exists($csvFile)) {
        die("CSV file not found: $csvFile\n");
    }

    // The import doesn't detect duplicates, so running it twice would duplicate every hunt
    $huntCount = (int)getDBConnection()->query("SELECT COUNT(*) FROM hunts")->fetchColumn();
    if ($huntCount > 0 && !in_array('--force', $argv ?? [])) {
        die("Import abgebrochen: Die Datenbank enthält bereits $huntCount Jagden, ein erneuter Import würde sie doppelt anlegen.\n"
            . "Wer das wirklich will, startet den Import auf dem Server mit: php import/import_csv.php --force\n");
    }
    
    echo "Starting CSV import...\n";
    $result = importCSV($csvFile);
    
    if ($result['success']) {
        echo "Import completed!\n";
        echo "Imported: {$result['imported']} hunts\n";
        echo "Skipped: {$result['skipped']} rows\n";
        
        if (!empty($result['errors'])) {
            echo "\nErrors:\n";
            foreach ($result['errors'] as $error) {
                echo "  - $error\n";
            }
        }
    } else {
        echo "Import failed: {$result['error']}\n";
        if (php_sapi_name() === 'cli') {
            exit(1);
        }
    }
}

