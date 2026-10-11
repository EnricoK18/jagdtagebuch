/**
 * API for the offline app: same methods and response shapes as the web app's js/api.js,
 * but backed by the local SQLite database (js/db.js) instead of the PHP API.
 * The logic follows api/handlers/*.php of the web app.
 */

/**
 * Escape text for use in HTML (element content and quoted attributes).
 * Lives here because every page loads api.js.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Hunting seasons (April 1st to March 31st), as api/helpers/hunting_season.php ---

function seasonYearOf(date) {
    if (!date) return null;
    let year = parseInt(date.substring(0, 4));
    const month = parseInt(date.substring(5, 7));
    if (month < 4) year--;
    return `${year}/${year + 1}`;
}

function seasonStart(seasonYear) {
    return `${parseInt(seasonYear)}-04-01`;
}

function seasonEnd(seasonYear) {
    return `${parseInt(seasonYear) + 1}-03-31`;
}

// Same column subsets the PHP API returns, as one SQL fragment per animal table
const ANIMAL_SUMS = `
    LEFT JOIN (
        SELECT hunt_id, SUM(quantity) as observed_count
        FROM observed_animals WHERE quantity > 0 GROUP BY hunt_id
    ) obs_sum ON h.id = obs_sum.hunt_id
    LEFT JOIN (
        SELECT hunt_id, SUM(quantity) as harvested_count
        FROM harvested_animals WHERE quantity > 0 GROUP BY hunt_id
    ) harv_sum ON h.id = harv_sum.hunt_id
`;

const WIND_RANGES = {
    N: [337.5, 22.5], NO: [22.5, 67.5], O: [67.5, 112.5], SO: [112.5, 157.5],
    S: [157.5, 202.5], SW: [202.5, 247.5], W: [247.5, 292.5], NW: [292.5, 337.5]
};

const REPORT_MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

class API {
    // Hunting Areas
    static async getHuntingAreas() {
        return DB.read(() => DB.all('SELECT * FROM hunting_areas ORDER BY de_sort(name)'));
    }

    static async getHuntingArea(id) {
        return DB.read(() => {
            const area = DB.get('SELECT * FROM hunting_areas WHERE id = ?', [id]);
            if (!area) throw new Error('Revier nicht gefunden');
            return area;
        });
    }

    static async createHuntingArea(data) {
        return DB.write(() => {
            const { lastId } = DB.run(
                'INSERT INTO hunting_areas (name, description, area_size, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
                [data.name ?? '', data.description, data.area_size, data.latitude, data.longitude]
            );
            return { id: lastId, message: 'Hunting area successfully created' };
        });
    }

    static async updateHuntingArea(id, data) {
        return DB.write(() => {
            DB.run(
                `UPDATE hunting_areas SET name = ?, description = ?, area_size = ?, latitude = ?, longitude = ?,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [data.name ?? '', data.description, data.area_size, data.latitude, data.longitude, id]
            );
            return { message: 'Hunting area successfully updated' };
        });
    }

    static async deleteHuntingArea(id) {
        return DB.write(() => {
            const count = DB.get('SELECT COUNT(*) as count FROM hunts WHERE hunting_area_id = ?', [id]).count;
            if (count > 0) {
                throw new Error(`Dieses Revier kann nicht gelöscht werden, da noch ${count} ${count === 1 ? 'Jagd' : 'Jagden'} darauf eingetragen ${count === 1 ? 'ist' : 'sind'}.`);
            }
            DB.run('DELETE FROM hunting_areas WHERE id = ?', [id]);
            return { message: 'Hunting area successfully deleted' };
        });
    }

    // Animal Species
    static async getAnimalSpecies(category = null) {
        return DB.read(() => category
            ? DB.all('SELECT * FROM animal_species WHERE category = ? ORDER BY de_sort(name)', [category])
            : DB.all('SELECT * FROM animal_species ORDER BY category_order(category), de_sort(name)'));
    }

    static async getAnimalSpeciesItem(id) {
        return DB.read(() => {
            const species = DB.get('SELECT * FROM animal_species WHERE id = ?', [id]);
            if (!species) throw new Error('Tierart nicht gefunden');
            return species;
        });
    }

    static async createAnimalSpecies(data) {
        return DB.write(() => {
            if (DB.get('SELECT id FROM animal_species WHERE name = ?', [data.name ?? ''])) {
                throw new Error('Diese Tierart gibt es bereits.');
            }
            const { lastId } = DB.run(
                'INSERT INTO animal_species (name, scientific_name, category, description) VALUES (?, ?, ?, ?)',
                [data.name ?? '', data.scientific_name, data.category ?? 'Wild', data.description]
            );
            return { id: lastId, message: 'Animal species successfully created' };
        });
    }

    static async updateAnimalSpecies(id, data) {
        return DB.write(() => {
            if (DB.get('SELECT id FROM animal_species WHERE name = ? AND id != ?', [data.name ?? '', id])) {
                throw new Error('Diese Tierart gibt es bereits.');
            }
            DB.run(
                `UPDATE animal_species SET name = ?, scientific_name = ?, category = ?, description = ?,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [data.name ?? '', data.scientific_name, data.category ?? 'Wild', data.description, id]
            );
            return { message: 'Animal species successfully updated' };
        });
    }

    static async deleteAnimalSpecies(id) {
        return DB.write(() => {
            const observed = DB.get('SELECT COUNT(*) as count FROM observed_animals WHERE animal_species_id = ?', [id]).count;
            const harvested = DB.get('SELECT COUNT(*) as count FROM harvested_animals WHERE animal_species_id = ?', [id]).count;
            if (observed > 0 || harvested > 0) {
                const parts = [];
                if (observed > 0) parts.push(`${observed} ${observed === 1 ? 'gesehenem Tier' : 'gesehenen Tieren'}`);
                if (harvested > 0) parts.push(`${harvested} ${harvested === 1 ? 'erlegtem Tier' : 'erlegten Tieren'}`);
                throw new Error(`Diese Tierart kann nicht gelöscht werden, da sie noch in ${parts.join(' und ')} verwendet wird.`);
            }
            DB.run('DELETE FROM animal_species WHERE id = ?', [id]);
            return { message: 'Animal species successfully deleted' };
        });
    }

    // Hunts
    static async getHunts(filters = {}) {
        return DB.read(() => {
            let sql = `
                SELECT h.*,
                       ha.name as hunting_area_name,
                       wd.id as weather_id,
                       wd.temperature as weather_temperature,
                       wd.weather_code as weather_weather_code,
                       wd.wind_direction as weather_wind_direction,
                       COALESCE(obs_sum.observed_count, 0) as observed_count,
                       COALESCE(harv_sum.harvested_count, 0) as harvested_count
                FROM hunts h
                LEFT JOIN hunting_areas ha ON h.hunting_area_id = ha.id
                LEFT JOIN weather_data wd ON h.id = wd.hunt_id
                ${ANIMAL_SUMS}
                WHERE 1=1
            `;
            const params = [];
            const has = value => value !== null && value !== undefined && value !== '';

            if (has(filters.hunting_area_id)) {
                sql += ' AND h.hunting_area_id = ?';
                params.push(filters.hunting_area_id);
            }
            if (has(filters.animal_species_id)) {
                sql += ` AND (h.id IN (SELECT hunt_id FROM observed_animals WHERE animal_species_id = ?)
                         OR h.id IN (SELECT hunt_id FROM harvested_animals WHERE animal_species_id = ?))`;
                params.push(filters.animal_species_id, filters.animal_species_id);
            }
            if (has(filters.hunt_type)) {
                sql += ' AND h.hunt_type = ?';
                params.push(filters.hunt_type);
            }
            if (String(filters.has_observed) === 'true') {
                sql += ' AND EXISTS (SELECT 1 FROM observed_animals WHERE hunt_id = h.id AND quantity > 0)';
            }
            if (String(filters.has_harvested) === 'true') {
                sql += ' AND EXISTS (SELECT 1 FROM harvested_animals WHERE hunt_id = h.id AND quantity > 0)';
            }
            if (has(filters.wind_direction) && WIND_RANGES[filters.wind_direction]) {
                const [min, max] = WIND_RANGES[filters.wind_direction];
                sql += filters.wind_direction === 'N'
                    ? ' AND (wd.wind_direction >= ? OR wd.wind_direction <= ?)' // north wraps around 0/360
                    : ' AND wd.wind_direction BETWEEN ? AND ?';
                params.push(min, max);
            }
            [['temperature_min', 'wd.temperature >= ?'], ['temperature_max', 'wd.temperature <= ?'],
             ['precipitation_min', 'wd.precipitation >= ?'], ['precipitation_max', 'wd.precipitation <= ?']]
                .forEach(([key, condition]) => {
                    if (has(filters[key])) {
                        sql += ' AND ' + condition;
                        params.push(parseFloat(filters[key]));
                    }
                });
            if (has(filters.date_from)) {
                sql += ' AND h.date >= ?';
                params.push(filters.date_from);
            }
            if (has(filters.date_to)) {
                sql += ' AND h.date <= ?';
                params.push(filters.date_to);
            }
            if (has(filters.seat)) {
                sql += ' AND h.seat LIKE ?';
                params.push('%' + filters.seat + '%');
            }
            if (has(filters.season_year)) {
                sql += ' AND (h.date >= ? AND h.date <= ?)';
                params.push(seasonStart(filters.season_year), seasonEnd(filters.season_year));
            }
            if (has(filters.year)) {
                sql += " AND CAST(strftime('%Y', h.date) AS INTEGER) = ?";
                params.push(parseInt(filters.year));
            }
            if (has(filters.month)) {
                sql += " AND CAST(strftime('%m', h.date) AS INTEGER) = ?";
                params.push(parseInt(filters.month));
            }
            sql += ' ORDER BY h.date DESC, h.time_from DESC';

            const hunts = DB.all(sql, params);

            // Nest the weather summary, as the PHP API does
            hunts.forEach(hunt => {
                hunt.weather_data = hunt.weather_id ? {
                    temperature: hunt.weather_temperature,
                    weather_code: hunt.weather_weather_code,
                    wind_direction: hunt.weather_wind_direction
                } : null;
                delete hunt.weather_id;
                delete hunt.weather_temperature;
                delete hunt.weather_weather_code;
                delete hunt.weather_wind_direction;
            });

            // Species per hunt ("Erlegt: Rehwild - Bock")
            if (hunts.length) {
                const byId = new Map(hunts.map(h => [h.id, h]));
                hunts.forEach(h => { h.observed_summary = []; h.harvested_summary = []; });
                [['observed_animals', 'observed_summary'], ['harvested_animals', 'harvested_summary']].forEach(([table, key]) => {
                    DB.all(`
                        SELECT a.hunt_id, aspec.name, SUM(a.quantity) as quantity
                        FROM ${table} a
                        JOIN animal_species aspec ON a.animal_species_id = aspec.id
                        WHERE a.quantity > 0
                        GROUP BY a.hunt_id, aspec.name
                        ORDER BY de_sort(aspec.name)
                    `).forEach(row => {
                        const hunt = byId.get(row.hunt_id);
                        if (hunt) hunt[key].push({ name: row.name, quantity: row.quantity });
                    });
                });
            }
            return hunts;
        });
    }

    static async getHunt(id) {
        return DB.read(() => {
            const hunt = DB.get(`
                SELECT h.*, ha.name as hunting_area_name
                FROM hunts h LEFT JOIN hunting_areas ha ON h.hunting_area_id = ha.id
                WHERE h.id = ?`, [id]);
            if (!hunt) throw new Error('Jagd nicht gefunden');
            hunt.observed_animals = DB.all(`
                SELECT oa.*, aspec.name as animal_species_name, aspec.category
                FROM observed_animals oa LEFT JOIN animal_species aspec ON oa.animal_species_id = aspec.id
                WHERE oa.hunt_id = ?`, [id]);
            hunt.harvested_animals = DB.all(`
                SELECT ha.*, aspec.name as animal_species_name, aspec.category
                FROM harvested_animals ha LEFT JOIN animal_species aspec ON ha.animal_species_id = aspec.id
                WHERE ha.hunt_id = ?`, [id]);
            hunt.weather_data = DB.get('SELECT * FROM weather_data WHERE hunt_id = ?', [id]);
            return hunt;
        });
    }

    static async createHunt(data) {
        const id = await DB.write(() => {
            const [seatId, seatName] = resolveSeat(data.seat_id, data.hunting_area_id);
            const { lastId } = DB.run(`
                INSERT INTO hunts (date, hunting_area_id, hunt_type, seat_id, seat, time_from, time_to, weather, temperature, notes, costs)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                data.date || today(), data.hunting_area_id, data.hunt_type ?? 'Ansitz', seatId, seatName,
                data.time_from, data.time_to, data.weather, data.temperature, data.notes, data.costs
            ]);
            insertAnimals(lastId, data);
            return lastId;
        });
        // After saving: a failed weather request must not lose the hunt
        const weather = await updateWeatherForHunt(id);
        return { id, weather, message: 'Hunt successfully created' };
    }

    static async updateHunt(id, data) {
        const before = await DB.read(() => DB.get(`
            SELECT h.date, h.hunting_area_id, (SELECT COUNT(*) FROM weather_data WHERE hunt_id = h.id) as has_weather
            FROM hunts h WHERE h.id = ?`, [id]));

        await DB.write(() => {
            const [seatId, seatName] = resolveSeat(data.seat_id, data.hunting_area_id);
            DB.run(`
                UPDATE hunts SET date = ?, hunting_area_id = ?, hunt_type = ?, seat_id = ?, seat = ?, time_from = ?, time_to = ?,
                    weather = ?, temperature = ?, notes = ?, costs = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`, [
                data.date || today(), data.hunting_area_id, data.hunt_type ?? 'Ansitz', seatId, seatName,
                data.time_from, data.time_to, data.weather, data.temperature, data.notes, data.costs, id
            ]);
            DB.run('DELETE FROM observed_animals WHERE hunt_id = ?', [id]);
            DB.run('DELETE FROM harvested_animals WHERE hunt_id = ?', [id]);
            insertAnimals(id, data);
        });

        // Weather is refetched when date or hunting area change, or when none was fetched yet
        let weather = 'unchanged';
        if (before && (!before.has_weather || before.date !== data.date
                || parseInt(before.hunting_area_id) !== parseInt(data.hunting_area_id))) {
            weather = await updateWeatherForHunt(id);
        }
        return { weather, message: 'Hunt successfully updated' };
    }

    static async deleteHunt(id) {
        return DB.write(() => {
            DB.run('DELETE FROM hunts WHERE id = ?', [id]);
            return { message: 'Hunt successfully deleted' };
        });
    }

    // Reports
    static async getReport(type, filters = {}) {
        return DB.read(() => {
            const seasonYear = filters.season_year || null;
            const areaId = filters.hunting_area_id || null;

            // Conditions on a hunts alias, with their parameters
            const conditions = alias => {
                const parts = [];
                const params = [];
                if (seasonYear) {
                    parts.push(`(${alias}.date >= ? AND ${alias}.date <= ?)`);
                    params.push(seasonStart(seasonYear), seasonEnd(seasonYear));
                }
                if (areaId) {
                    parts.push(`${alias}.hunting_area_id = ?`);
                    params.push(areaId);
                }
                return { parts, params };
            };
            const where = alias => {
                const c = conditions(alias);
                return { sql: c.parts.length ? ' WHERE ' + c.parts.join(' AND ') : '', params: c.params };
            };
            const rate = (part, total) => total > 0 ? Math.round(part / total * 1000) / 10 : 0;

            switch (type) {
                case 'by-hunting-area': {
                    const main = conditions('h');
                    const obs = where('h2');
                    const harv = where('h3');
                    const success = where('h4');
                    const rows = DB.all(`
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
                        LEFT JOIN hunts h ON ha.id = h.hunting_area_id${main.parts.length ? ' AND ' + main.parts.join(' AND ') : ''}
                        LEFT JOIN (
                            SELECT h2.hunting_area_id, SUM(oa.quantity) as observed_count
                            FROM hunts h2 INNER JOIN observed_animals oa ON h2.id = oa.hunt_id${obs.sql}
                            GROUP BY h2.hunting_area_id
                        ) obs_sum ON ha.id = obs_sum.hunting_area_id
                        LEFT JOIN (
                            SELECT h3.hunting_area_id,
                                   COUNT(DISTINCT harv.id) as harvested_count,
                                   SUM(harv.quantity) as total_harvested_quantity,
                                   SUM(harv.weight) as total_weight
                            FROM hunts h3 INNER JOIN harvested_animals harv ON h3.id = harv.hunt_id${harv.sql}
                            GROUP BY h3.hunting_area_id
                        ) harv_sum ON ha.id = harv_sum.hunting_area_id
                        LEFT JOIN (
                            SELECT h4.hunting_area_id,
                                   COUNT(DISTINCT CASE WHEN harv2.id IS NOT NULL THEN h4.id END) as hunts_with_harvest,
                                   COUNT(DISTINCT CASE WHEN oa2.id IS NOT NULL THEN h4.id END) as hunts_with_observation
                            FROM hunts h4
                            LEFT JOIN harvested_animals harv2 ON h4.id = harv2.hunt_id
                            LEFT JOIN observed_animals oa2 ON h4.id = oa2.hunt_id${success.sql}
                            GROUP BY h4.hunting_area_id
                        ) success ON ha.id = success.hunting_area_id
                        ${areaId ? ' WHERE ha.id = ?' : ''}
                        GROUP BY ha.id, ha.name ORDER BY de_sort(ha.name)
                    `, [...main.params, ...obs.params, ...harv.params, ...success.params, ...(areaId ? [areaId] : [])]);
                    rows.forEach(row => {
                        row.success_rate_harvested = rate(row.hunts_with_harvest, row.hunt_count);
                        row.success_rate_observed = rate(row.hunts_with_observation, row.hunt_count);
                    });
                    return rows;
                }

                case 'by-year': {
                    const rows = DB.all(`
                        SELECT h.date, h.hunting_area_id,
                               COALESCE(obs.observed_count, 0) as observed_count,
                               COALESCE(harv.total_harvested_quantity, 0) as total_harvested_quantity,
                               COALESCE(harv.total_weight, 0) as total_weight
                        FROM hunts h
                        LEFT JOIN (SELECT hunt_id, SUM(quantity) as observed_count FROM observed_animals GROUP BY hunt_id) obs
                            ON h.id = obs.hunt_id
                        LEFT JOIN (SELECT hunt_id, SUM(quantity) as total_harvested_quantity, SUM(weight) as total_weight
                                   FROM harvested_animals GROUP BY hunt_id) harv
                            ON h.id = harv.hunt_id
                        ${areaId ? 'WHERE h.hunting_area_id = ?' : ''}
                        ORDER BY h.date DESC
                    `, areaId ? [areaId] : []);

                    const seasons = new Map();
                    rows.forEach(row => {
                        const season = seasonYearOf(row.date);
                        if (!season) return;
                        if (!seasons.has(season)) {
                            seasons.set(season, {
                                season_year: season, hunt_count: 0, hunting_area_count: 0, observed_count: 0,
                                total_harvested_quantity: 0, total_weight: 0, hunts_with_observation: 0,
                                hunts_with_harvest: 0, areas: new Set()
                            });
                        }
                        const s = seasons.get(season);
                        s.hunt_count++;
                        s.observed_count += row.observed_count;
                        s.total_harvested_quantity += row.total_harvested_quantity;
                        s.total_weight += row.total_weight;
                        if (row.observed_count > 0) s.hunts_with_observation++;
                        if (row.total_harvested_quantity > 0) s.hunts_with_harvest++;
                        if (row.hunting_area_id) s.areas.add(row.hunting_area_id);
                    });
                    return [...seasons.values()]
                        .map(s => {
                            s.hunting_area_count = s.areas.size;
                            delete s.areas;
                            s.success_rate_harvested = rate(s.hunts_with_harvest, s.hunt_count);
                            s.success_rate_observed = rate(s.hunts_with_observation, s.hunt_count);
                            return s;
                        })
                        .sort((a, b) => b.season_year.localeCompare(a.season_year));
                }

                case 'by-animal-species': {
                    const w = where('h');
                    return DB.all(`
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
                            SELECT oa.animal_species_id, COUNT(DISTINCT oa.hunt_id) as observed_hunt_count,
                                   SUM(oa.quantity) as total_observed
                            FROM observed_animals oa INNER JOIN hunts h ON oa.hunt_id = h.id${w.sql}
                            GROUP BY oa.animal_species_id
                        ) obs ON aspec.id = obs.animal_species_id
                        LEFT JOIN (
                            SELECT harv.animal_species_id, COUNT(DISTINCT harv.hunt_id) as harvested_hunt_count,
                                   SUM(harv.quantity) as total_harvested, SUM(harv.weight) as total_weight,
                                   AVG(harv.weight) as average_weight
                            FROM harvested_animals harv INNER JOIN hunts h ON harv.hunt_id = h.id${w.sql}
                            GROUP BY harv.animal_species_id
                        ) harv ON aspec.id = harv.animal_species_id
                        WHERE (obs.total_observed > 0 OR harv.total_harvested > 0)
                        ORDER BY category_order(aspec.category), de_sort(aspec.name)
                    `, [...w.params, ...w.params]);
                }

                case 'monthly': {
                    const w = where('h');
                    const month = "CAST(strftime('%m', h.date) AS INTEGER)";
                    const result = new Map();
                    const entry = m => {
                        if (!result.has(m)) {
                            result.set(m, { month: m, hunt_count: 0, observed_count: 0, total_harvested_quantity: 0 });
                        }
                        return result.get(m);
                    };
                    DB.all(`SELECT ${month} as month, COUNT(DISTINCT h.id) as hunt_count FROM hunts h${w.sql} GROUP BY 1`, w.params)
                        .forEach(r => { entry(r.month).hunt_count = r.hunt_count; });
                    DB.all(`SELECT ${month} as month, SUM(oa.quantity) as n FROM hunts h
                            INNER JOIN observed_animals oa ON h.id = oa.hunt_id${w.sql} GROUP BY 1`, w.params)
                        .forEach(r => { entry(r.month).observed_count = r.n; });
                    DB.all(`SELECT ${month} as month, SUM(harv.quantity) as n FROM hunts h
                            INNER JOIN harvested_animals harv ON h.id = harv.hunt_id${w.sql} GROUP BY 1`, w.params)
                        .forEach(r => { entry(r.month).total_harvested_quantity = r.n; });

                    // Hunting season order: April to March
                    return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
                        .filter(m => result.has(m))
                        .map(m => ({ ...result.get(m), month_name: REPORT_MONTH_NAMES[m - 1] }));
                }

                default:
                    throw new Error('Report type not found');
            }
        });
    }

    // Hunting Seasons
    static async getHuntingSeasons() {
        return DB.read(() => {
            const seasons = new Set(DB.all('SELECT DISTINCT date FROM hunts').map(r => seasonYearOf(r.date)).filter(Boolean));
            return [...seasons].sort().reverse().map(season => ({
                season_year: season, start_date: seasonStart(season), end_date: seasonEnd(season)
            }));
        });
    }

    static async getHuntingSeason(seasonYear) {
        return { season_year: seasonYear, start_date: seasonStart(seasonYear), end_date: seasonEnd(seasonYear) };
    }

    // Weather
    static async getWeatherForHunt(huntId) {
        return DB.read(() => {
            const weather = DB.get('SELECT * FROM weather_data WHERE hunt_id = ?', [huntId]);
            if (!weather) throw new Error('Keine Wetterdaten für diese Jagd');
            return weather;
        });
    }

    static async fetchWeather(data) {
        if (!data.latitude || !data.longitude || !data.date) {
            throw new Error('Latitude, longitude, and date are required');
        }
        const weather = await fetchWeatherFromAPI(data.latitude, data.longitude, data.date);
        if (data.hunt_id) {
            await DB.write(() => storeWeatherData(data.hunt_id, weather));
        }
        return weather;
    }

    static async deleteWeatherData(huntId) {
        return DB.write(() => {
            DB.run('DELETE FROM weather_data WHERE hunt_id = ?', [huntId]);
            return { message: 'Weather data deleted successfully' };
        });
    }

    // Seats
    static async getSeats(filters = {}) {
        return DB.read(() => {
            const params = [];
            let sql = `SELECT s.*, ha.name as hunting_area_name FROM seats s
                       LEFT JOIN hunting_areas ha ON s.hunting_area_id = ha.id WHERE 1=1`;
            if (filters.hunting_area_id) {
                sql += ' AND s.hunting_area_id = ?';
                params.push(filters.hunting_area_id);
            }
            sql += ' ORDER BY de_sort(ha.name), de_sort(s.name)';
            return DB.all(sql, params).map(decodeSeat);
        });
    }

    static async getSeat(id) {
        return DB.read(() => {
            const seat = DB.get(`SELECT s.*, ha.name as hunting_area_name FROM seats s
                                 LEFT JOIN hunting_areas ha ON s.hunting_area_id = ha.id WHERE s.id = ?`, [id]);
            if (!seat) throw new Error('Sitz nicht gefunden');
            decodeSeat(seat);

            seat.statistics = DB.get(`
                SELECT COUNT(*) as hunt_count,
                       COALESCE(SUM(obs_sum.observed_count), 0) as total_observed,
                       COALESCE(SUM(harv_sum.harvested_count), 0) as total_harvested
                FROM hunts h ${ANIMAL_SUMS}
                WHERE h.seat_id = ?`, [id]);

            const hunts = DB.all(`
                SELECT h.id, h.date, h.time_from,
                       COALESCE(obs_sum.observed_count, 0) as observed_count,
                       COALESCE(harv_sum.harvested_count, 0) as harvested_count
                FROM hunts h ${ANIMAL_SUMS}
                WHERE h.seat_id = ?
                ORDER BY h.date DESC, h.time_from DESC`, [id]);

            // Animals per hunt for the per-species tables on the details page
            const byId = new Map(hunts.map(h => [h.id, h]));
            hunts.forEach(h => { h.observed_animals = []; h.harvested_animals = []; });
            ['observed_animals', 'harvested_animals'].forEach(table => {
                DB.all(`
                    SELECT a.*, aspec.name as animal_species_name
                    FROM ${table} a
                    JOIN hunts h ON h.id = a.hunt_id
                    LEFT JOIN animal_species aspec ON a.animal_species_id = aspec.id
                    WHERE h.seat_id = ?`, [id])
                    .forEach(animal => byId.get(animal.hunt_id)[table].push(animal));
            });
            seat.hunts = hunts;
            return seat;
        });
    }

    static async createSeat(data) {
        return DB.write(() => {
            const { lastId } = DB.run(`
                INSERT INTO seats (hunting_area_id, name, type, latitude, longitude, view_direction, shot_directions, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                data.hunting_area_id, data.name ?? '', data.type ?? 'Kanzel', data.latitude, data.longitude,
                data.view_direction, Array.isArray(data.shot_directions) ? JSON.stringify(data.shot_directions) : null, data.notes
            ]);
            return { id: lastId, message: 'Seat successfully created' };
        });
    }

    static async updateSeat(id, data) {
        return DB.write(() => {
            DB.run(`
                UPDATE seats SET hunting_area_id = ?, name = ?, type = ?, latitude = ?, longitude = ?,
                    view_direction = ?, shot_directions = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`, [
                data.hunting_area_id, data.name ?? '', data.type ?? 'Kanzel', data.latitude, data.longitude,
                data.view_direction, Array.isArray(data.shot_directions) ? JSON.stringify(data.shot_directions) : null,
                data.notes, id
            ]);
            // Keep the seat name shown on the hunts in sync after a rename
            DB.run('UPDATE hunts SET seat = ? WHERE seat_id = ?', [data.name ?? '', id]);
            return { message: 'Seat successfully updated' };
        });
    }

    static async deleteSeat(id) {
        return DB.write(() => {
            DB.run('DELETE FROM seats WHERE id = ?', [id]);
            return { message: 'Seat successfully deleted' };
        });
    }
}

// --- Helpers (run inside DB.read/DB.write) ---

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The hunt's seat from seat_id; a seat from another hunting area is dropped
function resolveSeat(seatId, huntingAreaId) {
    if (!seatId || !huntingAreaId) return [null, null];
    const seat = DB.get('SELECT id, name FROM seats WHERE id = ? AND hunting_area_id = ?', [seatId, huntingAreaId]);
    return seat ? [seat.id, seat.name] : [null, null];
}

function insertAnimals(huntId, data) {
    (data.observed_animals || []).forEach(a => DB.run(
        'INSERT INTO observed_animals (hunt_id, animal_species_id, quantity, notes) VALUES (?, ?, ?, ?)',
        [huntId, a.animal_species_id, a.quantity ?? 1, a.notes]
    ));
    (data.harvested_animals || []).forEach(a => DB.run(
        'INSERT INTO harvested_animals (hunt_id, animal_species_id, quantity, weight, shot_distance, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [huntId, a.animal_species_id, a.quantity ?? 1, a.weight, a.shot_distance, a.notes]
    ));
}

function decodeSeat(seat) {
    if (seat.shot_directions) {
        try {
            seat.shot_directions = JSON.parse(seat.shot_directions);
        } catch (e) {
            seat.shot_directions = null;
        }
    }
    return seat;
}

function storeWeatherData(huntId, w) {
    const values = [w.temperature, w.precipitation, w.wind_speed, w.wind_direction,
        w.pressure, w.humidity, w.cloud_cover, w.weather_code];
    if (DB.get('SELECT id FROM weather_data WHERE hunt_id = ?', [huntId])) {
        DB.run(`UPDATE weather_data SET temperature = ?, precipitation = ?, wind_speed = ?, wind_direction = ?,
                pressure = ?, humidity = ?, cloud_cover = ?, weather_code = ?, fetched_at = CURRENT_TIMESTAMP
                WHERE hunt_id = ?`, [...values, huntId]);
    } else {
        DB.run(`INSERT INTO weather_data (temperature, precipitation, wind_speed, wind_direction,
                pressure, humidity, cloud_cover, weather_code, hunt_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, huntId]);
    }
}

/**
 * Fetch and store the weather of a hunt from its date and hunting area coordinates.
 * Returns 'ok', 'no_coordinates', 'offline' or 'failed' - never throws.
 */
