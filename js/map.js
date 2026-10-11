/**
 * Map Utilities using Leaflet.js
 */

// Initialize a map
function initMap(elementId, center = [51.1657, 10.4515], zoom = 13) {
    const map = L.map(elementId).setView(center, zoom);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    return map;
}

// Add a seat marker to the map
function addSeatMarker(map, seat, options = {}) {
    if (!seat.latitude || !seat.longitude) {
        return null;
    }

    const position = [parseFloat(seat.latitude), parseFloat(seat.longitude)];

    // Create custom icon based on seat type
    const iconUrl = getSeatIcon(seat.type);
    const icon = L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    const marker = L.marker(position, { icon: icon }).addTo(map);

    // Add popup with seat info
    if (options.showPopup !== false) {
        const popupContent = `
            <strong>${escapeHtml(seat.name)}</strong><br>
            ${escapeHtml(seat.type)}<br>
            ${escapeHtml(seat.hunting_area_name)}
        `;
        marker.bindPopup(popupContent);
    }

    // Add click handler if provided
    if (options.onClick) {
        marker.on('click', () => options.onClick(seat));
    }

    return marker;
}

// Get icon URL based on seat type
function getSeatIcon(type) {
    // Helper function to safely encode UTF-8 strings (including emojis) to base64
    const safeBtoa = (str) => btoa(unescape(encodeURIComponent(str)));

    // Using emoji as data URLs for simplicity
    // In production, you might want to use actual icon files
    const icons = {
        'Kanzel': 'data:image/svg+xml;base64,' + safeBtoa(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="#4CAF50" stroke="#fff" stroke-width="3"/>
                <text x="50" y="65" font-size="50" text-anchor="middle" fill="#fff">🪑</text>
            </svg>
        `),
        'Drückjagdbock': 'data:image/svg+xml;base64,' + safeBtoa(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="#FF9800" stroke="#fff" stroke-width="3"/>
                <text x="50" y="65" font-size="50" text-anchor="middle" fill="#fff">🎯</text>
            </svg>
        `),
        'Ansitzleiter': 'data:image/svg+xml;base64,' + safeBtoa(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="#2196F3" stroke="#fff" stroke-width="3"/>
                <text x="50" y="65" font-size="50" text-anchor="middle" fill="#fff">🪜</text>
            </svg>
        `),
        'Sonstige': 'data:image/svg+xml;base64,' + safeBtoa(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="#9E9E9E" stroke="#fff" stroke-width="3"/>
                <text x="50" y="65" font-size="50" text-anchor="middle" fill="#fff">📍</text>
            </svg>
        `)
    };

    return icons[type] || icons['Sonstige'];
}

// Add view direction arrow
function addViewDirection(map, seat) {
    if (!seat.latitude || !seat.longitude || !seat.view_direction) {
        return null;
    }

    const position = [parseFloat(seat.latitude), parseFloat(seat.longitude)];
    const direction = getDirectionDegrees(seat.view_direction);

    // Calculate arrow endpoint (100 meters in the view direction)
    const distance = 0.001; // Approximately 100 meters
    const endLat = position[0] + distance * Math.cos(direction * Math.PI / 180);
    const endLng = position[1] + distance * Math.sin(direction * Math.PI / 180);

    // Draw arrow
    const arrow = L.polyline([position, [endLat, endLng]], {
        color: '#2196F3',
        weight: 3,
        opacity: 0.8
    }).addTo(map);

    // Add arrowhead
    const arrowHead = L.marker([endLat, endLng], {
        icon: L.divIcon({
            className: 'arrow-head',
            html: `<div style="transform: rotate(${direction}deg); font-size: 20px;">▶</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map);

    return { arrow, arrowHead };
}

// Add shot direction sectors
function addShotDirections(map, seat) {
    if (!seat.latitude || !seat.longitude || !seat.shot_directions || seat.shot_directions.length === 0) {
        return [];
    }

    const position = [parseFloat(seat.latitude), parseFloat(seat.longitude)];
    const sectors = [];

    seat.shot_directions.forEach(direction => {
        const degrees = getDirectionDegrees(direction);
        const sector = createDirectionSector(position, degrees, 0.002, '#4CAF50');
        sector.addTo(map);
        sectors.push(sector);
    });

    return sectors;
}

// Create a direction sector (pie slice)
function createDirectionSector(center, degrees, radius, color) {
    const startAngle = degrees - 22.5; // 45-degree sector
    const endAngle = degrees + 22.5;

    const points = [center];

    // Generate arc points
    for (let angle = startAngle; angle <= endAngle; angle += 5) {
        const rad = angle * Math.PI / 180;
        const lat = center[0] + radius * Math.cos(rad);
        const lng = center[1] + radius * Math.sin(rad);
        points.push([lat, lng]);
    }

    points.push(center);

    return L.polygon(points, {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: 2
    });
}

// Convert direction name to degrees
function getDirectionDegrees(direction) {
    const directions = {
        'N': 0,
        'NO': 45,
        'O': 90,
        'SO': 135,
        'S': 180,
        'SW': 225,
        'W': 270,
        'NW': 315
    };
    return directions[direction] || 0;
}

// Fit map to show all markers
function fitMapToMarkers(map, markers) {
    if (markers.length === 0) return;

    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
}
