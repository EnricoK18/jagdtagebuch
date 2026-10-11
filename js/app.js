/**
 * Main Application Logic
 */

let currentPage = 'hunts';
let currentEditId = null;
let huntModalToken = 0; // incremented on every open/close of the hunt modal
let loadHuntsToken = 0; // incremented on every loadHunts() request
let huntFormSpecies = []; // animal species for the selects in the hunt modal
let huntFormSeats = []; // seats of the hunting area selected in the hunt modal
let huntFormSeatsToken = 0; // incremented on every seat reload in the hunt modal
const NEW_SEAT_VALUE = 'new'; // seat select option "+ Neuer Sitz…"
let huntsTableSeats = []; // all seats, for the seat column of the hunts table

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initKeyboardNavigation();
    // Show the page from the URL (e.g. index.html#auswertungen from the seat pages), else the hunts
    showPage(pageFromHash() || 'jagden');
    // Load initial data for filters
    loadInitialData().then(applyUrlFilters).catch((error) => {
        console.error('Error loading initial data:', error);
        // Even if initial data fails, hunts should still load
    });
});

// Keyboard Navigation
function initKeyboardNavigation() {
    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalOverlay = document.getElementById('modal-overlay');
            const confirmOverlay = document.getElementById('confirm-overlay');

            if (modalOverlay && modalOverlay.classList.contains('active')) {
                closeModal();
                e.preventDefault();
            } else if (confirmOverlay && confirmOverlay.style.display !== 'none') {
                closeConfirmModal(false);
                e.preventDefault();
            }
        }
    });
}

// Navigation (links with #page so the pages can be linked from seats.html)
function initNavigation() {
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            history.replaceState(null, '', '#' + link.dataset.page);
            showPage(link.dataset.page);
        });
    });
    window.addEventListener('hashchange', () => {
        const page = pageFromHash();
        if (page && page !== currentPage) {
            showPage(page);
        }
    });
}

function pageFromHash() {
    const page = window.location.hash.replace(/^#(page-)?/, '');
    return document.getElementById('page-' + page) ? page : null;
}

function showPage(page) {
    // Update navigation
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        const isActive = link.dataset.page === page;
        link.classList.toggle('active', isActive);
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });

    // Show/hide pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    window.scrollTo(0, 0);

    currentPage = page;

    // Load data
    switch (page) {
        case 'jagden':
        case 'hunts':
            loadHunts();
            break;
        case 'jagden-tabelle':
            loadHuntsTable();
            break;
        case 'tierarten':
        case 'animal-species':
            loadAnimalSpecies();
            break;
        case 'reviere':
        case 'hunting-areas':
            loadHuntingAreas();
            break;
        case 'auswertungen':
        case 'reports':
            loadReport();
            break;
    }
}

// Helper function to calculate hunting season year from date
function getHuntingSeasonYear(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // JavaScript months are 0-based

    // If month is January, February, or March, it belongs to the previous hunting season
    if (month < 4) {
        return (year - 1) + '/' + year;
    }

    return year + '/' + (year + 1);
}

// Helper function to get time of day from time string
function getTimeOfDay(timeString) {
    if (!timeString) return '';

    const [hours] = timeString.split(':').map(Number);

    if (hours >= 5 && hours < 12) {
        return 'morgens';
    } else if (hours >= 12 && hours < 17) {
        return 'mittags';
    } else if (hours >= 17 && hours < 22) {
        return 'abends';
    } else {
        return 'nachts';
    }
}

// Load initial data
async function loadInitialData() {
    try {
        // Load hunting areas for filters
        const huntingAreas = await API.getHuntingAreas();
        fillFilterSelects(['filter-revier', 'filter-revier-table', 'auswertung-revier'],
            huntingAreas.map(area => [area.name, area.id]));

        // Load animal species for filters
        const animalSpecies = await API.getAnimalSpecies();
        fillFilterSelects(['filter-tierart'],
            animalSpecies.map(species => [species.name, species.id]));

        // Load hunting seasons for filters
        let seasonYears = (await API.getHuntingSeasons()).map(season =>
            typeof season === 'string' ? season : (season.season_year || season));

        // If no seasons from database, generate from current date
        if (seasonYears.length === 0) {
            const currentYear = new Date().getFullYear();
            for (let year = currentYear; year >= currentYear - 10; year--) {
                seasonYears.push(year + '/' + (year + 1));
            }
        }
        fillFilterSelects(['filter-jahr', 'filter-jahr-table', 'auswertung-jahr'],
            seasonYears.map(seasonYear => [seasonYear, seasonYear]));

        // Reports start with the current hunting season (or the newest one with hunts)
        if (!reportSeasonInitialized) {
            reportSeasonInitialized = true;
            const currentSeason = getHuntingSeasonYear(new Date());
            document.getElementById('auswertung-jahr').value = seasonYears.includes(currentSeason) ? currentSeason : seasonYears[0];
            if (currentPage === 'auswertungen') {
                loadReport();
            }
        }
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Fehler beim Laden der Daten');
        throw error; // Re-throw to allow catch in initialization
    }
}

// Handle URL parameters for auto-filtering (only once, after the filters are filled)
function applyUrlFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const filterRevier = urlParams.get('filter_revier');
    const filterJahr = urlParams.get('filter_jahr');
    const filterMonat = urlParams.get('filter_monat');
    const editHuntId = parseInt(urlParams.get('edit_hunt'));

    // Link from another page (e.g. seat details): open that hunt directly
    if (editHuntId) {
        editHunt(editHuntId);
    }

    if (filterRevier) {
        const revierSelect = document.getElementById('filter-revier');
        if (revierSelect) {
            revierSelect.value = filterRevier;
        }
    }

    if (filterJahr) {
        const jahrSelect = document.getElementById('filter-jahr');
        if (jahrSelect) {
            jahrSelect.value = decodeURIComponent(filterJahr);
        }
    }

    if (filterMonat) {
        const monatSelect = document.getElementById('filter-monat');
        if (monatSelect) {
            monatSelect.value = filterMonat;
        }
    }

    // If any filter was applied, reload hunts
    if (filterRevier || filterJahr || filterMonat) {
        loadHunts();
    }
}

// Replace the options of filter selects (keeping the first "Alle ..." option and the selection)
function fillFilterSelects(selectIds, options) {
    selectIds.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentValue = select.value;
        while (select.options.length > 1) {
            select.remove(1);
        }
        options.forEach(([text, value]) => select.appendChild(new Option(text, value)));
        select.value = currentValue;
        if (select.value !== currentValue) {
            select.value = ''; // selected entry no longer exists
        }
    });
}

// Hunts
async function loadHunts() {
    const container = document.getElementById('jagden-list');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Jagden...</div>';

    try {
        const seasonYear = document.getElementById('filter-jahr')?.value || null;
        const animalSpeciesId = document.getElementById('filter-tierart')?.value || null;
        const [monthYear, month] = (document.getElementById('filter-monat')?.value || '').split('-');
        const filters = {
            hunting_area_id: document.getElementById('filter-revier')?.value || null,
            season_year: seasonYear || null,
            animal_species_id: animalSpeciesId || null,
            year: monthYear || null,
            month: month || null,

            // Advanced filters
            hunt_type: document.getElementById('filter-hunt-type')?.value || null,
            has_observed: document.getElementById('filter-has-observed')?.checked ? 'true' : null,
            has_harvested: document.getElementById('filter-has-harvested')?.checked ? 'true' : null,
            wind_direction: document.getElementById('filter-wind-direction')?.value || null,
            temperature_min: document.getElementById('filter-temp-min')?.value || null,
            temperature_max: document.getElementById('filter-temp-max')?.value || null,
            precipitation_min: document.getElementById('filter-precip-min')?.value || null,
            precipitation_max: document.getElementById('filter-precip-max')?.value || null,
            date_from: document.getElementById('filter-date-from')?.value || null,
            date_to: document.getElementById('filter-date-to')?.value || null,
            seat: document.getElementById('filter-seat')?.value || null
        };

        // Remove null/empty values
        Object.keys(filters).forEach(key => {
            if (filters[key] === null || filters[key] === '') {
                delete filters[key];
            }
        });

        // Debug: Log filters
        console.log('Loading hunts with filters:', filters);

        const token = ++loadHuntsToken;
        const hunts = await API.getHunts(filters);
        if (token !== loadHuntsToken) return; // a newer request is under way

        const countEl = document.getElementById('hunts-count');
        if (countEl) {
            countEl.textContent = `${hunts.length} ${hunts.length === 1 ? 'Eintrag' : 'Einträge'}, neueste zuerst`;
        }

        if (hunts.length === 0) {
            container.innerHTML = emptyState('list', 'Keine Jagden gefunden');
            displayActiveFilters();
            return;
        }

        // Group by month, newest first (the API already sorts by date)
        const groups = [];
        hunts.forEach(hunt => {
            const date = parseLocalDate(hunt.date);
            const label = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
            if (!groups.length || groups[groups.length - 1].label !== label) {
                groups.push({ label, hunts: [] });
            }
            groups[groups.length - 1].hunts.push(hunt);
        });

        container.innerHTML = groups.map(group => `
            <section class="month-group">
                <h3 class="month-label">${group.label}</h3>
                <div class="hunt-list">${group.hunts.map(renderHuntRow).join('')}</div>
            </section>
        `).join('');

        // Update active filters display
        displayActiveFilters();
    } catch (error) {
        console.error('Error loading hunts:', error);
        container.innerHTML = emptyState('alert', 'Fehler beim Laden der Jagden: ' + error.message);
    }
}

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// "2026-09-04" as a local date (new Date("2026-09-04") would be UTC midnight)
function parseLocalDate(dateString) {
    const [year, month, day] = String(dateString).split('-').map(Number);
    return new Date(year, month - 1, day);
}

