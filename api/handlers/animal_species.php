<?php
/**
 * Handler for Animal Species
 */

function handleAnimalSpecies($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                $stmt = $db->prepare("SELECT * FROM animal_species WHERE id = ?");
                $stmt->execute([$id]);
                $animalSpecies = $stmt->fetch();
                
                if (!$animalSpecies) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Animal species not found']);
                    return;
                }
                
                echo json_encode($animalSpecies);
            } else {
                $category = $_GET['category'] ?? null;
                
                if ($category) {
                    $stmt = $db->prepare("SELECT * FROM animal_species WHERE category = ? ORDER BY name");
                    $stmt->execute([$category]);
                } else {
                    $stmt = $db->query("SELECT * FROM animal_species ORDER BY category, name");
                }
                
                $animalSpecies = $stmt->fetchAll();
                echo json_encode($animalSpecies);
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                INSERT INTO animal_species (name, scientific_name, category, description) 
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['scientific_name'] ?? null,
                $data['category'] ?? 'Wild',
                $data['description'] ?? null
            ]);
            
            $id = $db->lastInsertId();
            http_response_code(201);
            echo json_encode(['id' => $id, 'message' => 'Animal species successfully created']);
            break;
            
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                UPDATE animal_species 
                SET name = ?, scientific_name = ?, category = ?, description = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['scientific_name'] ?? null,
                $data['category'] ?? 'Wild',
                $data['description'] ?? null,
                $id
            ]);
            
            echo json_encode(['message' => 'Animal species successfully updated']);
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            // Check if there are any references to this animal species
            $stmt = $db->prepare("
                SELECT COUNT(*) as count 
                FROM observed_animals 
                WHERE animal_species_id = ?
            ");
            $stmt->execute([$id]);
            $observedCount = $stmt->fetch()['count'];
            
            $stmt = $db->prepare("
                SELECT COUNT(*) as count 
                FROM harvested_animals 
                WHERE animal_species_id = ?
            ");
            $stmt->execute([$id]);
            $harvestedCount = $stmt->fetch()['count'];
            
            if ($observedCount > 0 || $harvestedCount > 0) {
                http_response_code(409); // Conflict
                $message = 'Diese Tierart kann nicht gelöscht werden, da sie noch in ';
                $parts = [];
                if ($observedCount > 0) {
                    $parts[] = "$observedCount " . ($observedCount === 1 ? 'gesehenem Tier' : 'gesehenen Tieren');
                }
                if ($harvestedCount > 0) {
                    $parts[] = "$harvestedCount " . ($harvestedCount === 1 ? 'erlegtem Tier' : 'erlegten Tieren');
                }
                $message .= implode(' und ', $parts) . ' verwendet wird.';
                echo json_encode(['error' => $message]);
                return;
            }
            
            // Try to delete - this should be prevented by Foreign Key constraint anyway
            try {
                $stmt = $db->prepare("DELETE FROM animal_species WHERE id = ?");
                $stmt->execute([$id]);
                
                if ($stmt->rowCount() === 0) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Animal species not found']);
                    return;
                }
                
                echo json_encode(['message' => 'Animal species successfully deleted']);
            } catch (PDOException $e) {
                // Foreign key constraint violation
                if ($e->getCode() == 23000) {
                    http_response_code(409);
                    echo json_encode(['error' => 'Diese Tierart kann nicht gelöscht werden, da sie noch verwendet wird.']);
                } else {
                    throw $e;
                }
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

