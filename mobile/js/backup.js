/**
 * Tab "Daten" of the offline app: export and import of the local database.
 * Backups are JSON files in the same format as the web app's export (api/backup),
 * so data can be moved between phone and web app in both directions.
 */

ICONS['database'] = '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>';
ICONS['download'] = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
ICONS['upload'] = '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>';
ICONS['share'] = '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>';

const LAST_EXPORT_KEY = 'jagddatenbank-last-export';
const BACKUP_REMINDER_DAYS = 14;

// The page exists only on index.html; create it before app.js reads the URL hash
(function createDataPage() {
    const main = document.getElementById('main-content');
    if (!main || !document.getElementById('page-jagden')) return;

    const section = document.createElement('section');
    section.id = 'page-daten';
    section.className = 'page';
    section.setAttribute('aria-labelledby', 'title-daten');
    section.innerHTML = `
        <div class="page-content">
            <div class="page-header">
                <h2 id="title-daten">Daten</h2>
            </div>
            <div id="daten-status" class="data-status" aria-live="polite"></div>

            <section class="card data-card">
                <h3>Sicherung exportieren</h3>
                <p>Alle Jagden, Reviere, Sitze, Tierarten und Wetterdaten als Datei. Die Datei kann auch in der Web-App
                   importiert werden. Die Daten liegen nur auf diesem Handy, also regelmäßig sichern.</p>
                <div class="data-actions">
                    <button class="btn btn-primary" onclick="exportBackup()"><span data-icon="download"></span>Sicherung speichern</button>
                    <button class="btn btn-secondary" id="share-backup-btn" onclick="shareBackup()" hidden><span data-icon="share"></span>Teilen</button>
                </div>
            </section>

            <section class="card data-card">
                <h3>Sicherung importieren</h3>
                <p>Ersetzt <strong>alle</strong> Daten auf diesem Handy durch die Daten aus der Datei, z.&nbsp;B. eine
                   Sicherung oder den Export aus der Web-App.</p>
                <div class="data-actions">
                    <label class="btn btn-secondary file-btn">
                        <span data-icon="upload"></span>Datei wählen
                        <input type="file" accept=".json,application/json" onchange="importBackup(this)">
                    </label>
                    <button class="btn btn-secondary" id="undo-import-btn" onclick="undoLastImport()" hidden>Letzten Import rückgängig machen</button>
                </div>
            </section>

            <section class="card data-card">
                <h3>Tabelle für Excel</h3>
                <p>Alle Jagden als CSV-Datei im Aufbau des Jagdtagebuchs (nur zum Ansehen, nicht zum Wiederherstellen).</p>
                <div class="data-actions">
                    <button class="btn btn-secondary" onclick="exportCsv()"><span data-icon="table"></span>CSV speichern</button>
                </div>
            </section>
        </div>
    `;
    main.appendChild(section);

    // Refresh the status whenever the tab is opened (app.js only knows its own pages)
    document.addEventListener('click', event => {
        if (event.target.closest('[data-page="daten"]')) loadDataPage();
    });
    window.addEventListener('hashchange', () => {
        if (location.hash === '#daten') loadDataPage();
    });
    document.addEventListener('DOMContentLoaded', () => {
        if (location.hash === '#daten') loadDataPage();
    });
})();