function emptyState(iconName, message) {
    return `<div class="empty-state"><div class="empty-state-icon">${icon(iconName, 32)}</div><p>${escapeHtml(message)}</p></div>`;
}

// [{name: "Rehwild - Bock", quantity: 2}] -> "2× Rehwild – Bock"
function speciesText(list) {
    return (list || []).map(a => (a.quantity > 1 ? a.quantity + '× ' : '') + a.name.replace(' - ', ' – ')).join(', ');
}

function formatTemperature(value) {
    return `${Math.round(parseFloat(value))} °C`.replace('-', '−');
}

function renderHuntRow(hunt) {
    const date = parseLocalDate(hunt.date);
    const timeOfDay = getTimeOfDay(hunt.time_from);
    const observedCount = parseInt(hunt.observed_count) || 0;
    const harvestedCount = parseInt(hunt.harvested_count) || 0;
    const title = escapeHtml(hunt.hunting_area_name || 'Unbekanntes Revier') + (hunt.seat ? ` · Sitz ${escapeHtml(hunt.seat)}` : '');
    const meta = [hunt.hunt_type, timeOfDay, hunt.costs ? parseFloat(hunt.costs).toFixed(2).replace('.', ',') + ' €' : null]
        .filter(Boolean).map(escapeHtml).join(' · ');
    const weather = hunt.weather_data;

    let weatherHtml;
    if (weather) {
        const main = [
            weather.temperature !== null ? formatTemperature(weather.temperature) : null,
            weather.weather_code !== null ? getWeatherCodeDescription(weather.weather_code) : null
        ].filter(Boolean).join(' · ');
        weatherHtml = `${icon(weatherIcon(weather.weather_code), 22)}
            <div>${escapeHtml(main)}${weather.wind_direction !== null ? `<small>Wind ${getWindDirection(weather.wind_direction)}</small>` : ''}</div>`;
    } else {
        weatherHtml = `<button class="link-btn" onclick="fetchAndDisplayWeather(${hunt.id}, '${hunt.date}', ${hunt.hunting_area_id})">${icon('cloud', 18)}Wetter abrufen</button>`;
    }

    return `
        <div class="hunt-row">
            <div class="hunt-date">
                <span class="wd">${WEEKDAYS_SHORT[date.getDay()]}</span>
                <span class="day">${String(date.getDate()).padStart(2, '0')}</span>
                <span class="mon">${MONTH_SHORT[date.getMonth()]}</span>
            </div>
            <div class="hunt-main">
                <button class="hunt-title" onclick="editHunt(${hunt.id})">${title}</button>
                ${meta ? `<span class="hunt-meta">${meta}${hunt.seat_id ? ` · <a href="seat_details.html?id=${hunt.seat_id}">Sitz ansehen</a>` : ''}</span>` : ''}
                ${harvestedCount ? `<span class="tag-harvest">Erlegt: ${escapeHtml(speciesText(hunt.harvested_summary))}</span>` : ''}
                ${observedCount ? `<span class="hunt-note">Anblick: ${escapeHtml(speciesText(hunt.observed_summary))}</span>` : ''}
                ${hunt.notes ? `<span class="hunt-note">${escapeHtml(hunt.notes)}</span>` : ''}
                <div class="hunt-mobile-line">
                    <span class="chip">${observedCount} Anblick</span>
                    <span class="chip ${harvestedCount ? 'is-harvest' : ''}">${harvestedCount} erlegt</span>
                    ${weather && weather.temperature !== null ? `<span class="chip">${formatTemperature(weather.temperature)}</span>` : ''}
                </div>
            </div>
            <div class="hunt-stats">
                <div class="stat-mini"><strong>${observedCount}</strong><span>Anblick</span></div>
                <div class="stat-mini ${harvestedCount ? 'is-harvest' : ''}"><strong>${harvestedCount}</strong><span>erlegt</span></div>
            </div>
            <div class="hunt-weather">${weatherHtml}</div>
            <div class="hunt-actions">
                <button class="btn-icon" onclick="editHunt(${hunt.id})" aria-label="Jagd bearbeiten" title="Bearbeiten">${icon('pencil')}</button>
                <button class="btn-icon danger" onclick="deleteHunt(${hunt.id})" aria-label="Jagd löschen" title="Löschen">${icon('trash')}</button>
            </div>
        </div>
    `;
}

