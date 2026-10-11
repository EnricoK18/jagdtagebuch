<?php
/**
 * Handler for Hunting Seasons
 */

require_once __DIR__ . '/../helpers/hunting_season.php';

function handleHuntingSeasons($method, $id) {
    $db = getDBConnection();
    
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Only GET allowed']);
        return;
    }
    
    if ($id) {
        // Get details for specific season
        $start = getHuntingSeasonStart($id);
        $end = getHuntingSeasonEnd($id);
        
        echo json_encode([
            'season_year' => $id,
            'start_date' => $start,
            'end_date' => $end
        ]);
    } else {
        // Get all hunting seasons
        $seasons = getAllHuntingSeasons($db);
        $result = [];
        
        foreach ($seasons as $season) {
            $result[] = [
                'season_year' => $season,
                'start_date' => getHuntingSeasonStart($season),
                'end_date' => getHuntingSeasonEnd($season)
            ];
        }
        
        echo json_encode($result);
    }
}