async function loadDataPage() {
    const status = document.getElementById('daten-status');
    if (!status) return;
    try {
        const counts = await DB.read(() => {
            const n = table => DB.get(`SELECT COUNT(*) as n FROM ${table}`).n;
            return { hunts: n('hunts'), areas: n('hunting_areas'), seats: n('seats'), species: n('animal_species') };
        });
        const lastExport = readLastExport();
        const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
        const daysSince = lastExport ? Math.floor((Date.now() - lastExport.getTime()) / 86400000) : null;

        status.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi"><span class="kpi-label">Jagden</span><span class="kpi-value">${counts.hunts}</span></div>
                <div class="kpi"><span class="kpi-label">Reviere</span><span class="kpi-value">${counts.areas}</span></div>
                <div class="kpi"><span class="kpi-label">Sitze</span><span class="kpi-value">${counts.seats}</span></div>
                <div class="kpi"><span class="kpi-label">Tierarten</span><span class="kpi-value">${counts.species}</span></div>
            </div>
            <p class="data-note ${daysSince === null || daysSince >= BACKUP_REMINDER_DAYS ? 'is-warning' : ''}">
                ${lastExport
                    ? `Letzte Sicherung: ${lastExport.toLocaleDateString('de-DE')} (${daysSince === 0 ? 'heute' : `vor ${daysSince} ${daysSince === 1 ? 'Tag' : 'Tagen'}`})`
                    : 'Auf diesem Handy wurde noch keine Sicherung gespeichert.'}
                ${persisted === false ? '<br>Hinweis: Der Browser hat den dauerhaften Speicher nicht bestätigt. App über „Zum Startbildschirm hinzufügen“ installieren und regelmäßig sichern.' : ''}
            </p>
        `;
        document.getElementById('share-backup-btn').hidden = !canShareFiles();
        document.getElementById('undo-import-btn').hidden = !(await DB.canUndoImport());
    } catch (error) {
        status.innerHTML = `<p class="data-note is-warning">Datenbank konnte nicht gelesen werden: ${escapeHtml(error.message)}</p>`;
    }
}

function readLastExport() {
    try {
        const value = localStorage.getItem(LAST_EXPORT_KEY);
        return value ? new Date(value) : null;
    } catch (e) {
        return null;
    }
}

function rememberExport() {
    try {
        localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    } catch (e) {
        // only used for the reminder
    }
}

function fileStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function backupFile() {
    const data = await DB.exportData();
    return new File([JSON.stringify(data)], `jagdtagebuch_sicherung_${fileStamp()}.json`, { type: 'application/json' });
}

function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canShareFiles() {
    try {
        return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));
    } catch (e) {
        return false;
    }
}

async function exportBackup() {
    try {
        downloadFile(await backupFile());
        rememberExport();
        showSuccess('Sicherung gespeichert (Ordner „Downloads“)');
        loadDataPage();
    } catch (error) {
        showError('Sicherung fehlgeschlagen: ' + error.message);
    }
}

// Share sheet (Google Drive, E-Mail, ...)
async function shareBackup() {
    try {
        const file = await backupFile();
        await navigator.share({ files: [file], title: 'Jagdtagebuch-Sicherung' });
        rememberExport();
        loadDataPage();
    } catch (error) {
        if (error.name !== 'AbortError') showError('Teilen fehlgeschlagen: ' + error.message);
    }
}

async function confirmWithLabel(message, title, okLabel) {
    const okBtn = document.getElementById('confirm-ok-btn');
    const previous = okBtn.textContent;
    okBtn.textContent = okLabel;
    try {
        return await confirmAction(message, title);
    } finally {
        okBtn.textContent = previous;
    }
}

async function importBackup(input) {
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    let backup;
    try {
        backup = JSON.parse(await file.text());
    } catch (e) {
        showError('Die Datei ist keine gültige Sicherung (kein JSON).');
        return;
    }
    if (!backup || backup.format !== 'jagddatenbank-backup' || !backup.tables) {
        showError('Das ist keine Sicherung des Jagdtagebuchs.');
        return;
    }

    const huntCount = (backup.tables.hunts || []).length;
    const from = backup.exported_at ? ` vom ${new Date(backup.exported_at).toLocaleString('de-DE')}` : '';
    const ok = await confirmWithLabel(
        `Die Sicherung${from} enthält ${huntCount} Jagden. Alle Daten auf diesem Handy werden dadurch ersetzt. ` +
        'Der bisherige Stand lässt sich danach einmal wiederherstellen.',
        'Sicherung importieren', 'Importieren'
    );
    if (!ok) return;

    try {
        const counts = await DB.importData(backup);
        showSuccess(`Import fertig: ${counts.hunts} Jagden, ${counts.hunting_areas} Reviere, ${counts.seats} Sitze`);
        loadDataPage();
        if (typeof loadInitialData === 'function') loadInitialData().catch(() => {});
    } catch (error) {
        showError('Import fehlgeschlagen, es wurde nichts geändert: ' + error.message);
    }
}

async function undoLastImport() {
    const ok = await confirmWithLabel(
        'Die Daten werden auf den Stand vor dem letzten Import zurückgesetzt. Was seitdem erfasst wurde, geht verloren.',
        'Import rückgängig machen', 'Zurücksetzen'
    );
    if (!ok) return;
    try {
        await DB.undoImport();
        showSuccess('Stand vor dem Import wiederhergestellt');
        loadDataPage();
        if (typeof loadInitialData === 'function') loadInitialData().catch(() => {});
    } catch (error) {
        showError(error.message);
    }
}

// Same columns as Jagdtagebuch.csv
async function exportCsv() {
    try {
        const rows = await DB.read(() => {
            const hunts = DB.all(`
                SELECT h.*, ha.name as area FROM hunts h
                LEFT JOIN hunting_areas ha ON ha.id = h.hunting_area_id
                ORDER BY h.date, h.time_from`);
            const animals = table => {
                const map = new Map();
                DB.all(`SELECT a.hunt_id, s.name, a.quantity FROM ${table} a
                        JOIN animal_species s ON s.id = a.animal_species_id ORDER BY a.id`)
                    .forEach(a => {
                        if (!map.has(a.hunt_id)) map.set(a.hunt_id, []);
                        map.get(a.hunt_id).push(a);
                    });
                return map;
            };
            const harvested = animals('harvested_animals');
            const observed = animals('observed_animals');
            const list = items => (items || []).map(a => (a.quantity > 1 ? a.quantity + ' x ' : '') + a.name).join(', ');
            const sum = items => (items || []).reduce((n, a) => n + (a.quantity || 0), 0) || '';
            const timeOfDay = time => {
                if (!time) return '';
                const hour = parseInt(time);
                return hour < 11 ? 'morgens' : hour < 16 ? 'mittags' : hour < 21 ? 'abends' : 'nachts';
            };
            return hunts.map(h => [
                h.date.split('-').reverse().join('.'), timeOfDay(h.time_from), h.area, h.seat, h.hunt_type,
                list(harvested.get(h.id)), sum(harvested.get(h.id)),
                list(observed.get(h.id)), sum(observed.get(h.id)),
                h.notes, h.costs !== null ? String(h.costs).replace('.', ',') : '', seasonYearOf(h.date)
            ]);
        });

        const header = ['Datum', 'Zeit', 'Revier', 'Sitz', 'Jagdart', 'Wild - Abschuss', 'Anzahl - Abschuss',
            'Wild Anblick', 'Anzahl - Anblick', 'Bemerkung', 'Kosten', 'Jagdjahr'];
        const cell = value => {
            const text = value === null || value === undefined ? '' : String(value);
            return /[;"\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        };
        const csv = '﻿' + [header, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
        downloadFile(new File([csv], `jagdtagebuch_${fileStamp()}.csv`, { type: 'text/csv' }));
        showSuccess(`${rows.length} Jagden als CSV gespeichert`);
    } catch (error) {
        showError('CSV-Export fehlgeschlagen: ' + error.message);
    }
}