// Load hunts in editable table format
async function loadHuntsTable() {
    const container = document.getElementById('jagden-table-container');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Jagden...</div>';

    try {
        const seasonYear = document.getElementById('filter-jahr-table')?.value || null;
        const [monthYear, month] = (document.getElementById('filter-monat-table')?.value || '').split('-');
        const filters = {
            hunting_area_id: document.getElementById('filter-revier-table')?.value || null,
            season_year: seasonYear || null,
            year: monthYear || null,
            month: month || null
        };

        const [hunts, huntingAreas, seats] = await Promise.all([
            API.getHunts(filters),
            API.getHuntingAreas(),
            API.getSeats()
        ]);
        huntsTableSeats = seats;

        if (hunts.length === 0) {
            container.innerHTML = emptyState('table', 'Keine Jagden gefunden');
            return;
        }

        let html = `
            <table class="editable-table">
                <thead>
                    <tr>
                        <th class="num">Nr.</th>
                        <th>Datum</th>
                        <th>Revier</th>
                        <th>Jagdart</th>
                        <th>Sitz</th>
                        <th>Tageszeit</th>
                        <th class="num">Anblick</th>
                        <th class="num">Erlegt</th>
                        <th>Bemerkungen</th>
                        <th><span class="sr-only">Aktionen</span></th>
                    </tr>
                </thead>
                <tbody>
        `;

        hunts.forEach(hunt => {
            const timeOfDay = getTimeOfDay(hunt.time_from);
            const observedCount = parseInt(hunt.observed_count) || 0;
            const harvestedCount = parseInt(hunt.harvested_count) || 0;
            html += `
                <tr data-hunt-id="${hunt.id}">
                    <td class="num">${hunt.id}</td>
                    <td><input type="date" class="editable-field" aria-label="Datum" data-field="date" value="${hunt.date}" onchange="saveHuntField(${hunt.id}, 'date', this.value)"></td>
                    <td>
                        <select class="editable-field" aria-label="Revier" data-field="hunting_area_id" onchange="saveHuntField(${hunt.id}, 'hunting_area_id', this.value)">
                            ${huntingAreas.map(area => `<option value="${area.id}" ${area.id == hunt.hunting_area_id ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select class="editable-field" aria-label="Jagdart" data-field="hunt_type" onchange="saveHuntField(${hunt.id}, 'hunt_type', this.value)">
                            <option value="Ansitz" ${hunt.hunt_type === 'Ansitz' ? 'selected' : ''}>Ansitz</option>
                            <option value="Drückjagd" ${hunt.hunt_type === 'Drückjagd' ? 'selected' : ''}>Drückjagd</option>
                            <option value="Gruppenansitz" ${hunt.hunt_type === 'Gruppenansitz' ? 'selected' : ''}>Gruppenansitz</option>
                        </select>
                    </td>
                    <td>
                        <select class="editable-field" aria-label="Sitz" data-field="seat_id" onchange="saveHuntField(${hunt.id}, 'seat_id', this.value)">
                            ${seatOptionsHtml(hunt.hunting_area_id, hunt.seat_id)}
                        </select>
                    </td>
                    <td>
                        <select class="editable-field" aria-label="Tageszeit" data-field="time_of_day" onchange="updateTimeFromTimeOfDay(${hunt.id}, this.value)">
                            <option value="" ${!timeOfDay ? 'selected' : ''}>-</option>
                            <option value="morgens" ${timeOfDay === 'morgens' ? 'selected' : ''}>morgens</option>
                            <option value="mittags" ${timeOfDay === 'mittags' ? 'selected' : ''}>mittags</option>
                            <option value="abends" ${timeOfDay === 'abends' ? 'selected' : ''}>abends</option>
                            <option value="nachts" ${timeOfDay === 'nachts' ? 'selected' : ''}>nachts</option>
                        </select>
                    </td>
                    <td class="num">${observedCount}</td>
                    <td class="num">${harvestedCount}</td>
                    <td><textarea class="editable-field" aria-label="Bemerkungen" data-field="notes" onchange="saveHuntField(${hunt.id}, 'notes', this.value)" rows="1">${escapeHtml(hunt.notes)}</textarea></td>
                    <td style="white-space: nowrap;">
                        <button class="btn-icon" onclick="editHunt(${hunt.id})" aria-label="Jagd vollständig bearbeiten" title="Vollständig bearbeiten">${icon('pencil')}</button>
                        <button class="btn-icon danger" onclick="deleteHunt(${hunt.id})" aria-label="Jagd löschen" title="Löschen">${icon('trash')}</button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = emptyState('alert', 'Fehler: ' + error.message);
    }
}

// Seat options for a row of the hunts table (seats of the row's hunting area)
function seatOptionsHtml(huntingAreaId, selectedSeatId) {
    const options = huntsTableSeats
        .filter(seat => seat.hunting_area_id == huntingAreaId)
        .map(seat => `<option value="${seat.id}" ${seat.id == selectedSeatId ? 'selected' : ''}>${escapeHtml(seat.name)}</option>`)
        .join('');
    return '<option value="">-</option>' + options;
}

// Update time_from based on time of day selection
function updateTimeFromTimeOfDay(huntId, timeOfDay) {
    let timeValue = '';

    switch (timeOfDay) {
        case 'morgens':
            timeValue = '08:00';
            break;
        case 'mittags':
            timeValue = '13:00';
            break;
        case 'abends':
            timeValue = '18:00';
            break;
        case 'nachts':
            timeValue = '22:00';
            break;
        default:
            timeValue = null;
    }

    if (timeValue) {
        saveHuntField(huntId, 'time_from', timeValue);
    } else {
        saveHuntField(huntId, 'time_from', '');
    }
}

// Save individual field changes. Saves of the same hunt run one after another,
// because each one reads the whole hunt and writes it back.
const huntFieldSaveQueues = {};

function saveHuntField(huntId, field, value) {
    const previous = huntFieldSaveQueues[huntId] || Promise.resolve();
    const next = previous.then(() => saveHuntFieldNow(huntId, field, value));
    huntFieldSaveQueues[huntId] = next;
    return next;
}

async function saveHuntFieldNow(huntId, field, value) {
    try {
        // Get current hunt data
        const hunt = await API.getHunt(huntId);

        // Prepare update data
        const updateData = {
            date: hunt.date,
            hunting_area_id: hunt.hunting_area_id,
            hunt_type: hunt.hunt_type,
            time_from: hunt.time_from,
            time_to: hunt.time_to,
            weather: hunt.weather,
            temperature: hunt.temperature,
            notes: hunt.notes,
            seat_id: hunt.seat_id,
            costs: hunt.costs,
            observed_animals: hunt.observed_animals || [],
            harvested_animals: hunt.harvested_animals || []
        };

        // Update the changed field
        if (field === 'hunting_area_id' || field === 'seat_id') {
            updateData[field] = parseInt(value) || null;
        } else if (field === 'temperature' || field === 'costs') {
            updateData[field] = value ? parseFloat(value) : null;
        } else if (field === 'date' || field === 'time_from' || field === 'time_to') {
            updateData[field] = value || null;
        } else {
            updateData[field] = value || null;
        }

        // Save to API
        await API.updateHunt(huntId, updateData);

        // Show success indicator
        const row = document.querySelector(`tr[data-hunt-id="${huntId}"]`);
        if (row) {
            const fieldElement = row.querySelector(`[data-field="${field}"]`);
            if (fieldElement) {
                fieldElement.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    fieldElement.style.backgroundColor = '';
                }, 500);
            }

            // The seat belongs to the old hunting area and was dropped by the server
            if (field === 'hunting_area_id') {
                const seatSelect = row.querySelector('[data-field="seat_id"]');
                if (seatSelect) {
                    seatSelect.innerHTML = seatOptionsHtml(value, null);
                }
            }

            // If time_from was changed, update the time of day dropdown
            if (field === 'time_from') {
                const timeOfDay = getTimeOfDay(value);
                const timeOfDaySelect = row.querySelector('[data-field="time_of_day"]');
                if (timeOfDaySelect) {
                    timeOfDaySelect.value = timeOfDay || '';
                }
            }
        }
    } catch (error) {
        showError('Fehler beim Speichern: ' + error.message);
        // Reload the table to restore original values
        loadHuntsTable();
    }
}

async function openHuntModal(id = null) {
    currentEditId = id;
    const title = id ? 'Jagd bearbeiten' : 'Neue Jagd';
    document.getElementById('modal-title').textContent = title;

    const body = `
        <form id="hunt-form" onsubmit="saveHunt(event)">
            <div class="form-grid">
                <div class="form-group">
                    <label for="hunt-date">Datum</label>
                    <input type="date" id="hunt-date" required>
                </div>
                <div class="form-group">
                    <label for="hunt-hunting-area">Revier</label>
                    <select id="hunt-hunting-area" required onchange="loadSeatsForHuntForm()"></select>
                </div>
            </div>
            <div class="form-group">
                <span class="form-label" id="hunt-time-of-day-label">Tageszeit</span>
                ${segmentedControl('hunt-time-of-day', ['morgens', 'mittags', 'abends', 'nachts'], '', true)}
            </div>
            <div class="form-group">
                <label for="hunt-seat">Sitz</label>
                <select id="hunt-seat" onchange="toggleNewSeatInput()">
                    <option value="">–</option>
                </select>
                <input type="text" id="hunt-new-seat-name" aria-label="Name des neuen Sitzes" placeholder="Name des neuen Sitzes" style="display: none;">
            </div>
            <div class="form-group">
                <span class="form-label" id="hunt-type-label">Jagdart</span>
                ${segmentedControl('hunt-type', ['Ansitz', 'Drückjagd', 'Gruppenansitz'], 'Ansitz', false)}
            </div>

            <div class="form-section">
                <h4>Anblick</h4>
                <div id="observed-animals-container"></div>
                <button type="button" class="btn btn-ghost" onclick="addObservedAnimalEntry()">${icon('plus')}Tier hinzufügen</button>
            </div>

            <div class="form-section">
                <h4>Erlegt</h4>
                <div id="harvested-animals-container"></div>
                <button type="button" class="btn btn-ghost" onclick="addHarvestedAnimalEntry()">${icon('plus')}Tier hinzufügen</button>
            </div>

            <div class="form-section">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="hunt-temperature">Temperatur (°C)</label>
                        <input type="number" step="0.1" id="hunt-temperature">
                    </div>
                    <div class="form-group">
                        <label for="hunt-costs">Kosten (€)</label>
                        <input type="number" step="0.01" id="hunt-costs">
                    </div>
                </div>
                <div class="form-group">
                    <label for="hunt-weather">Wetter (Notiz)</label>
                    <input type="text" id="hunt-weather" placeholder="z. B. klar, leichter Wind">
                </div>
                <div class="form-group">
                    <label for="hunt-notes">Bemerkungen</label>
                    <textarea id="hunt-notes" rows="3"></textarea>
                </div>
            </div>

            <div class="form-actions">
                ${id ? `<button type="button" class="btn btn-ghost-danger push-left" onclick="deleteHuntFromModal()">${icon('trash')}Löschen</button>` : ''}
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
                <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
        </form>
    `;

    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-overlay').classList.add('is-drawer');
    openModal();

    // Load hunting areas and animal species; wait for the options before
    // setting the hunt's values, otherwise the selection gets lost
    const token = ++huntModalToken;
    const [, speciesLoaded] = await Promise.all([
        loadHuntingAreasForSelect('hunt-hunting-area'),
        loadAnimalSpeciesForSelects()
    ]);
    if (token !== huntModalToken) return; // modal was closed or reopened meanwhile

    // Without species, saving would drop all animals of the hunt
    if (!speciesLoaded) {
        document.querySelector('#hunt-form button[type="submit"]').disabled = true;
        showError('Tierarten konnten nicht geladen werden. Bitte den Dialog erneut öffnen.');
        return;
    }

    // Load data if editing
    if (id) {
        await loadHuntData(id, token);
    }
}

async function loadHuntData(id, token) {
    try {
        const hunt = await API.getHunt(id);
        if (token !== huntModalToken) return; // modal was closed or reopened meanwhile
        document.getElementById('hunt-date').value = hunt.date;
        document.getElementById('hunt-hunting-area').value = hunt.hunting_area_id;
        await loadSeatsForHuntForm(hunt.seat_id, hunt.seat);
        if (token !== huntModalToken) return;
        setSegmentValue('hunt-type', hunt.hunt_type || 'Ansitz');
        setSegmentValue('hunt-time-of-day', getTimeOfDay(hunt.time_from) || '');

        document.getElementById('hunt-weather').value = hunt.weather || '';
        document.getElementById('hunt-temperature').value = hunt.temperature ?? '';
        document.getElementById('hunt-costs').value = hunt.costs ?? '';
        document.getElementById('hunt-notes').value = hunt.notes || '';

        (hunt.observed_animals || []).forEach(animal => addObservedAnimalEntry(animal));
        (hunt.harvested_animals || []).forEach(animal => addHarvestedAnimalEntry(animal));
    } catch (error) {
        showError('Fehler beim Laden der Jagd: ' + error.message);
    }
}

// Seat select in the hunt modal: seats of the selected hunting area plus "+ Neuer Sitz…"
async function loadSeatsForHuntForm(selectedSeatId = null, selectedSeatName = null) {
    const select = document.getElementById('hunt-seat');
    if (!select) return;

    const areaId = document.getElementById('hunt-hunting-area').value;
    const token = ++huntFormSeatsToken;
    let loadFailed = false;
    huntFormSeats = [];

    if (areaId) {
        try {
            const seats = await API.getSeats({ hunting_area_id: areaId });
            if (token !== huntFormSeatsToken) return; // area changed meanwhile
            huntFormSeats = seats;
        } catch (error) {
            console.error('Error loading seats:', error);
            showError('Sitze konnten nicht geladen werden: ' + error.message);
            loadFailed = true;
        }
    }

    select.innerHTML = '<option value="">-</option>';
    huntFormSeats.forEach(seat => {
        select.appendChild(new Option(`${seat.name} (${seat.type})`, seat.id));
    });
    // Keep the hunt's seat selectable, otherwise saving would remove it
    if (loadFailed && selectedSeatId) {
        select.appendChild(new Option(selectedSeatName || 'Aktueller Sitz', selectedSeatId));
    }
    if (areaId && !loadFailed) {
        select.appendChild(new Option('+ Neuer Sitz…', NEW_SEAT_VALUE));
    }
    select.value = selectedSeatId || '';
    toggleNewSeatInput();
}

function toggleNewSeatInput() {
    const isNew = document.getElementById('hunt-seat').value === NEW_SEAT_VALUE;
    const input = document.getElementById('hunt-new-seat-name');
    input.style.display = isNew ? '' : 'none';
    input.required = isNew;
    if (isNew) {
        input.focus();
    }
}

// Returns the seat id to save; creates the seat first if "+ Neuer Sitz…" is selected
async function resolveHuntFormSeat() {
    const value = document.getElementById('hunt-seat').value;
    if (value !== NEW_SEAT_VALUE) {
        return value ? parseInt(value) : null;
    }

    const name = document.getElementById('hunt-new-seat-name').value.trim();
    // Reuse a seat with the same name instead of creating a duplicate
    const existing = huntFormSeats.find(seat => seat.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        return parseInt(existing.id);
    }

    const result = await API.createSeat({
        hunting_area_id: parseInt(document.getElementById('hunt-hunting-area').value),
        name: name,
        type: 'Sonstige'
    });
    return parseInt(result.id);
}

async function saveHunt(event) {
    event.preventDefault();

    let seatId;
    try {
        seatId = await resolveHuntFormSeat();
    } catch (error) {
        showError('Fehler beim Anlegen des Sitzes: ' + error.message);
        return;
    }

    // Collect observed animals
    const observedAnimals = [];
    document.querySelectorAll('.observed-animal-entry').forEach(entry => {
        const speciesId = entry.querySelector('.observed-animal-species').value;
        const quantity = entry.querySelector('.observed-animal-quantity').value;
        const notes = entry.querySelector('.observed-animal-notes').value;

        if (speciesId) {
            observedAnimals.push({
                animal_species_id: parseInt(speciesId),
                quantity: parseInt(quantity) || 1,
                notes: notes || null
            });
        }
    });

    // Collect harvested animals
    const harvestedAnimals = [];
    document.querySelectorAll('.harvested-animal-entry').forEach(entry => {
        const speciesId = entry.querySelector('.harvested-animal-species').value;
        const quantity = entry.querySelector('.harvested-animal-quantity').value;
        const weight = entry.querySelector('.harvested-animal-weight').value;
        const distance = entry.querySelector('.harvested-animal-distance').value;
        const notes = entry.querySelector('.harvested-animal-notes').value;

        if (speciesId) {
            harvestedAnimals.push({
                animal_species_id: parseInt(speciesId),
                quantity: parseInt(quantity) || 1,
                weight: weight ? parseFloat(weight) : null,
                shot_distance: distance ? parseInt(distance) : null,
                notes: notes || null
            });
        }
    });

    // Convert time of day to time_from
    const timeOfDay = document.getElementById('hunt-time-of-day').value;
    let timeFrom = null;
    if (timeOfDay) {
        switch (timeOfDay) {
            case 'morgens':
                timeFrom = '08:00';
                break;
            case 'mittags':
                timeFrom = '13:00';
                break;
            case 'abends':
                timeFrom = '18:00';
                break;
            case 'nachts':
                timeFrom = '22:00';
                break;
        }
    }

    const data = {
        date: document.getElementById('hunt-date').value,
        hunting_area_id: parseInt(document.getElementById('hunt-hunting-area').value),
        hunt_type: document.getElementById('hunt-type').value,
        time_from: timeFrom,
        time_to: null, // Not used anymore
        seat_id: seatId,
        weather: document.getElementById('hunt-weather').value || null,
        temperature: document.getElementById('hunt-temperature').value ? parseFloat(document.getElementById('hunt-temperature').value) : null,
        costs: document.getElementById('hunt-costs').value ? parseFloat(document.getElementById('hunt-costs').value) : null,
        notes: document.getElementById('hunt-notes').value || null,
        observed_animals: observedAnimals,
        harvested_animals: harvestedAnimals
    };

    try {
        const submitButton = document.querySelector('#hunt-form button[type="submit"]');
        submitButton.disabled = true; // the server also fetches the weather, which can take a moment
        let result;
        if (currentEditId) {
            result = await API.updateHunt(currentEditId, data);
            showSuccess('Jagd gespeichert' + (result.weather === 'ok' ? ', Wetterdaten abgerufen' : ''));
        } else {
            result = await API.createHunt(data);
            showSuccess('Jagd erfasst' + (result.weather === 'ok' ? ', Wetterdaten abgerufen' : ''));
        }
        if (result.weather === 'no_coordinates') {
            showWarning('Kein Wetter abgerufen: Für das Revier sind keine Koordinaten hinterlegt.');
        } else if (result.weather === 'failed') {
            showWarning('Wetterdaten konnten nicht abgerufen werden. Du kannst es in der Liste erneut versuchen.');
        }
        closeModal();
        loadHunts();
        // Reload table if we're on the table page
        if (currentPage === 'jagden-tabelle') {
            loadHuntsTable();
        }
    } catch (error) {
        showError('Fehler: ' + error.message);
        const submitButton = document.querySelector('#hunt-form button[type="submit"]');
        if (submitButton) submitButton.disabled = false;
    }
}

function editHunt(id) {
    openHuntModal(id);
}

async function deleteHunt(id) {
    const confirmed = await confirmAction('Möchten Sie diese Jagd wirklich löschen?', 'Jagd löschen');
    if (!confirmed) return false;

    try {
        await API.deleteHunt(id);
        showSuccess('Jagd erfolgreich gelöscht');
        loadHunts();
        // Reload table if we're on the table page
        if (currentPage === 'jagden-tabelle') {
            loadHuntsTable();
        }
        loadInitialData(); // Update filters
        return true;
    } catch (error) {
        showError('Fehler: ' + error.message);
        return false;
    }
}

async function deleteHuntFromModal() {
    if (await deleteHunt(currentEditId)) {
        closeModal();
    }
}

// Segmented control writing its value to a hidden input (read like a select by saveHunt)
function segmentedControl(id, options, value, allowEmpty) {
    return `
        <div class="segmented" role="group" aria-labelledby="${id}-label" data-allow-empty="${allowEmpty ? 'true' : 'false'}">
            ${options.map(option => `<button type="button" data-value="${option}" aria-pressed="${option === value}" onclick="pickSegment('${id}', '${option}')">${option}</button>`).join('')}
        </div>
        <input type="hidden" id="${id}" value="${value}">
    `;
}

function pickSegment(id, value) {
    const input = document.getElementById(id);
    const allowEmpty = input.previousElementSibling.dataset.allowEmpty === 'true';
    // A second tap clears an optional choice (e.g. no time of day)
    setSegmentValue(id, allowEmpty && input.value === value ? '' : value);
}

function setSegmentValue(id, value) {
    const input = document.getElementById(id);
    input.value = value;
    input.previousElementSibling.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', button.dataset.value === value ? 'true' : 'false');
    });
}

