// Advanced Filter Functions

function toggleAdvancedFilters() {
    const panel = document.getElementById('advanced-filters');
    const button = document.getElementById('advanced-filters-toggle');
    const open = panel.style.display === 'none';

    panel.style.display = open ? 'block' : 'none';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.querySelector('.label').textContent = open ? 'Filter ausblenden' : 'Weitere Filter';
}

function resetAdvancedFilters() {
    // Reset all advanced filter fields
    document.getElementById('filter-hunt-type').value = '';
    document.getElementById('filter-has-observed').checked = false;
    document.getElementById('filter-has-harvested').checked = false;
    document.getElementById('filter-wind-direction').value = '';
    document.getElementById('filter-temp-min').value = '';
    document.getElementById('filter-temp-max').value = '';
    document.getElementById('filter-precip-min').value = '';
    document.getElementById('filter-precip-max').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-seat').value = '';

    // Reload hunts with basic filters only
    loadHunts();
}

function applyAdvancedFilters() {
    loadHunts();
}

function displayActiveFilters() {
    const container = document.getElementById('active-filters');
    if (!container) return;

    const activeFilters = [];

    // Check each filter and create badge
    const huntType = document.getElementById('filter-hunt-type')?.value;
    if (huntType) activeFilters.push({ key: 'hunt-type', label: 'Jagdart', value: huntType });

    const hasObserved = document.getElementById('filter-has-observed')?.checked;
    if (hasObserved) activeFilters.push({ key: 'has-observed', label: 'Tiere gesehen', value: 'Ja' });

    const hasHarvested = document.getElementById('filter-has-harvested')?.checked;
    if (hasHarvested) activeFilters.push({ key: 'has-harvested', label: 'Tiere erlegt', value: 'Ja' });

    const windDirection = document.getElementById('filter-wind-direction')?.value;
    if (windDirection) {
        const windNames = { N: 'Nord', NO: 'Nordost', O: 'Ost', SO: 'Südost', S: 'Süd', SW: 'Südwest', W: 'West', NW: 'Nordwest' };
        activeFilters.push({ key: 'wind-direction', label: 'Wind', value: windNames[windDirection] || windDirection });
    }

    const tempMin = document.getElementById('filter-temp-min')?.value;
    const tempMax = document.getElementById('filter-temp-max')?.value;
    if (tempMin || tempMax) {
        const tempRange = `${tempMin || '∞'} - ${tempMax || '∞'} °C`;
        activeFilters.push({ key: 'temperature', label: 'Temperatur', value: tempRange });
    }

    const precipMin = document.getElementById('filter-precip-min')?.value;
    const precipMax = document.getElementById('filter-precip-max')?.value;
    if (precipMin || precipMax) {
        const precipRange = `${precipMin || '0'} - ${precipMax || '∞'} mm`;
        activeFilters.push({ key: 'precipitation', label: 'Niederschlag', value: precipRange });
    }

    const dateFrom = document.getElementById('filter-date-from')?.value;
    const dateTo = document.getElementById('filter-date-to')?.value;
    if (dateFrom || dateTo) {
        const dateRange = `${dateFrom || '...'} - ${dateTo || '...'}`;
        activeFilters.push({ key: 'date-range', label: 'Zeitraum', value: dateRange });
    }

    const seat = document.getElementById('filter-seat')?.value;
    if (seat) activeFilters.push({ key: 'seat', label: 'Sitz', value: seat });

    // Display active filters
    if (activeFilters.length > 0) {
        container.innerHTML = activeFilters.map(f =>
            `<span class="filter-badge">
                ${f.label}: ${escapeHtml(f.value)} 
                <button onclick="removeFilter('${f.key}')" aria-label="Filter ${f.label} entfernen">${icon('x', 14)}</button>
            </span>`
        ).join('');
        container.style.display = 'flex';
    } else {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

function removeFilter(filterKey) {
    // Clear the specific filter
    switch (filterKey) {
        case 'hunt-type':
            document.getElementById('filter-hunt-type').value = '';
            break;
        case 'has-observed':
            document.getElementById('filter-has-observed').checked = false;
            break;
        case 'has-harvested':
            document.getElementById('filter-has-harvested').checked = false;
            break;
        case 'wind-direction':
            document.getElementById('filter-wind-direction').value = '';
            break;
        case 'temperature':
            document.getElementById('filter-temp-min').value = '';
            document.getElementById('filter-temp-max').value = '';
            break;
        case 'precipitation':
            document.getElementById('filter-precip-min').value = '';
            document.getElementById('filter-precip-max').value = '';
            break;
        case 'date-range':
            document.getElementById('filter-date-from').value = '';
            document.getElementById('filter-date-to').value = '';
            break;
        case 'seat':
            document.getElementById('filter-seat').value = '';
            break;
    }

    // Reload hunts
    loadHunts();
}
