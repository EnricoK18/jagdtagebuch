<?php
/**
 * Handler for Harvested Animals
 */

function handleHarvestedAnimals($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                $stmt = $db->prepare("
                    SELECT ha.*, aspec.name as animal_species_name, aspec.category
                    FROM harvested_animals ha
                    LEFT JOIN animal_species aspec ON ha.animal_species_id = aspec.id
                    WHERE ha.id = ?
                ");
                $stmt->execute([$id]);
                $animal = $stmt->fetch();
                
                if (!$animal) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Entry not found']);
                    return;
                }
                
                echo json_encode($animal);
            } else {
                $hunt_id = $_GET['hunt_id'] ?? null;
                
                if ($hunt_id) {
                    $stmt = $db->prepare("
                        SELECT ha.*, aspec.name as animal_species_name, aspec.category
                        FROM harvested_animals ha
                        LEFT JOIN animal_species aspec ON ha.animal_species_id = aspec.id
                        WHERE ha.hunt_id = ?
                        ORDER BY aspec.name
                    ");
                    $stmt->execute([$hunt_id]);
                } else {
                    $stmt = $db->query("
                        SELECT ha.*, aspec.name as animal_species_name, aspec.category
                        FROM harvested_animals ha
                        LEFT JOIN animal_species aspec ON ha.animal_species_id = aspec.id
                        ORDER BY ha.created_at DESC
                    ");
                }
                
                $animals = $stmt->fetchAll();
                echo json_encode($animals);
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                INSERT INTO harvested_animals (hunt_id, animal_species_id, quantity, weight, shot_distance, notes) 
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['hunt_id'] ?? null,
                $data['animal_species_id'] ?? null,
                $data['quantity'] ?? 1,
                $data['weight'] ?? null,
                $data['shot_distance'] ?? null,
                $data['notes'] ?? null
            ]);
            
            $id = $db->lastInsertId();
            http_response_code(201);
            echo json_encode(['id' => $id, 'message' => 'Entry successfully created']);
            break;
            
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                UPDATE harvested_animals 
                SET hunt_id = ?, animal_species_id = ?, quantity = ?, weight = ?, shot_distance = ?, notes = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $data['hunt_id'] ?? null,
                $data['animal_species_id'] ?? null,
                $data['quantity'] ?? 1,
                $data['weight'] ?? null,
                $data['shot_distance'] ?? null,
                $data['notes'] ?? null,
                $id
            ]);
            
            echo json_encode(['message' => 'Entry successfully updated']);
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $stmt = $db->prepare("DELETE FROM harvested_animals WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['message' => 'Entry successfully deleted']);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