function stepQuantity(button, delta) {
    const input = button.parentElement.querySelector('input');
    input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
}

function quantityStepper(className, value) {
    return `
        <div class="stepper">
            <button type="button" onclick="stepQuantity(this, -1)" aria-label="Anzahl verringern">${icon('minus', 16)}</button>
            <input type="number" class="${className}" min="1" value="${parseInt(value) || 1}" aria-label="Anzahl">
            <button type="button" onclick="stepQuantity(this, 1)" aria-label="Anzahl erhöhen">${icon('plus', 16)}</button>
        </div>
    `;
}

// Helper functions for animal entries
async function loadAnimalSpeciesForSelects() {
    try {
        huntFormSpecies = await API.getAnimalSpecies();
        document.querySelectorAll('.observed-animal-species, .harvested-animal-species').forEach(select => {
            fillSpeciesSelect(select, select.value);
        });
        return true;
    } catch (error) {
        console.error('Error loading animal species:', error);
        return false;
    }
}

function fillSpeciesSelect(select, value) {
    select.innerHTML = '<option value="">Bitte wählen...</option>';
    huntFormSpecies.forEach(species => {
        select.appendChild(new Option(species.name, species.id));
    });
    if (value) {
        select.value = value;
    }
}

function addObservedAnimalEntry(data = null) {
    const entry = document.createElement('div');
    entry.className = 'observed-animal-entry animal-entry';
    entry.innerHTML = `
        <select class="observed-animal-species" aria-label="Tierart"></select>
        ${quantityStepper('observed-animal-quantity', data?.quantity)}
        <button type="button" class="btn-icon danger" onclick="removeAnimalEntry(this)" aria-label="Eintrag entfernen">${icon('x')}</button>
        <div class="entry-extra">
            <label>Bemerkung<input type="text" class="observed-animal-notes" value="${escapeHtml(data?.notes)}"></label>
        </div>
    `;
    document.getElementById('observed-animals-container').appendChild(entry);
    fillSpeciesSelect(entry.querySelector('.observed-animal-species'), data?.animal_species_id);
}

