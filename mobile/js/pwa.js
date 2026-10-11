/**
 * Offline app: service worker, fetching missing weather once online, backup reminder
 */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => console.warn('Service worker:', error));
    });
}

const WEATHER_BACKFILL_DAYS = 30;
let weatherBackfillRunning = false;

// Hunts saved without connection get their weather as soon as there is one
async function backfillWeather() {
    if (weatherBackfillRunning || !navigator.onLine) return;
    weatherBackfillRunning = true;
    try {
        const since = new Date(Date.now() - WEATHER_BACKFILL_DAYS * 86400000).toISOString().slice(0, 10);
        const hunts = await DB.read(() => DB.all(`
            SELECT h.id FROM hunts h
            JOIN hunting_areas ha ON ha.id = h.hunting_area_id
            WHERE ha.latitude IS NOT NULL AND ha.longitude IS NOT NULL
              AND h.date >= ? AND h.date <= date('now', 'localtime')
              AND NOT EXISTS (SELECT 1 FROM weather_data wd WHERE wd.hunt_id = h.id)
            ORDER BY h.date DESC LIMIT 10`, [since]));

        let fetched = 0;
        for (const hunt of hunts) {
            if (await updateWeatherForHunt(hunt.id) === 'ok') fetched++;
        }
        if (fetched > 0) {
            showSuccess(`Wetterdaten für ${fetched} ${fetched === 1 ? 'Jagd' : 'Jagden'} nachgeladen`);
            if (typeof loadHunts === 'function' && document.getElementById('page-jagden')?.classList.contains('active')) {
                loadHunts();
            }
        }
    } catch (error) {
        console.warn('Weather backfill:', error);
    } finally {
        weatherBackfillRunning = false;
    }
}

window.addEventListener('online', backfillWeather);
window.addEventListener('load', () => setTimeout(backfillWeather, 2000));

// Reminder to export, at most once a day (the data lives only on this phone)
window.addEventListener('load', async () => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem('jagddatenbank-reminded') === today) return;
        const huntCount = await DB.read(() => DB.get('SELECT COUNT(*) as n FROM hunts').n);
        const last = localStorage.getItem('jagddatenbank-last-export');
        const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
        if (huntCount > 0 && days >= 14) {
            localStorage.setItem('jagddatenbank-reminded', today);
            showWarning(last
                ? `Letzte Sicherung vor ${Math.floor(days)} Tagen. Unter „Daten“ eine neue speichern.`
                : 'Noch keine Sicherung gespeichert. Unter „Daten“ eine Sicherung speichern.');
        }
    } catch (e) {
        // reminder only
    }
});
