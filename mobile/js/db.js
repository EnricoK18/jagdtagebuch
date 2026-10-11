/**
 * Local SQLite database (sql.js) for the offline app.
 * The whole database file is kept in IndexedDB and saved after every change.
 */

const DB = (() => {
    const IDB_NAME = 'jagddatenbank';
    const IDB_STORE = 'files';
    const DB_KEY = 'database';
    const BEFORE_IMPORT_KEY = 'database-before-import';

    const SCHEMA = `
        CREATE TABLE IF NOT EXISTS hunting_areas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            area_size REAL,
            latitude REAL,
            longitude REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS animal_species (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            scientific_name TEXT,
            category TEXT DEFAULT 'Wild',
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hunting_area_id INTEGER NOT NULL REFERENCES hunting_areas(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'Kanzel',
            latitude REAL,
            longitude REAL,
            view_direction TEXT,
            shot_directions TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS hunts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            hunting_area_id INTEGER NOT NULL REFERENCES hunting_areas(id),
            seat_id INTEGER REFERENCES seats(id) ON DELETE SET NULL,
            hunt_type TEXT DEFAULT 'Ansitz',
            seat TEXT,
            time_from TEXT,
            time_to TEXT,
            weather TEXT,
            temperature REAL,
            notes TEXT,
            costs REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS observed_animals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
            animal_species_id INTEGER NOT NULL REFERENCES animal_species(id),
            quantity INTEGER DEFAULT 1,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS harvested_animals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
            animal_species_id INTEGER NOT NULL REFERENCES animal_species(id),
            quantity INTEGER DEFAULT 1,
            weight REAL,
            shot_distance INTEGER,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS weather_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
            temperature REAL,
            precipitation REAL,
            wind_speed REAL,
            wind_direction INTEGER,
            pressure REAL,
            humidity INTEGER,
            cloud_cover INTEGER,
            weather_code INTEGER,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_hunts_date ON hunts(date);
        CREATE INDEX IF NOT EXISTS idx_hunts_area ON hunts(hunting_area_id);
        CREATE INDEX IF NOT EXISTS idx_hunts_seat ON hunts(seat_id);
        CREATE INDEX IF NOT EXISTS idx_seats_area ON seats(hunting_area_id);
        CREATE INDEX IF NOT EXISTS idx_observed_hunt ON observed_animals(hunt_id);
        CREATE INDEX IF NOT EXISTS idx_harvested_hunt ON harvested_animals(hunt_id);
        CREATE INDEX IF NOT EXISTS idx_weather_hunt ON weather_data(hunt_id);
    `;

    // Tables in insert order (parents before children), as in the backup file
    const TABLES = ['hunting_areas', 'animal_species', 'seats', 'hunts',
        'observed_animals', 'harvested_animals', 'weather_data'];

    // Species for a fresh install, so a hunt can be entered before importing anything
    const DEFAULT_SPECIES = [
        ['Rehwild', 'Schalenwild'], ['Rehwild - Bock', 'Schalenwild'], ['Rehwild - Ricke', 'Schalenwild'],
        ['Rehwild - Kitz', 'Schalenwild'], ['Rehwild - Schmalreh', 'Schalenwild'], ['Rehwild - Jährling', 'Schalenwild'],
        ['Schwarzwild', 'Schalenwild'], ['Schwarzwild - Keiler', 'Schalenwild'], ['Schwarzwild - Bache', 'Schalenwild'],
        ['Schwarzwild - Überläufer-Keiler', 'Schalenwild'], ['Schwarzwild - Überläufer-Bache', 'Schalenwild'],
        ['Schwarzwild - Frischling', 'Schalenwild'],
        ['Rotwild', 'Schalenwild'], ['Rotwild - Hirsch', 'Schalenwild'], ['Rotwild - Alttier', 'Schalenwild'],
        ['Rotwild - Kalb', 'Schalenwild'],
        ['Fuchs', 'Raubwild'], ['Dachs', 'Raubwild'], ['Waschbär', 'Wild'], ['Hase', 'Wild']
    ];

    // Category order of the MySQL enum (ORDER BY category sorts by enum position there)
    const CATEGORY_ORDER = { 'Wild': 1, 'Raubwild': 2, 'Federwild': 3, 'Schalenwild': 4 };

    let db = null;
    let readyPromise = null;

    // Connection settings; needed again whenever sql.js reopens the database (export() does)
    function configure() {
        db.run('PRAGMA foreign_keys = ON');
        // Sort like MySQL's utf8mb4_unicode_ci: case-insensitive, "Stöckerbild" next to "Stockerbild"
        db.create_function('de_sort', value => value === null ? null : String(value).toLowerCase()
            .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss'));
        db.create_function('category_order', value => CATEGORY_ORDER[value] || 0);
    }

    // --- IndexedDB (stores the database file) ---

    function idb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(IDB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function idbGet(key) {
        const conn = await idb();
        return new Promise((resolve, reject) => {
            const request = conn.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function idbPut(key, value) {
        const conn = await idb();
        return new Promise((resolve, reject) => {
            const tx = conn.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- Setup ---

    async function open() {
        const SQL = await initSqlJs({ locateFile: file => 'vendor/' + file });
        const saved = await idbGet(DB_KEY);
        db = saved ? new SQL.Database(saved) : new SQL.Database();
        configure();
        db.run(SCHEMA);
        if (!saved) {
            DEFAULT_SPECIES.forEach(([name, category]) =>
                db.run('INSERT INTO animal_species (name, category) VALUES (?, ?)', [name, category]));
            await save();
        }
        // Ask the browser not to clear the data when storage gets low
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
        }
        return db;
    }

    function ready() {
        if (!readyPromise) {
            readyPromise = open();
        }
        return readyPromise;
    }

    async function save() {
        // export() closes and reopens the database, which drops the pragma and the functions
        const data = db.export();
        configure();
        await idbPut(DB_KEY, data);
    }

    // --- Queries (call after ready()) ---

    function all(sql, params = []) {
        const stmt = db.prepare(sql);
        try {
            stmt.bind(params.map(p => p === undefined ? null : p));
            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            return rows;
        } finally {
            stmt.free();
        }
    }

    function get(sql, params = []) {
        return all(sql, params)[0] || null;
    }

    function run(sql, params = []) {
        db.run(sql, params.map(p => p === undefined ? null : p));
        return {
            lastId: db.exec('SELECT last_insert_rowid()')[0].values[0][0],
            changes: db.getRowsModified()
        };
    }

    // Runs fn inside a transaction and saves afterwards; rolls back if fn throws
    async function write(fn) {
        await ready();
        db.run('BEGIN');
        let result;
        try {
            result = fn();
            db.run('COMMIT');
        } catch (error) {
            db.run('ROLLBACK');
            throw error;
        }
        await save();
        return result;
    }

    async function read(fn) {
        await ready();
        return fn();
    }

    // --- Backup ---

    async function exportData() {
        await ready();
        const tables = {};
        TABLES.forEach(table => {
            tables[table] = all(`SELECT * FROM ${table} ORDER BY id`);
        });
        return {
            format: 'jagddatenbank-backup',
            version: 1,
            source: 'mobile',
            exported_at: new Date().toISOString(),
            tables
        };
    }

    // Replaces all data with the backup's (keeps the current data for undoImport())
    async function importData(backup) {
        if (!backup || backup.format !== 'jagddatenbank-backup' || !backup.tables) {
            throw new Error('Das ist keine Sicherung des Jagdtagebuchs.');
        }
        await ready();
        const previous = db.export();
        configure();

        const counts = {};
        await write(() => {
            [...TABLES].reverse().forEach(table => db.run(`DELETE FROM ${table}`));
            db.run('DELETE FROM sqlite_sequence');
            TABLES.forEach(table => {
                const rows = backup.tables[table] || [];
                const columns = all(`PRAGMA table_info(${table})`).map(c => c.name);
                rows.forEach(row => {
                    const cols = columns.filter(c => row[c] !== undefined);
                    db.run(
                        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
                        cols.map(c => normalizeValue(row[c]))
                    );
                });
                counts[table] = rows.length;
            });
            const broken = all('PRAGMA foreign_key_check');
            if (broken.length) {
                throw new Error(`Die Sicherung ist unvollständig (${broken.length} Einträge verweisen auf fehlende Daten).`);
            }
        });
        await idbPut(BEFORE_IMPORT_KEY, previous);
        return counts;
    }

    // MySQL exports decimals as strings ("12.50"); store numbers as numbers
    function normalizeValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'object') return JSON.stringify(value);
        if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) && !/^0\d/.test(value)) {
            return Number(value);
        }
        return value;
    }

    async function canUndoImport() {
        return !!(await idbGet(BEFORE_IMPORT_KEY));
    }

    async function undoImport() {
        const previous = await idbGet(BEFORE_IMPORT_KEY);
        if (!previous) {
            throw new Error('Es gibt keinen Stand vor dem letzten Import.');
        }
        const SQL = await initSqlJs({ locateFile: file => 'vendor/' + file });
        await ready();
        db.close();
        db = new SQL.Database(previous);
        configure();
        await idbPut(DB_KEY, previous);
        await idbPut(BEFORE_IMPORT_KEY, null);
    }

    return { ready, read, write, all, get, run, exportData, importData, canUndoImport, undoImport, TABLES };
})();