function addHarvestedAnimalEntry(data = null) {
    const entry = document.createElement('div');
    entry.className = 'harvested-animal-entry animal-entry';
    entry.innerHTML = `
        <select class="harvested-animal-species" aria-label="Tierart"></select>
        ${quantityStepper('harvested-animal-quantity', data?.quantity)}
        <button type="button" class="btn-icon danger" onclick="removeAnimalEntry(this)" aria-label="Eintrag entfernen">${icon('x')}</button>
        <div class="entry-extra">
            <label>Gewicht (kg)<input type="number" step="0.1" class="harvested-animal-weight" value="${data?.weight ?? ''}"></label>
            <label>Schussdistanz (m)<input type="number" class="harvested-animal-distance" value="${data?.shot_distance ?? ''}"></label>
            <label>Bemerkung<input type="text" class="harvested-animal-notes" value="${escapeHtml(data?.notes)}"></label>
        </div>
    `;
    document.getElementById('harvested-animals-container').appendChild(entry);
    fillSpeciesSelect(entry.querySelector('.harvested-animal-species'), data?.animal_species_id);
}

function removeAnimalEntry(button) {
    button.closest('.animal-entry').remove();
}

// Legacy function names for HTML compatibility
function loadJagden() { loadHunts(); }
function openJagdModal(id) { openHuntModal(id); }
function editJagd(id) { editHunt(id); }
function deleteJagd(id) { deleteHunt(id); }
function saveJagd(event) { saveHunt(event); }

// Animal Species
async function loadAnimalSpecies() {
    const container = document.getElementById('tierarten-list');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Tierarten...</div>';

    try {
        const category = document.getElementById('filter-kategorie')?.value || null;
        const animalSpecies = await API.getAnimalSpecies(category);

        if (animalSpecies.length === 0) {
            container.innerHTML = emptyState('tag', 'Keine Tierarten gefunden');
            return;
        }

        container.innerHTML = animalSpecies.map(species => `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(species.name)}</div>
                        <div class="card-subtitle">
                            <span class="badge">${escapeHtml(species.category)}</span>
                            ${species.scientific_name ? `<em>${escapeHtml(species.scientific_name)}</em>` : ''}
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-icon" onclick="editAnimalSpecies(${species.id})" aria-label="Tierart bearbeiten" title="Bearbeiten">${icon('pencil')}</button>
                        <button class="btn-icon danger" onclick="deleteAnimalSpecies(${species.id})" aria-label="Tierart löschen" title="Löschen">${icon('trash')}</button>
                    </div>
                </div>
                ${species.description ? `<div class="card-body"><p>${escapeHtml(species.description)}</p></div>` : ''}
                <div><button class="link-btn" onclick="showHuntsForSpecies(${species.id})">Jagden mit ${escapeHtml(species.name)}${icon('chevron-right', 16)}</button></div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Fehler: ${escapeHtml(error.message)}</p></div>`;
    }
}

function openAnimalSpeciesModal(id = null) {
    currentEditId = id;
    const title = id ? 'Tierart bearbeiten' : 'Neue Tierart';
    document.getElementById('modal-title').textContent = title;

    const body = `
        <form id="animal-species-form" onsubmit="saveAnimalSpecies(event)">
            <div class="form-group">
                <label>Name *</label>
                <input type="text" id="animal-species-name" required>
            </div>
            <div class="form-group">
                <label>Wissenschaftlicher Name</label>
                <input type="text" id="animal-species-scientific-name">
            </div>
            <div class="form-group">
                <label>Kategorie *</label>
                <select id="animal-species-category" required>
                    <option value="Wild">Wild</option>
                    <option value="Raubwild">Raubwild</option>
                    <option value="Federwild">Federwild</option>
                    <option value="Schalenwild">Schalenwild</option>
                </select>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea id="animal-species-description"></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
                <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
        </form>
    `;

    document.getElementById('modal-body').innerHTML = body;
    openModal();

    if (id) {
        loadAnimalSpeciesData(id);
    }
}

async function loadAnimalSpeciesData(id) {
    try {
        const species = await API.getAnimalSpeciesItem(id);
        document.getElementById('animal-species-name').value = species.name;
        document.getElementById('animal-species-scientific-name').value = species.scientific_name || '';
        document.getElementById('animal-species-category').value = species.category;
        document.getElementById('animal-species-description').value = species.description || '';
    } catch (error) {
        showError('Fehler beim Laden der Tierart: ' + error.message);
    }
}

async function saveAnimalSpecies(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('animal-species-name').value,
        scientific_name: document.getElementById('animal-species-scientific-name').value || null,
        category: document.getElementById('animal-species-category').value,
        description: document.getElementById('animal-species-description').value || null
    };

    try {
        if (currentEditId) {
            await API.updateAnimalSpecies(currentEditId, data);
            showSuccess('Tierart erfolgreich aktualisiert');
        } else {
            await API.createAnimalSpecies(data);
            showSuccess('Tierart erfolgreich erstellt');
        }
        closeModal();
        loadAnimalSpecies();
    } catch (error) {
        showError('Fehler: ' + error.message);
    }
}

function editAnimalSpecies(id) {
    openAnimalSpeciesModal(id);
}

async function deleteAnimalSpecies(id) {
    const confirmed = await confirmAction('Möchten Sie diese Tierart wirklich löschen?', 'Tierart löschen');
    if (!confirmed) return;

    try {
        await API.deleteAnimalSpecies(id);
        showSuccess('Tierart erfolgreich gelöscht');
        loadAnimalSpecies();
    } catch (error) {
        showError('Fehler: ' + error.message);
    }
}

// Show hunts for a specific animal species
async function showHuntsForSpecies(speciesId) {
    // Switch to hunts page
    showPage('jagden');

    // Set the filter
    const filterSelect = document.getElementById('filter-tierart');
    if (filterSelect) {
        filterSelect.value = speciesId;
        const speciesName = filterSelect.selectedOptions[0]?.text || '';
        // Load hunts with the filter
        await loadHunts();

        // Show a message that we're filtering
        const container = document.getElementById('jagden-list');
        if (container && container.children.length > 0) {
            const message = document.createElement('div');
            message.className = 'info-message';
            message.innerHTML = `<span>Gefiltert nach Tierart: <strong>${escapeHtml(speciesName)}</strong></span> <button class="btn btn-secondary btn-sm" onclick="clearSpeciesFilter()">Filter zurücksetzen</button>`;
            container.insertBefore(message, container.firstChild);
        }
    }
}

