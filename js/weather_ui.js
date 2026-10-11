// Fetch and display weather for a hunt
async function fetchAndDisplayWeather(huntId, date, huntingAreaId) {
    const weatherData = await fetchWeatherForHunt(huntId, date, huntingAreaId);
    if (weatherData) {
        // Reload hunts to show the new weather data
        loadHunts();
    }
}
