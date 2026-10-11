<?php
/**
 * Handler for Seats (Sitzverwaltung)
 */

function handleSeats($method, $id) {
    $db = getDBConnection();
    
    switch ($method) {
        case 'GET':
            if ($id) {
                // Single seat with statistics
                $stmt = $db->prepare("
                    SELECT s.*, ha.name as hunting_area_name 
                    FROM seats s
                    LEFT JOIN hunting_areas ha ON s.hunting_area_id = ha.id
                    WHERE s.id = ?
                ");
                $stmt->execute([$id]);
                $seat = $stmt->fetch();
                
                if (!$seat) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Seat not found']);
                    return;
                }
                
                // Decode JSON fields
                if ($seat['shot_directions']) {
                    $seat['shot_directions'] = json_decode($seat['shot_directions'], true);
                }
                
                // Get statistics for this seat
                $stmt = $db->prepare("
                    SELECT 
                        COUNT(*) as hunt_count,
                        COALESCE(SUM(obs.observed_count), 0) as total_observed,
                        COALESCE(SUM(harv.harvested_count), 0) as total_harvested
                    FROM hunts h
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as observed_count
                        FROM observed_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) obs ON h.id = obs.hunt_id
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as harvested_count
                        FROM harvested_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) harv ON h.id = harv.hunt_id
                    WHERE h.seat_id = ?
                ");
                $stmt->execute([$seat['id']]);
                $stats = $stmt->fetch();
                
                $seat['statistics'] = $stats;
                
                // Get list of hunts from this seat
                $stmt = $db->prepare("
                    SELECT 
                        h.id,
                        h.date,
                        h.time_from,
                        COALESCE(obs.observed_count, 0) as observed_count,
                        COALESCE(harv.harvested_count, 0) as harvested_count
                    FROM hunts h
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as observed_count
                        FROM observed_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) obs ON h.id = obs.hunt_id
                    LEFT JOIN (
                        SELECT hunt_id, SUM(quantity) as harvested_count
                        FROM harvested_animals
                        WHERE quantity > 0
                        GROUP BY hunt_id
                    ) harv ON h.id = harv.hunt_id
                    WHERE h.seat_id = ?
                    ORDER BY h.date DESC, h.time_from DESC
                ");
                $stmt->execute([$seat['id']]);
                $hunts = $stmt->fetchAll();

                // Animals per hunt for the per-species tables on the details page
                $animalsByHunt = ['observed_animals' => [], 'harvested_animals' => []];
                if ($hunts) {
                    $placeholders = implode(',', array_fill(0, count($hunts), '?'));
                    $huntIds = array_column($hunts, 'id');
                    foreach (array_keys($animalsByHunt) as $table) {
                        $stmt = $db->prepare("
                            SELECT a.*, aspec.name as animal_species_name
                            FROM $table a
                            LEFT JOIN animal_species aspec ON a.animal_species_id = aspec.id
                            WHERE a.hunt_id IN ($placeholders)
                        ");
                        $stmt->execute($huntIds);
                        foreach ($stmt->fetchAll() as $animal) {
                            $animalsByHunt[$table][$animal['hunt_id']][] = $animal;
                        }
                    }
                }
                foreach ($hunts as &$hunt) {
                    $hunt['observed_animals'] = $animalsByHunt['observed_animals'][$hunt['id']] ?? [];
                    $hunt['harvested_animals'] = $animalsByHunt['harvested_animals'][$hunt['id']] ?? [];
                }
                unset($hunt);
                $seat['hunts'] = $hunts;
                
                echo json_encode($seat);
            } else {
                // List all seats (optionally filtered by hunting_area_id)
                $hunting_area_id = $_GET['hunting_area_id'] ?? null;
                
                $sql = "
                    SELECT s.*, ha.name as hunting_area_name 
                    FROM seats s
                    LEFT JOIN hunting_areas ha ON s.hunting_area_id = ha.id
                    WHERE 1=1
                ";
                $params = [];
                
                if ($hunting_area_id) {
                    $sql .= " AND s.hunting_area_id = ?";
                    $params[] = $hunting_area_id;
                }
                
                $sql .= " ORDER BY ha.name, s.name";
                
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
                $seats = $stmt->fetchAll();
                
                // Decode JSON fields
                foreach ($seats as &$seat) {
                    if ($seat['shot_directions']) {
                        $seat['shot_directions'] = json_decode($seat['shot_directions'], true);
                    }
                }
                
                echo json_encode($seats);
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Encode shot_directions as JSON
            $shot_directions = null;
            if (isset($data['shot_directions']) && is_array($data['shot_directions'])) {
                $shot_directions = json_encode($data['shot_directions']);
            }
            
            $stmt = $db->prepare("
                INSERT INTO seats (hunting_area_id, name, type, latitude, longitude, view_direction, shot_directions, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['hunting_area_id'] ?? null,
                $data['name'] ?? '',
                $data['type'] ?? 'Kanzel',
                $data['latitude'] ?? null,
                $data['longitude'] ?? null,
                $data['view_direction'] ?? null,
                $shot_directions,
                $data['notes'] ?? null
            ]);
            
            $seat_id = $db->lastInsertId();
            
            http_response_code(201);
            echo json_encode(['id' => $seat_id, 'message' => 'Seat successfully created']);
            break;
            
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Encode shot_directions as JSON
            $shot_directions = null;
            if (isset($data['shot_directions']) && is_array($data['shot_directions'])) {
                $shot_directions = json_encode($data['shot_directions']);
            }
            
            $stmt = $db->prepare("
                UPDATE seats 
                SET hunting_area_id = ?, name = ?, type = ?, latitude = ?, longitude = ?, 
                    view_direction = ?, shot_directions = ?, notes = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $data['hunting_area_id'] ?? null,
                $data['name'] ?? '',
                $data['type'] ?? 'Kanzel',
                $data['latitude'] ?? null,
                $data['longitude'] ?? null,
                $data['view_direction'] ?? null,
                $shot_directions,
                $data['notes'] ?? null,
                $id
            ]);

            // Keep the seat name shown on the hunts in sync after a rename
            $stmt = $db->prepare("UPDATE hunts SET seat = ? WHERE seat_id = ?");
            $stmt->execute([$data['name'] ?? '', $id]);

            echo json_encode(['message' => 'Seat successfully updated']);
            break;
            
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID required']);
                return;
            }
            
            $stmt = $db->prepare("DELETE FROM seats WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['message' => 'Seat successfully deleted']);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}