// Clear species filter
function clearSpeciesFilter() {
    const filterSelect = document.getElementById('filter-tierart');
    if (filterSelect) {
        filterSelect.value = '';
        loadHunts();
    }
}

// Legacy function names
function loadTierarten() { loadAnimalSpecies(); }
function openTierartModal(id) { openAnimalSpeciesModal(id); }
function editTierart(id) { editAnimalSpecies(id); }
function deleteTierart(id) { deleteAnimalSpecies(id); }
function saveTierart(event) { saveAnimalSpecies(event); }

// Hunting Areas
async function loadHuntingAreas() {
    const container = document.getElementById('reviere-list');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Reviere...</div>';

    try {
        const huntingAreas = await API.getHuntingAreas();

        if (huntingAreas.length === 0) {
            container.innerHTML = emptyState('map', 'Keine Reviere gefunden');
            return;
        }

        container.innerHTML = huntingAreas.map(area => `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(area.name)}</div>
                        <div class="card-subtitle">
                            ${area.area_size ? `<span>${String(parseFloat(area.area_size)).replace('.', ',')} ha</span>` : ''}
                            ${area.latitude && area.longitude ? '<span>Koordinaten hinterlegt</span>' : '<span class="badge badge-warning">Keine Koordinaten (für Wetter nötig)</span>'}
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-icon" onclick="editHuntingArea(${area.id})" aria-label="Revier bearbeiten" title="Bearbeiten">${icon('pencil')}</button>
                        <button class="btn-icon danger" onclick="deleteHuntingArea(${area.id})" aria-label="Revier löschen" title="Löschen">${icon('trash')}</button>
                    </div>
                </div>
                ${area.description ? `<div class="card-body"><p>${escapeHtml(area.description)}</p></div>` : ''}
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <a class="link-btn" href="seats.html?hunting_area_id=${area.id}">Sitze${icon('chevron-right', 16)}</a>
                    <a class="link-btn" href="index.html?filter_revier=${area.id}">Jagden${icon('chevron-right', 16)}</a>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Fehler: ${escapeHtml(error.message)}</p></div>`;
    }
}

async function loadHuntingAreasForSelect(selectId) {
    try {
        const huntingAreas = await API.getHuntingAreas();
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '<option value="">Bitte wählen...</option>';
        huntingAreas.forEach(area => {
            const option = new Option(area.name, area.id);
            select.appendChild(option);
        });
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading hunting areas:', error);
    }
}

function openHuntingAreaModal(id = null) {
    currentEditId = id;
    const title = id ? 'Revier bearbeiten' : 'Neues Revier';
    document.getElementById('modal-title').textContent = title;

    const body = `
        <form id="hunting-area-form" onsubmit="saveHuntingArea(event)">
            <div class="form-group">
                <label>Name *</label>
                <input type="text" id="hunting-area-name" required>
            </div>
            <div class="form-group">
                <label>Fläche (ha)</label>
                <input type="number" step="0.01" id="hunting-area-size">
            </div>
            <div class="form-group">
                <label>Koordinaten (Latitude)</label>
                <input type="number" step="0.000001" id="hunting-area-latitude" placeholder="z.B. 51.1657">
                <small style="color: #666;">Für Wetterabfrage erforderlich</small>
            </div>
            <div class="form-group">
                <label>Koordinaten (Longitude)</label>
                <input type="number" step="0.000001" id="hunting-area-longitude" placeholder="z.B. 10.4515">
                <small style="color: #666;">Für Wetterabfrage erforderlich</small>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea id="hunting-area-description"></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
                <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
        </form>
    `;

    document.getElementById('modal-body').innerHTML = body;
    openModal();

    if (id) {
        loadHuntingAreaData(id);
    }
}

async function loadHuntingAreaData(id) {
    try {
        const area = await API.getHuntingArea(id);
        document.getElementById('hunting-area-name').value = area.name;
        document.getElementById('hunting-area-size').value = area.area_size || '';
        document.getElementById('hunting-area-latitude').value = area.latitude || '';
        document.getElementById('hunting-area-longitude').value = area.longitude || '';
        document.getElementById('hunting-area-description').value = area.description || '';
    } catch (error) {
        showError('Fehler beim Laden des Reviers: ' + error.message);
    }
}

async function saveHuntingArea(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('hunting-area-name').value,
        area_size: document.getElementById('hunting-area-size').value || null,
        latitude: document.getElementById('hunting-area-latitude').value || null,
        longitude: document.getElementById('hunting-area-longitude').value || null,
        description: document.getElementById('hunting-area-description').value || null
    };

    try {
        if (currentEditId) {
            await API.updateHuntingArea(currentEditId, data);
            showSuccess('Revier erfolgreich aktualisiert');
        } else {
            await API.createHuntingArea(data);
            showSuccess('Revier erfolgreich erstellt');
        }
        closeModal();
        loadHuntingAreas();
        loadInitialData(); // Update filters
    } catch (error) {
        showError('Fehler: ' + error.message);
    }
}

function editHuntingArea(id) {
    openHuntingAreaModal(id);
}

async function deleteHuntingArea(id) {
    const confirmed = await confirmAction('Möchten Sie dieses Revier wirklich löschen? Die Sitze des Reviers werden ebenfalls gelöscht.', 'Revier löschen');
    if (!confirmed) return;

    try {
        await API.deleteHuntingArea(id);
        showSuccess('Revier erfolgreich gelöscht');
        loadHuntingAreas();
        loadInitialData(); // Update filters
    } catch (error) {
        showError('Fehler: ' + error.message);
    }
}

// Legacy function names
function loadReviere() { loadHuntingAreas(); }
function loadReviereForSelect(selectId) { loadHuntingAreasForSelect(selectId); }
function openRevierModal(id) { openHuntingAreaModal(id); }
function editRevier(id) { editHuntingArea(id); }
function deleteRevier(id) { deleteHuntingArea(id); }
function saveRevier(event) { saveHuntingArea(event); }

// Reports
let reportToken = 0; // incremented on every loadReport() request
let reportSeasonInitialized = false; // the season filter defaults to the current season once
let reportData = { months: [], seasons: [] }; // for the chart tooltips

const SERIES = [
    { key: 'hunts', label: 'Jagden', color: 'var(--c-hunts)' },
    { key: 'obs', label: 'Anblick', color: 'var(--c-obs)' },
    { key: 'harv', label: 'Erlegt', color: 'var(--c-harv)' }
];

async function loadReport() {
    const container = document.getElementById('auswertungen-content');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Auswertung...</div>';

    const seasonYear = document.getElementById('auswertung-jahr')?.value || null;
    const areaSelect = document.getElementById('auswertung-revier');
    const areaId = areaSelect?.value || null;
    const filters = { season_year: seasonYear, hunting_area_id: areaId };

    const period = document.getElementById('report-period');
    if (period) {
        const [y1, y2] = (seasonYear || '').split('/');
        const parts = [seasonYear ? `Jagdjahr ${seasonYear} · 1. April ${y1} bis 31. März ${y2}` : 'Alle Jagdjahre'];
        if (areaId) parts.push(areaSelect.selectedOptions[0].text);
        period.textContent = parts.join(' · ');
    }

    const token = ++reportToken;
    try {
        const [years, monthly, species, areas] = await Promise.all([
            API.getReport('by-year', { hunting_area_id: areaId }),
            API.getReport('monthly', filters),
            API.getReport('by-animal-species', filters),
            API.getReport('by-hunting-area', filters)
        ]);
        if (token !== reportToken) return; // filters changed meanwhile

        container.innerHTML = `
            ${renderReportKpis(years, seasonYear)}
            ${renderMonthlyPanel(monthly, seasonYear)}
            <div class="grid-2">
                ${renderSeasonPanel(years, seasonYear)}
                ${renderSpeciesPanel(species)}
            </div>
            ${renderAreaPanel(areas)}
        `;
    } catch (error) {
        if (token !== reportToken) return;
        container.innerHTML = emptyState('alert', 'Fehler beim Laden der Auswertung: ' + error.message);
    }
}

// "2025/2026" -> "2024/2025"
function previousSeason(seasonYear) {
    const year = parseInt(seasonYear);
    return `${year - 1}/${year}`;
}

// "2024/2025" -> "2024/25"
function shortSeason(seasonYear) {
    return seasonYear.replace(/\/\d\d(\d\d)$/, '/$1');
}

function seasonTotals(row) {
    return {
        hunts: parseInt(row?.hunt_count) || 0,
        obs: parseInt(row?.observed_count) || 0,
        harv: parseInt(row?.total_harvested_quantity) || 0,
        withHarvest: parseInt(row?.hunts_with_harvest) || 0
    };
}