async function updateWeatherForHunt(huntId) {
    try {
        const hunt = await DB.read(() => DB.get(`
            SELECT h.date, ha.latitude, ha.longitude FROM hunts h
            JOIN hunting_areas ha ON ha.id = h.hunting_area_id WHERE h.id = ?`, [huntId]));
        if (!hunt || !hunt.latitude || !hunt.longitude) return 'no_coordinates';
        if (!navigator.onLine) return 'offline'; // fetched later by pwa.js once there is a connection
        const weather = await fetchWeatherFromAPI(hunt.latitude, hunt.longitude, hunt.date);
        await DB.write(() => storeWeatherData(huntId, weather));
        return 'ok';
    } catch (error) {
        console.warn('Weather for hunt ' + huntId + ' failed:', error);
        return 'failed';
    }
}

// Daily values from Open-Meteo's hourly data, as fetchWeatherFromAPI() in api/handlers/weather.php
async function fetchWeatherFromAPI(latitude, longitude, date) {
    // The historical archive lags a few days behind; recent days come from the forecast API
    const daysAgo = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
    const base = daysAgo <= 10 ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
    const params = new URLSearchParams({
        latitude, longitude, start_date: date, end_date: date,
        hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl,relative_humidity_2m,cloud_cover,weather_code',
        timezone: 'Europe/Berlin'
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let data;
    try {
        const response = await fetch(`${base}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Wetterdienst antwortet mit HTTP ${response.status}`);
        data = await response.json();
    } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'Wetterdienst antwortet nicht' : 'Keine Verbindung zum Wetterdienst');
    } finally {
        clearTimeout(timer);
    }
    if (!data.hourly) throw new Error('Ungültige Antwort vom Wetterdienst');

    const h = data.hourly;
    const values = key => (h[key] || []).filter(v => v !== null);
    const avg = (list, digits = 2) => list.length
        ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10 ** digits) / 10 ** digits : null;

    const temps = values('temperature_2m');
    if (!temps.length) {
        throw new Error('Für dieses Datum liegen noch keine Wetterdaten vor (das Archiv hängt einige Tage hinterher)');
    }
    const precip = values('precipitation');
    const codes = values('weather_code');
    return {
        temperature: avg(temps),
        precipitation: precip.length ? Math.round(precip.reduce((a, b) => a + b, 0) * 100) / 100 : null,
        wind_speed: avg(values('wind_speed_10m')),
        wind_direction: averageWindDirection(h.wind_direction_10m || [], h.wind_speed_10m || []),
        pressure: avg(values('pressure_msl')),
        humidity: avg(values('relative_humidity_2m'), 0),
        cloud_cover: avg(values('cloud_cover'), 0),
        // WMO codes are categories: use the most severe one of the day
        weather_code: codes.length ? Math.max(...codes) : null
    };
}

// Vector mean weighted by wind speed, so 350° and 10° give 0° (north) instead of 180°
function averageWindDirection(directions, speeds) {
    let x = 0;
    let y = 0;
    let count = 0;
    directions.forEach((direction, hour) => {
        if (direction === null) return;
        const weight = speeds[hour] ?? 1;
        x += weight * Math.sin(direction * Math.PI / 180);
        y += weight * Math.cos(direction * Math.PI / 180);
        count++;
    });
    if (!count || (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9)) return null;
    return Math.round((Math.atan2(x, y) * 180 / Math.PI + 360) % 360) % 360;
}
