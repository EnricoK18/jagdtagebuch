// Weather helper functions
function getWindDirection(degrees) {
    if (degrees === null || degrees === undefined) return '-';
    const directions = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function getWeatherCodeDescription(code) {
    const codes = {
        0: 'Klar',
        1: 'Überwiegend klar',
        2: 'Teilweise bewölkt',
        3: 'Bedeckt',
        45: 'Nebel',
        48: 'Gefrierender Nebel',
        51: 'Leichter Nieselregen',
        53: 'Mäßiger Nieselregen',
        55: 'Starker Nieselregen',
        61: 'Leichter Regen',
        63: 'Mäßiger Regen',
        65: 'Starker Regen',
        71: 'Leichter Schneefall',
        73: 'Mäßiger Schneefall',
        75: 'Starker Schneefall',
        80: 'Leichte Regenschauer',
        81: 'Mäßige Regenschauer',
        82: 'Starke Regenschauer',
        85: 'Leichte Schneeschauer',
        86: 'Starke Schneeschauer',
        95: 'Gewitter',
        96: 'Gewitter mit Hagel',
        99: 'Gewitter mit starkem Hagel'
    };
    return codes[code] || 'Unbekannt';
}

async function fetchWeatherForHunt(huntId, date, huntingAreaId) {
    try {
        // Get hunting area to retrieve coordinates
        const area = await API.getHuntingArea(huntingAreaId);

        if (!area.latitude || !area.longitude) {
            showWarning('Keine Koordinaten für dieses Revier hinterlegt. Bitte Revier bearbeiten und Koordinaten eingeben.');
            return null;
        }

        showSuccess('Wetterdaten werden abgerufen...');

        // Fetch weather data
        const weatherData = await API.fetchWeather({
            latitude: area.latitude,
            longitude: area.longitude,
            date: date,
            hunt_id: huntId
        });

        showSuccess('Wetterdaten erfolgreich abgerufen!');
        return weatherData;
    } catch (error) {
        showError('Fehler beim Abrufen der Wetterdaten: ' + error.message);
        return null;
    }
}