function harvestRate(totals) {
    return totals.hunts ? Math.round(totals.withHarvest / totals.hunts * 100) : 0;
}

function formatNumber(value) {
    return new Intl.NumberFormat('de-DE').format(value);
}

function renderReportKpis(years, seasonYear) {
    let current, deltas;

    if (seasonYear) {
        current = seasonTotals(years.find(y => y.season_year === seasonYear));
        const prevYear = previousSeason(seasonYear);
        const prevRow = years.find(y => y.season_year === prevYear);
        const prev = seasonTotals(prevRow);
        const versus = (diff) => {
            if (!prevRow) return 'Kein Vorjahr erfasst';
            if (diff === 0) return `Gleich wie ${shortSeason(prevYear)}`;
            return `${Math.abs(diff)} ${diff > 0 ? 'mehr' : 'weniger'} als ${shortSeason(prevYear)}`;
        };
        deltas = [
            versus(current.hunts - prev.hunts),
            versus(current.obs - prev.obs),
            versus(current.harv - prev.harv),
            `${current.withHarvest} von ${current.hunts}` + (prevRow ? ` · ${shortSeason(prevYear)}: ${harvestRate(prev)} %` : '')
        ];
    } else {
        current = years.map(seasonTotals).reduce((sum, t) => ({
            hunts: sum.hunts + t.hunts,
            obs: sum.obs + t.obs,
            harv: sum.harv + t.harv,
            withHarvest: sum.withHarvest + t.withHarvest
        }), { hunts: 0, obs: 0, harv: 0, withHarvest: 0 });
        const seasons = `${years.length} ${years.length === 1 ? 'Jagdjahr' : 'Jagdjahre'}`;
        deltas = [seasons, seasons, seasons, `${current.withHarvest} von ${current.hunts}`];
    }

    const kpis = [
        ['Jagden', formatNumber(current.hunts)],
        ['Anblick', `${formatNumber(current.obs)} Stück`],
        ['Erlegt', `${formatNumber(current.harv)} Stück`],
        ['Jagden mit Strecke', `${harvestRate(current)} %`]
    ];

    return `<div class="kpi-grid">${kpis.map(([label, value], i) => `
        <div class="kpi">
            <span class="kpi-label">${label}</span>
            <span class="kpi-value">${value}</span>
            <span class="kpi-delta">${escapeHtml(deltas[i])}</span>
        </div>`).join('')}
    </div>`;
}

// Round the axis maximum up to 4 clean steps (1, 2, 5 x 10^n)
function niceAxis(maxValue) {
    const rough = Math.max(maxValue, 1) / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = Math.max(1, [1, 2, 5, 10].map(f => f * magnitude).find(s => s >= rough));
    return { step, max: step * 4 };
}

function legendHtml(series, line = false) {
    return `<div class="legend">${series.map(s => `
        <span class="legend-item"><span class="${line ? 'swatch-line' : 'swatch'}" style="background: ${s.color};"></span>${s.label}</span>`).join('')}
    </div>`;
}

function renderMonthlyPanel(monthly, seasonYear) {
    // April to March, months without hunts as zero
    const order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const byMonth = {};
    monthly.forEach(row => { byMonth[parseInt(row.month)] = row; });
    const months = order.map(m => ({
        name: MONTH_NAMES[m - 1],
        short: MONTH_SHORT[m - 1],
        hunts: parseInt(byMonth[m]?.hunt_count) || 0,
        obs: parseInt(byMonth[m]?.observed_count) || 0,
        harv: parseInt(byMonth[m]?.total_harvested_quantity) || 0
    }));
    reportData.months = months;

    const axis = niceAxis(Math.max(...months.map(m => Math.max(m.hunts, m.obs, m.harv))));
    const ticks = [4, 3, 2, 1, 0].map(i => formatNumber(i * axis.step));
    const pct = (value) => `${value / axis.max * 100}%`;

    const chart = `
        <div class="col-chart">
            <div class="col-chart-axis num" aria-hidden="true">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
            <div class="col-chart-main">
                <div class="col-chart-plot">
                    ${[0, 25, 50, 75].map(top => `<div class="gridline" style="top: ${top}%;"></div>`).join('')}
                    <div class="gridline base" style="bottom: 0;"></div>
                    <div class="col-groups">
                        ${months.map((m, i) => `
                            <button type="button" class="col-group" onmouseenter="showMonthTip(${i})" onfocus="showMonthTip(${i})" onmouseleave="hideChartTip('month-tip')" onblur="hideChartTip('month-tip')"
                                aria-label="${m.name}: ${m.hunts} Jagden, ${m.obs} Anblick, ${m.harv} erlegt">
                                ${SERIES.map(s => `<span class="col-bar" style="height: ${pct(m[s.key])}; background: ${s.color};"></span>`).join('')}
                            </button>`).join('')}
                    </div>
                    <div class="chart-tooltip" id="month-tip" hidden></div>
                </div>
                <div class="col-labels" aria-hidden="true">${months.map(m => `<span>${m.short}</span>`).join('')}</div>
            </div>
        </div>`;

    const table = `
        <div class="table-container">
            <table class="data-table">
                <thead><tr><th>Monat</th><th class="num">Jagden</th><th class="num">Anblick</th><th class="num">Erlegt</th></tr></thead>
                <tbody>${months.map(m => `<tr><td>${m.name}</td><td class="num">${m.hunts}</td><td class="num">${m.obs}</td><td class="num">${m.harv}</td></tr>`).join('')}</tbody>
            </table>
        </div>`;

    return `
        <section class="panel">
            <div class="panel-header">
                <div>
                    <h3 class="panel-title">Jagden, Anblick und Strecke je Monat</h3>
                    <p class="panel-sub">Anzahl, April bis März${seasonYear ? '' : ', alle Jagdjahre zusammen'}</p>
                </div>
                <div class="segmented" role="group" aria-label="Darstellung">
                    <button type="button" aria-pressed="true" data-view="chart" onclick="setMonthlyView(this)">Diagramm</button>
                    <button type="button" aria-pressed="false" data-view="table" onclick="setMonthlyView(this)">Tabelle</button>
                </div>
            </div>
            ${legendHtml(SERIES)}
            <div data-monthly="chart">${chart}</div>
            <div data-monthly="table" hidden>${table}</div>
        </section>`;
}

function setMonthlyView(button) {
    const panel = button.closest('.panel');
    panel.querySelectorAll('.segmented button').forEach(b => b.setAttribute('aria-pressed', b === button ? 'true' : 'false'));
    panel.querySelectorAll('[data-monthly]').forEach(el => { el.hidden = el.dataset.monthly !== button.dataset.view; });
}

function tooltipRows(values) {
    return SERIES.filter(s => values[s.key] !== undefined).map(s =>
        `<span class="row"><span class="swatch" style="background: ${s.color};"></span>${s.label} ${values[s.key]}</span>`).join('');
}

function showMonthTip(index) {
    const tip = document.getElementById('month-tip');
    const m = reportData.months[index];
    if (!tip || !m) return;
    tip.innerHTML = `<strong>${m.name}</strong>${tooltipRows(m)}`;
    tip.style.left = `${(index + 0.5) / 12 * 100}%`;
    tip.style.top = '-8px';
    tip.hidden = false;
}

function hideChartTip(id) {
    const tip = document.getElementById(id);
    if (tip) tip.hidden = true;
}

