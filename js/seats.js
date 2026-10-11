/**
 * Seat Management JavaScript
 */

let currentSeatId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Check for edit parameter
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    await loadHuntingAreas();
    loadSeats();

    // If edit parameter is present, open edit form
    if (editId) {
        setTimeout(() => {
            editSeat(parseInt(editId));
        }, 500); // Small delay to ensure data is loaded
    }
});

// Load hunting areas for dropdowns
async function loadHuntingAreas() {
    try {
        const areas = await API.getHuntingAreas();
        const urlParams = new URLSearchParams(window.location.search);
        const huntingAreaIdFromUrl = urlParams.get('hunting_area_id');

        // Populate filter dropdown
        const filterSelect = document.getElementById('filter-hunting-area');
        filterSelect.innerHTML = '<option value="">Alle Reviere</option>';
        areas.forEach(area => {
            const selected = huntingAreaIdFromUrl && area.id == huntingAreaIdFromUrl ? ' selected' : '';
            filterSelect.innerHTML += `<option value="${area.id}"${selected}>${escapeHtml(area.name)}</option>`;
        });

        // Populate form dropdown
        const formSelect = document.getElementById('seat-hunting-area');
        formSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        areas.forEach(area => {
            formSelect.innerHTML += `<option value="${area.id}">${escapeHtml(area.name)}</option>`;
        });
    } catch (error) {
        console.error('Error loading hunting areas:', error);
    }
}

// Load seats
async function loadSeats() {
    const container = document.getElementById('seats-list');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Sitze...</div>';

    try {
        const huntingAreaId = document.getElementById('filter-hunting-area').value;
        const filters = {};
        if (huntingAreaId) {
            filters.hunting_area_id = huntingAreaId;
        }

        const seats = await API.getSeats(filters);

        if (seats.length === 0) {
            container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-state-icon">${icon('map-pin', 32)}</div><p>Keine Sitze gefunden</p></div>`;
            return;
        }

        container.innerHTML = seats.map(seat => `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title"><a href="seat_details.html?id=${seat.id}">${escapeHtml(seat.name)}</a></div>
                        <div class="card-subtitle">
                            <span>${escapeHtml(seat.hunting_area_name || 'Unbekanntes Revier')}</span>
                            <span class="badge">${escapeHtml(seat.type)}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-icon" onclick="editSeat(${seat.id})" aria-label="Sitz bearbeiten" title="Bearbeiten">${icon('pencil')}</button>
                        <button class="btn-icon danger" onclick="deleteSeat(${seat.id})" aria-label="Sitz löschen" title="Löschen">${icon('trash')}</button>
                    </div>
                </div>
                <div class="card-body">
                    ${seat.view_direction ? `<span>Blickrichtung ${escapeHtml(seat.view_direction)}</span>` : ''}
                    ${seat.shot_directions && seat.shot_directions.length > 0 ? `<span>Schussrichtungen ${escapeHtml(seat.shot_directions.join(', '))}</span>` : ''}
                    ${seat.latitude && seat.longitude ? '' : '<span class="hunt-note">Keine Koordinaten hinterlegt</span>'}
                    ${seat.notes ? `<span>${escapeHtml(seat.notes)}</span>` : ''}
                </div>
                <div><a class="link-btn" href="seat_details.html?id=${seat.id}">Details und Jagden${icon('chevron-right', 16)}</a></div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading seats:', error);
        container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><p>Fehler beim Laden der Sitze</p></div>';
    }
}

// Show seat form (new or edit)
function showSeatForm(seatId = null) {
    currentSeatId = seatId;
    const modal = document.getElementById('seat-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('seat-form');

    form.reset();
    document.querySelectorAll('input[name="shot-direction"]').forEach(cb => cb.checked = false);

    if (seatId) {
        title.textContent = 'Sitz bearbeiten';
        loadSeatData(seatId);
    } else {
        title.textContent = 'Neuen Sitz anlegen';
        document.getElementById('seat-id').value = '';
    }

    modal.style.display = 'flex';
}

// Load seat data for editing
async function loadSeatData(seatId) {
    try {
        const seat = await API.getSeat(seatId);

        document.getElementById('seat-id').value = seat.id;
        document.getElementById('seat-name').value = seat.name || '';
        document.getElementById('seat-hunting-area').value = seat.hunting_area_id || '';
        document.getElementById('seat-type').value = seat.type || 'Kanzel';
        document.getElementById('seat-latitude').value = seat.latitude || '';
        document.getElementById('seat-longitude').value = seat.longitude || '';
        document.getElementById('seat-view-direction').value = seat.view_direction || '';
        document.getElementById('seat-notes').value = seat.notes || '';

        // Set shot directions checkboxes
        if (seat.shot_directions && Array.isArray(seat.shot_directions)) {
            seat.shot_directions.forEach(direction => {
                const checkbox = document.querySelector(`input[name="shot-direction"][value="${direction}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }
    } catch (error) {
        console.error('Error loading seat data:', error);
        showError('Fehler beim Laden der Sitzdaten: ' + error.message);
    }
}

// Close modal
function closeSeatModal() {
    document.getElementById('seat-modal').style.display = 'none';
    currentSeatId = null;
}

// Save seat (create or update)
async function saveSeat(event) {
    event.preventDefault();

    const seatId = document.getElementById('seat-id').value;

    // Collect shot directions
    const shotDirections = Array.from(document.querySelectorAll('input[name="shot-direction"]:checked'))
        .map(cb => cb.value);

    const seatData = {
        name: document.getElementById('seat-name').value,
        hunting_area_id: parseInt(document.getElementById('seat-hunting-area').value),
        type: document.getElementById('seat-type').value,
        latitude: document.getElementById('seat-latitude').value || null,
        longitude: document.getElementById('seat-longitude').value || null,
        view_direction: document.getElementById('seat-view-direction').value || null,
        shot_directions: shotDirections.length > 0 ? shotDirections : null,
        notes: document.getElementById('seat-notes').value || null
    };

    try {
        if (seatId) {
            await API.updateSeat(seatId, seatData);
        } else {
            await API.createSeat(seatData);
        }

        closeSeatModal();
        showSuccess(seatId ? 'Sitz gespeichert' : 'Sitz angelegt');
        loadSeats();
    } catch (error) {
        console.error('Error saving seat:', error);
        showError('Fehler beim Speichern des Sitzes: ' + error.message);
    }
}

// Edit seat
function editSeat(seatId) {
    showSeatForm(seatId);
}

// Delete seat
async function deleteSeat(seatId) {
    if (!confirm('Möchten Sie diesen Sitz wirklich löschen?')) {
        return;
    }

    try {
        await API.deleteSeat(seatId);
        loadSeats();
    } catch (error) {
        console.error('Error deleting seat:', error);
        showError('Fehler beim Löschen des Sitzes: ' + error.message);
    }
}
