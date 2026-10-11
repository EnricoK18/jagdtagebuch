<?php
/**
 * Handler for Hunting Areas
 */

function handleHuntingAreas($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                // Single hunting area
                $stmt = $db->prepare("SELECT * FROM hunting_areas WHERE id = ?");
                $stmt->execute([$id]);
                $huntingArea = $stmt->fetch();
                
                if (!$huntingArea) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Hunting area not found']);
                    return;
                }
                
                echo json_encode($huntingArea);
            } else {
                // All hunting areas
                $stmt = $db->query("SELECT * FROM hunting_areas ORDER BY name");
                $huntingAreas = $stmt->fetchAll();
                echo json_encode($huntingAreas);
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                INSERT INTO hunting_areas (name, description, area_size, latitude, longitude) 
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['description'] ?? null,
                $data['area_size'] ?? null,
                $data['latitude'] ?? null,
                $data['longitude'] ?? null
            ]);
            
            $id = $db->lastInsertId();
            http_response_code(201);
            echo json_encode(['id' => $id, 'message' => 'Hunting area successfully created']);
            break;
            
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            
            $stmt = $db->prepare("
                UPDATE hunting_areas 
                SET name = ?, description = ?, area_size = ?, latitude = ?, longitude = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['description'] ?? null,
                $data['area_size'] ?? null,
                $data['latitude'] ?? null,
                $data['longitude'] ?? null,
                $id
            ]);
            
            echo json_encode(['message' => 'Hunting area successfully updated']);
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            // Hunts reference the hunting area with ON DELETE RESTRICT
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM hunts WHERE hunting_area_id = ?");
            $stmt->execute([$id]);
            $huntCount = (int)$stmt->fetch()['count'];
            if ($huntCount > 0) {
                http_response_code(409); // Conflict
                echo json_encode(['error' => 'Dieses Revier kann nicht gelöscht werden, da noch ' . $huntCount . ($huntCount === 1 ? ' Jagd' : ' Jagden') . ' darauf eingetragen ' . ($huntCount === 1 ? 'ist' : 'sind') . '.']);
                return;
            }

            $stmt = $db->prepare("DELETE FROM hunting_areas WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['message' => 'Hunting area successfully deleted']);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

