<?php
/**
 * Handler for Reports
 */

require_once __DIR__ . '/../helpers/hunting_season.php';

function handleReports($method, $type) {
    $db = getDBConnection();
    
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Only GET allowed']);
        return;
    }
    
    switch ($type) {
        case 'by-hunting-area':
            $seasonYear = $_GET['season_year'] ?? null;
            $hunting_area_id = $_GET['hunting_area_id'] ?? null;
            
            // Build SQL with actual values for subqueries to avoid parameter issues
            $conditions = function ($alias) use ($db, $seasonYear, $hunting_area_id) {
                $parts = [];
                if ($seasonYear) {
                    $start = $db->quote(getHuntingSeasonStart($seasonYear));
                    $end = $db->quote(getHuntingSeasonEnd($seasonYear));
                    $parts[] = "($alias.date >= $start AND $alias.date <= $end)";
                }
                if ($hunting_area_id) {
                    $parts[] = "$alias.hunting_area_id = " . $db->quote($hunting_area_id);
                }
                return $parts;
            };
            $whereFor = function ($alias) use ($conditions) {
                $parts = $conditions($alias);
                return $parts ? ' WHERE ' . implode(' AND ', $parts) : '';
            };

            $obsSeasonFilter = $whereFor('h2');
            $harvSeasonFilter = $whereFor('h3');
            $successFilter = $whereFor('h4');
            $mainJoinParts = $conditions('h');
            $mainJoinCondition = $mainJoinParts ? ' AND ' . implode(' AND ', $mainJoinParts) : '';
            $whereClause = $hunting_area_id ? ' WHERE ha.id = ' . $db->quote($hunting_area_id) : '';
            
            $sql = "
                SELECT 
                    ha.id as hunting_area_id,
                    ha.name as hunting_area_name,
                    COUNT(DISTINCT h.id) as hunt_count,
                    COALESCE(obs_sum.observed_count, 0) as observed_count,
                    COALESCE(harv_sum.harvested_count, 0) as harvested_count,
                    COALESCE(harv_sum.total_harvested_quantity, 0) as total_harvested_quantity,
                    COALESCE(harv_sum.total_weight, 0) as total_weight,
                    COALESCE(success.hunts_with_harvest, 0) as hunts_with_harvest,
                    COALESCE(success.hunts_with_observation, 0) as hunts_with_observation
                FROM hunting_areas ha
                LEFT JOIN hunts h ON ha.id = h.hunting_area_id" . $mainJoinCondition . "
                LEFT JOIN (
                    SELECT h2.hunting_area_id, SUM(oa.quantity) as observed_count
                    FROM hunts h2
                    INNER JOIN observed_animals oa ON h2.id = oa.hunt_id" . $obsSeasonFilter . "
                    GROUP BY h2.hunting_area_id
                ) obs_sum ON ha.id = obs_sum.hunting_area_id
                LEFT JOIN (
                    SELECT h3.hunting_area_id, 
                           COUNT(DISTINCT harv.id) as harvested_count,
                           SUM(harv.quantity) as total_harvested_quantity,
                           SUM(harv.weight) as total_weight
                    FROM hunts h3
                    INNER JOIN harvested_animals harv ON h3.id = harv.hunt_id" . $harvSeasonFilter . "
                    GROUP BY h3.hunting_area_id
                ) harv_sum ON ha.id = harv_sum.hunting_area_id
                LEFT JOIN (
                    SELECT 
                        h4.hunting_area_id,
                        COUNT(DISTINCT CASE WHEN harv2.id IS NOT NULL THEN h4.id END) as hunts_with_harvest,
                        COUNT(DISTINCT CASE WHEN oa2.id IS NOT NULL THEN h4.id END) as hunts_with_observation
                    FROM hunts h4
                    LEFT JOIN harvested_animals harv2 ON h4.id = harv2.hunt_id
                    LEFT JOIN observed_animals oa2 ON h4.id = oa2.hunt_id" . $successFilter . "
                    GROUP BY h4.hunting_area_id
                ) success ON ha.id = success.hunting_area_id" . $whereClause . "
                GROUP BY ha.id, ha.name ORDER BY ha.name
            ";
            
            $stmt = $db->query($sql);
            
            $result = $stmt->fetchAll();
            
            // Calculate success rates
            foreach ($result as &$row) {
                $huntCount = (int)$row['hunt_count'];
                if ($huntCount > 0) {
                    $row['success_rate_harvested'] = round(($row['hunts_with_harvest'] / $huntCount) * 100, 1);
                    $row['success_rate_observed'] = round(($row['hunts_with_observation'] / $huntCount) * 100, 1);
                } else {
                    $row['success_rate_harvested'] = 0;
                    $row['success_rate_observed'] = 0;
                }
            }
            
            echo json_encode($result);
            break;
            
        case 'by-year':
            $hunting_area_id = $_GET['hunting_area_id'] ?? null;
            
            // Build WHERE clause for filtering
            $whereClause = " WHERE 1=1";
            if ($hunting_area_id) {
                $whereClause .= " AND h.hunting_area_id = " . $db->quote($hunting_area_id);
            }
            
            // One row per hunt; subqueries avoid cartesian product issues
            $sql = "
                SELECT
                    h.date,
                    h.hunting_area_id,
                    1 as hunt_count,
                    COALESCE(obs.observed_count, 0) as observed_count,
                    COALESCE(harv.total_harvested_quantity, 0) as total_harvested_quantity,
                    COALESCE(harv.total_weight, 0) as total_weight,
                    CASE WHEN obs.observed_count > 0 THEN 1 ELSE 0 END as has_observation,
                    CASE WHEN harv.total_harvested_quantity > 0 THEN 1 ELSE 0 END as has_harvest
                FROM hunts h
                LEFT JOIN (
                    SELECT hunt_id, SUM(quantity) as observed_count
                    FROM observed_animals
                    GROUP BY hunt_id
                ) obs ON h.id = obs.hunt_id
                LEFT JOIN (
                    SELECT hunt_id, 
                           SUM(quantity) as total_harvested_quantity,
                           SUM(weight) as total_weight
                    FROM harvested_animals
                    GROUP BY hunt_id
                ) harv ON h.id = harv.hunt_id" . $whereClause . "
                ORDER BY h.date DESC
            ";
            
            $stmt = $db->query($sql);
            $rows = $stmt->fetchAll();
            
            // Group by hunting season year
            $result = [];
            foreach ($rows as $row) {
                $seasonYear = getHuntingSeasonYear($row['date']);
                if (!$seasonYear) {
                    continue;
                }
                
                if (!isset($result[$seasonYear])) {
                    $result[$seasonYear] = [
                        'season_year' => $seasonYear,
                        'hunt_count' => 0,
                        'hunting_area_count' => 0,
                        'observed_count' => 0,
                        'total_harvested_quantity' => 0,
                        'total_weight' => 0,
                        'hunts_with_observation' => 0,
                        'hunts_with_harvest' => 0,
                        'areas' => []
                    ];
                }
                
                $result[$seasonYear]['hunt_count'] += $row['hunt_count'];
                $result[$seasonYear]['observed_count'] += $row['observed_count'];
                $result[$seasonYear]['total_harvested_quantity'] += (float)($row['total_harvested_quantity'] ?? 0);
                $result[$seasonYear]['total_weight'] += (float)($row['total_weight'] ?? 0);
                $result[$seasonYear]['hunts_with_observation'] += $row['has_observation'];
                $result[$seasonYear]['hunts_with_harvest'] += $row['has_harvest'];
                
                // Collect actual hunting area IDs
                if ($row['hunting_area_id']) {
                    $result[$seasonYear]['areas'][] = $row['hunting_area_id'];
                }
            }
            
            // Calculate unique areas per season and success rates
            foreach ($result as &$season) {
                $season['hunting_area_count'] = count(array_unique($season['areas']));
                unset($season['areas']);
                
                // Calculate success rates
                $huntCount = (int)$season['hunt_count'];
                if ($huntCount > 0) {
                    $season['success_rate_harvested'] = round(($season['hunts_with_harvest'] / $huntCount) * 100, 1);
                    $season['success_rate_observed'] = round(($season['hunts_with_observation'] / $huntCount) * 100, 1);
                } else {
                    $season['success_rate_harvested'] = 0;
                    $season['success_rate_observed'] = 0;
                }
            }
            
            // Convert to array and sort by season year descending
            $result = array_values($result);
            usort($result, function($a, $b) {
                return strcmp($b['season_year'], $a['season_year']);
            });
            
            echo json_encode($result);
            break;
            
        case 'by-animal-species':
            $seasonYear = $_GET['season_year'] ?? null;
            $hunting_area_id = $_GET['hunting_area_id'] ?? null;
            
            // Build WHERE conditions for observed animals
            $observedWhere = [];
            $observedParams = [];
            
            if ($seasonYear) {
                $start = getHuntingSeasonStart($seasonYear);
                $end = getHuntingSeasonEnd($seasonYear);
                $observedWhere[] = "(h.date >= ? AND h.date <= ?)";
                $observedParams[] = $start;
                $observedParams[] = $end;
            }
            
            if ($hunting_area_id) {
                $observedWhere[] = "h.hunting_area_id = ?";
                $observedParams[] = $hunting_area_id;
            }
            
            $observedWhereClause = count($observedWhere) > 0 ? " WHERE " . implode(" AND ", $observedWhere) : "";
            
            // Build WHERE conditions for harvested animals (same as observed)
            $harvestedWhere = [];
            $harvestedParams = [];
            
            if ($seasonYear) {
                $start = getHuntingSeasonStart($seasonYear);
                $end = getHuntingSeasonEnd($seasonYear);
                $harvestedWhere[] = "(h.date >= ? AND h.date <= ?)";
                $harvestedParams[] = $start;
                $harvestedParams[] = $end;
            }
            
            if ($hunting_area_id) {
                $harvestedWhere[] = "h.hunting_area_id = ?";
                $harvestedParams[] = $hunting_area_id;
            }
            
            $harvestedWhereClause = count($harvestedWhere) > 0 ? " WHERE " . implode(" AND ", $harvestedWhere) : "";
            
            // Use UNION to combine observed and harvested data, then aggregate
            $sql = "
                SELECT 
                    aspec.id,
                    aspec.name as animal_species_name,
                    aspec.category,
                    COALESCE(obs.observed_hunt_count, 0) as observed_hunt_count,
                    COALESCE(obs.total_observed, 0) as total_observed,
                    COALESCE(harv.harvested_hunt_count, 0) as harvested_hunt_count,
                    COALESCE(harv.total_harvested, 0) as total_harvested,
                    COALESCE(harv.total_weight, 0) as total_weight,
                    COALESCE(harv.average_weight, 0) as average_weight
                FROM animal_species aspec
                LEFT JOIN (
                    SELECT 
                        oa.animal_species_id,
                        COUNT(DISTINCT oa.hunt_id) as observed_hunt_count,
                        SUM(oa.quantity) as total_observed
                    FROM observed_animals oa
                    INNER JOIN hunts h ON oa.hunt_id = h.id" . $observedWhereClause . "
                    GROUP BY oa.animal_species_id
                ) obs ON aspec.id = obs.animal_species_id
                LEFT JOIN (
                    SELECT 
                        harv.animal_species_id,
                        COUNT(DISTINCT harv.hunt_id) as harvested_hunt_count,
                        SUM(harv.quantity) as total_harvested,
                        SUM(harv.weight) as total_weight,
                        AVG(harv.weight) as average_weight
                    FROM harvested_animals harv
                    INNER JOIN hunts h ON harv.hunt_id = h.id" . $harvestedWhereClause . "
                    GROUP BY harv.animal_species_id
                ) harv ON aspec.id = harv.animal_species_id
                WHERE (obs.total_observed > 0 OR harv.total_harvested > 0)
                ORDER BY aspec.category, aspec.name
            ";
            
            // Combine parameters for both subqueries
            $params = array_merge($observedParams, $harvestedParams);
            
            if (!empty($params)) {
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            } else {
                $stmt = $db->query($sql);
            }
            
            $result = $stmt->fetchAll();
            echo json_encode($result);
            break;
            
        case 'monthly':
            $seasonYear = $_GET['season_year'] ?? null;
            $hunting_area_id = $_GET['hunting_area_id'] ?? null;
            
            $whereClause = " WHERE 1=1";
            
            // Only filter by season year if explicitly provided
            if ($seasonYear) {
                $start = getHuntingSeasonStart($seasonYear);
                $end = getHuntingSeasonEnd($seasonYear);
                $startEscaped = $db->quote($start);
                $endEscaped = $db->quote($end);
                $whereClause .= " AND (h.date >= $startEscaped AND h.date <= $endEscaped)";
            }
            
            if ($hunting_area_id) {
                $whereClause .= " AND h.hunting_area_id = " . $db->quote($hunting_area_id);
            }
            
            // Build filter conditions
            $filterConditions = [];
            $params = [];
            
            if ($seasonYear) {
                $start = getHuntingSeasonStart($seasonYear);
                $end = getHuntingSeasonEnd($seasonYear);
                $filterConditions[] = "(h.date >= ? AND h.date <= ?)";
                $params[] = $start;
                $params[] = $end;
            }
            
            if ($hunting_area_id) {
                $filterConditions[] = "h.hunting_area_id = ?";
                $params[] = $hunting_area_id;
            }
            
            $whereClause = count($filterConditions) > 0 ? " WHERE " . implode(" AND ", $filterConditions) : "";
            
            // Get hunt counts per month
            $sql = "
                SELECT 
                    MONTH(h.date) as month,
                    COUNT(DISTINCT h.id) as hunt_count
                FROM hunts h" . $whereClause . "
                GROUP BY MONTH(h.date)
            ";
            
            if (!empty($params)) {
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            } else {
                $stmt = $db->query($sql);
            }
            $huntCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get observed animals per month
            $sql = "
                SELECT 
                    MONTH(h.date) as month,
                    SUM(oa.quantity) as observed_count
                FROM hunts h
                INNER JOIN observed_animals oa ON h.id = oa.hunt_id" . $whereClause . "
                GROUP BY MONTH(h.date)
            ";
            
            if (!empty($params)) {
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            } else {
                $stmt = $db->query($sql);
            }
            $observedCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get harvested animals per month
            $sql = "
                SELECT 
                    MONTH(h.date) as month,
                    SUM(harv.quantity) as total_harvested_quantity
                FROM hunts h
                INNER JOIN harvested_animals harv ON h.id = harv.hunt_id" . $whereClause . "
                GROUP BY MONTH(h.date)
            ";
            
            if (!empty($params)) {
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            } else {
                $stmt = $db->query($sql);
            }
            $harvestedCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Combine results
            $result = [];
            foreach ($huntCounts as $row) {
                $month = $row['month'];
                $result[$month] = [
                    'month' => $month,
                    'hunt_count' => $row['hunt_count'],
                    'observed_count' => 0,
                    'total_harvested_quantity' => 0
                ];
            }
            
            foreach ($observedCounts as $row) {
                $month = $row['month'];
                if (!isset($result[$month])) {
                    $result[$month] = [
                        'month' => $month,
                        'hunt_count' => 0,
                        'observed_count' => 0,
                        'total_harvested_quantity' => 0
                    ];
                }
                $result[$month]['observed_count'] = (int)$row['observed_count'];
            }
            
            foreach ($harvestedCounts as $row) {
                $month = $row['month'];
                if (!isset($result[$month])) {
                    $result[$month] = [
                        'month' => $month,
                        'hunt_count' => 0,
                        'observed_count' => 0,
                        'total_harvested_quantity' => 0
                    ];
                }
                $result[$month]['total_harvested_quantity'] = (int)$row['total_harvested_quantity'];
            }
            
            // Sort by month
            ksort($result);
            $result = array_values($result);
            
            // Add month names and reorder for hunting season (April to March)
            $months = [
                1 => 'Januar', 2 => 'Februar', 3 => 'März', 4 => 'April',
                5 => 'Mai', 6 => 'Juni', 7 => 'Juli', 8 => 'August',
                9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Dezember'
            ];
            
            // Reorder: April (4) to March (3)
            $orderedResult = [];
            for ($m = 4; $m <= 12; $m++) {
                foreach ($result as $row) {
                    if ($row['month'] == $m) {
                        $row['month_name'] = $months[$m];
                        $orderedResult[] = $row;
                    }
                }
            }
            for ($m = 1; $m <= 3; $m++) {
                foreach ($result as $row) {
                    if ($row['month'] == $m) {
                        $row['month_name'] = $months[$m];
                        $orderedResult[] = $row;
                    }
                }
            }
            
            echo json_encode($orderedResult);
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Report type not found']);
            break;
    }
}