function renderSeasonPanel(years, seasonYear) {
    const seasons = years.slice().sort((a, b) => a.season_year.localeCompare(b.season_year))
        .map(y => ({ season: y.season_year, ...seasonTotals(y) }));
    reportData.seasons = seasons;

    let body;
    if (seasons.length < 2) {
        body = '<p class="panel-sub">Für einen Vergleich braucht es mindestens zwei Jagdjahre.</p>';
    } else {
        const W = 560, left = 36, right = 466, top = 16, bottom = 200;
        const axis = niceAxis(Math.max(...seasons.map(s => Math.max(s.hunts, s.harv))));
        const step = (right - left) / (seasons.length - 1);
        const x = (i) => left + i * step;
        const y = (v) => bottom - v / axis.max * (bottom - top);
        const points = (key) => seasons.map((s, i) => `${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
        const last = seasons.length - 1;
        const selected = seasons.findIndex(s => s.season === seasonYear);
        const labelEvery = seasons.length > 9 ? 2 : 1;

        // End labels: keep them at least 16px apart
        let huntsLabelY = y(seasons[last].hunts) + 4;
        let harvLabelY = y(seasons[last].harv) + 4;
        if (Math.abs(huntsLabelY - harvLabelY) < 16) {
            const mid = (huntsLabelY + harvLabelY) / 2;
            const huntsAbove = seasons[last].hunts >= seasons[last].harv;
            huntsLabelY = huntsAbove ? mid - 8 : mid + 8;
            harvLabelY = huntsAbove ? mid + 8 : mid - 8;
        }

        body = `
            ${legendHtml([SERIES[0], SERIES[2]], true)}
            <div class="line-chart">
                <svg viewBox="0 0 ${W} 236" role="img" aria-label="Liniendiagramm: Jagden und erlegte Stücke je Jagdjahr">
                    ${selected >= 0 ? `<rect x="${x(selected) - 26}" y="10" width="52" height="194" rx="4" fill="var(--surface-hover)"></rect>` : ''}
                    ${[0, 1, 2, 3, 4].map(i => `
                        <line x1="${left}" x2="${right}" y1="${y(i * axis.step)}" y2="${y(i * axis.step)}" stroke="${i ? 'var(--surface-muted)' : '#CFCEC7'}" stroke-width="1"></line>
                        <text x="${left - 8}" y="${y(i * axis.step) + 4}" text-anchor="end">${formatNumber(i * axis.step)}</text>`).join('')}
                    ${seasons.map((s, i) => i % labelEvery === 0 || i === last ? `<text x="${x(i)}" y="222" text-anchor="middle">${shortSeason(s.season).slice(2)}</text>` : '').join('')}
                    <polyline points="${points('hunts')}" fill="none" stroke="var(--c-hunts)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
                    <polyline points="${points('harv')}" fill="none" stroke="var(--c-harv)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
                    <circle cx="${x(last)}" cy="${y(seasons[last].hunts)}" r="5" fill="var(--c-hunts)" stroke="#FFFFFF" stroke-width="2"></circle>
                    <circle cx="${x(last)}" cy="${y(seasons[last].harv)}" r="5" fill="var(--c-harv)" stroke="#FFFFFF" stroke-width="2"></circle>
                    <text class="end-label" x="${x(last) + 12}" y="${huntsLabelY}">Jagden ${seasons[last].hunts}</text>
                    <text class="end-label" x="${x(last) + 12}" y="${harvLabelY}">Erlegt ${seasons[last].harv}</text>
                    ${seasons.map((s, i) => `<rect x="${x(i) - step / 2}" y="8" width="${step}" height="200" fill="#000" fill-opacity="0"
                        onmouseenter="showSeasonTip(${i}, ${x(i) / W * 100})" onmouseleave="hideChartTip('season-tip')"></rect>`).join('')}
                </svg>
                <div class="chart-tooltip" id="season-tip" hidden></div>
            </div>`;
    }

    return `
        <section class="panel">
            <div>
                <h3 class="panel-title">Jagdjahre im Vergleich</h3>
                <p class="panel-sub">Anzahl Jagden und erlegte Stücke je Jagdjahr</p>
            </div>
            ${body}
        </section>`;
}

function showSeasonTip(index, leftPercent) {
    const tip = document.getElementById('season-tip');
    const s = reportData.seasons[index];
    if (!tip || !s) return;
    tip.innerHTML = `<strong>Jagdjahr ${s.season}</strong>${tooltipRows({ hunts: s.hunts, harv: s.harv })}`;
    tip.style.left = `${leftPercent}%`;
    tip.style.top = '0';
    tip.hidden = false;
}

function renderSpeciesPanel(species) {
    const rows = species.map(s => ({ name: s.animal_species_name, n: parseInt(s.total_harvested) || 0 }))
        .filter(s => s.n > 0)
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const total = rows.reduce((sum, s) => sum + s.n, 0);
    const max = Math.max(1, ...rows.map(s => s.n));

    return `
        <section class="panel">
            <div>
                <h3 class="panel-title">Strecke nach Wildart</h3>
                <p class="panel-sub">Erlegte Stücke, ${formatNumber(total)} insgesamt</p>
            </div>
            ${rows.length ? `<div class="hbar-list">${rows.map(s => `
                <div class="hbar-row">
                    <span>${escapeHtml(s.name.replace(' - ', ' – '))}</span>
                    <div class="hbar-track">
                        <span class="hbar" style="width: calc((100% - 40px) * ${s.n / max});"></span>
                        <strong class="num">${s.n}</strong>
                    </div>
                </div>`).join('')}</div>` : '<p class="panel-sub">Keine Strecke in diesem Zeitraum.</p>'}
        </section>`;
}

function renderAreaPanel(areas) {
    const rows = areas.map(a => ({ id: a.hunting_area_id, name: a.hunting_area_name, ...seasonTotals(a) }))
        .filter(a => a.hunts > 0)
        .sort((a, b) => b.hunts - a.hunts || a.name.localeCompare(b.name));

    return `
        <section class="panel">
            <h3 class="panel-title">Reviere</h3>
            ${rows.length ? `
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Revier</th><th class="num">Jagden</th><th class="num">Anblick</th><th class="num">Erlegt</th><th style="padding-left: 32px;">Jagden mit Strecke</th></tr></thead>
                    <tbody>${rows.map(a => `
                        <tr>
                            <td><a href="index.html?filter_revier=${a.id}">${escapeHtml(a.name)}</a></td>
                            <td class="num">${a.hunts}</td>
                            <td class="num">${a.obs}</td>
                            <td class="num">${a.harv}</td>
                            <td style="padding-left: 32px;">
                                <div class="meter">
                                    <div class="meter-track"><div class="meter-fill" style="width: ${harvestRate(a)}%;"></div></div>
                                    <span class="meter-text num">${harvestRate(a)} % (${a.withHarvest}/${a.hunts})</span>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : '<p class="panel-sub">Keine Jagden in diesem Zeitraum.</p>'}
        </section>`;
}

// Legacy function names
function loadAuswertung() { loadReport(); }

// Helper functions
let lastFocusedElement = null;

function closeModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalContent = modalOverlay.querySelector('.modal-content');

    modalOverlay.classList.remove('active', 'is-drawer');
    modalOverlay.setAttribute('aria-hidden', 'true');
    currentEditId = null;
    huntModalToken++;

    // Remove focus trap
    if (focusTrapHandler && modalContent) {
        modalContent.removeEventListener('keydown', focusTrapHandler);
        focusTrapHandler = null;
    }

    // Restore focus to the element that opened the modal
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }

    document.body.style.overflow = '';
}

function openModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    modalOverlay.classList.add('active');
    modalOverlay.setAttribute('aria-hidden', 'false');

    // Store the currently focused element
    lastFocusedElement = document.activeElement;

    // Focus management for modal
    setTimeout(() => {
        const modalContent = modalOverlay.querySelector('.modal-content');
        const firstFocusable = modalContent.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
        // Trap focus within modal
        trapFocus(modalContent);
        document.body.style.overflow = 'hidden';
    }, 100);
}

let focusTrapHandler = null;

function trapFocus(element) {
    // Remove existing handler if any
    if (focusTrapHandler) {
        element.removeEventListener('keydown', focusTrapHandler);
    }

    const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    focusTrapHandler = function handleTrap(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
                lastFocusable.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusable) {
                firstFocusable.focus();
                e.preventDefault();
            }
        }
    };

    element.addEventListener('keydown', focusTrapHandler);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Confirmation modal system
let confirmResolve = null;

function closeConfirmModal(result = false) {
    const overlay = document.getElementById('confirm-overlay');
    const modalContent = overlay?.querySelector('.modal-content');

    if (overlay) {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }

    // Remove focus trap
    if (focusTrapHandler && modalContent) {
        modalContent.removeEventListener('keydown', focusTrapHandler);
        focusTrapHandler = null;
    }

    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }

    // Restore focus
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
    document.body.style.overflow = '';
}

// Replace confirm() calls with modal
function confirmAction(message, title = 'Bestätigung') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-overlay');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = overlay.querySelector('.btn-secondary');

        if (!overlay) {
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmResolve = resolve;

        // Store the currently focused element
        lastFocusedElement = document.activeElement;

        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');

        // Focus management for confirm modal
        setTimeout(() => {
            const firstFocusable = okBtn;
            if (firstFocusable) {
                firstFocusable.focus();
            }
            trapFocus(overlay.querySelector('.modal-content'));
            document.body.style.overflow = 'hidden';
        }, 100);

        // Remove old event listeners by cloning buttons
        const newOkBtn = okBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        // Add new event listeners
        newOkBtn.addEventListener('click', () => {
            closeConfirmModal(true);
        });

        newCancelBtn.addEventListener('click', () => {
            closeConfirmModal(false);
        });

        // Close on overlay click
        const overlayClickHandler = (e) => {
            if (e.target === overlay) {
                closeConfirmModal(false);
            }
        };
        overlay.addEventListener('click', overlayClickHandler);
    });
}

// Filter functions for report links
function filterHuntsByArea(huntingAreaId) {
    // Navigate to index.html with filter parameter
    window.location.href = `index.html?filter_revier=${huntingAreaId}`;
}

