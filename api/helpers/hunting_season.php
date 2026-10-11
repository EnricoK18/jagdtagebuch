<?php
/**
 * Helper functions for hunting season calculations
 * Hunting season runs from April 1st to March 31st of the following year
 */

/**
 * Get hunting season year from a date
 * Returns format: "YYYY/YYYY+1" (e.g., "2020/2021")
 */
function getHuntingSeasonYear($date) {
    if (empty($date)) {
        return null;
    }
    
    // Convert to DateTime if string
    if (is_string($date)) {
        $date = new DateTime($date);
    }
    
    $year = (int)$date->format('Y');
    $month = (int)$date->format('m');
    
    // If month is January, February, or March, it belongs to the previous hunting season
    if ($month < 4) {
        $year--;
    }
    
    return $year . '/' . ($year + 1);
}

/**
 * Get start date of a hunting season
 * @param string $seasonYear Format: "YYYY/YYYY+1" (e.g., "2020/2021")
 * @return string Date in format YYYY-MM-DD
 */
function getHuntingSeasonStart($seasonYear) {
    if (empty($seasonYear)) {
        return null;
    }
    
    // Extract first year from "YYYY/YYYY+1"
    $parts = explode('/', $seasonYear);
    $year = (int)$parts[0];
    
    return sprintf('%04d-04-01', $year);
}

/**
 * Get end date of a hunting season
 * @param string $seasonYear Format: "YYYY/YYYY+1" (e.g., "2020/2021")
 * @return string Date in format YYYY-MM-DD
 */
function getHuntingSeasonEnd($seasonYear) {
    if (empty($seasonYear)) {
        return null;
    }
    
    // Extract first year from "YYYY/YYYY+1"
    $parts = explode('/', $seasonYear);
    $year = (int)$parts[0];
    
    return sprintf('%04d-03-31', $year + 1);
}

/**
 * Get SQL WHERE clause for hunting season filter
 * @param string $seasonYear Format: "YYYY/YYYY+1" (e.g., "2020/2021")
 * @return array ['where' => SQL condition, 'params' => array of parameters]
 */
function getHuntingSeasonWhereClause($seasonYear, $dateColumn = 'date') {
    if (empty($seasonYear)) {
        return ['where' => '', 'params' => []];
    }
    
    $start = getHuntingSeasonStart($seasonYear);
    $end = getHuntingSeasonEnd($seasonYear);
    
    return [
        'where' => "($dateColumn >= ? AND $dateColumn <= ?)",
        'params' => [$start, $end]
    ];
}

/**
 * Get all hunting seasons from hunts in database
 * @param PDO $db Database connection
 * @return array Array of hunting season years (e.g., ["2020/2021", "2021/2022"])
 */
function getAllHuntingSeasons($db) {
    $stmt = $db->query("SELECT DISTINCT date FROM hunts ORDER BY date DESC");
    $dates = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $seasons = [];
    foreach ($dates as $date) {
        $season = getHuntingSeasonYear($date);
        if ($season && !in_array($season, $seasons)) {
            $seasons[] = $season;
        }
    }
    
    // Sort descending
    rsort($seasons);
    
    return $seasons;
}

