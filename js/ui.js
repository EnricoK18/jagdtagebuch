/**
 * Shared UI helpers: line icons and toast notifications (used by every page)
 */

// Stroke icons on a 24x24 grid, drawn with currentColor
const ICONS = {
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'pencil': '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
    'trash': '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    'more': '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    'sliders': '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    'search': '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'refresh': '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    'list': '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    'table': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/>',
    'map-pin': '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    'map': '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
    'tag': '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    'chart': '<path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/>',
    'eye': '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    'target': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    'wind': '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
    'thermometer': '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    'cloud': '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/>',
    'cloud-sun': '<path d="M8 4.5V3M3.9 6.4l1 1M2.5 11H4M12.1 6.4l-1 1"/><path d="M5.6 12.5A3.5 3.5 0 1 1 11.6 9"/><path d="M9 20h8a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.8A2.6 2.6 0 0 0 9 20z"/>',
    'cloud-fog': '<path d="M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 13zM5 17h14M7 21h10"/>',
    'cloud-rain': '<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    'cloud-snow': '<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15zM8 19h.01M12 21h.01M16 19h.01"/>',
    'cloud-storm': '<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15zM13 15l-2 3.5h3L12 22"/>',
    'alert': '<path d="M12 3l10 18H2L12 3zM12 10v4M12 17.5h.01"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'
};

function icon(name, size = 18, extraClass = '') {
    const paths = ICONS[name] || '';
    return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// Replace <span data-icon="name" data-size="20"></span> placeholders in static markup
function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        el.outerHTML = icon(el.dataset.icon, parseInt(el.dataset.size) || 18);
    });
}

// WMO weather code -> icon name
function weatherIcon(code) {
    if (code === null || code === undefined) return 'cloud';
    code = parseInt(code);
    if (code <= 1) return 'sun';
    if (code === 2) return 'cloud-sun';
    if (code === 45 || code === 48) return 'cloud-fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'cloud-snow';
    if (code >= 95) return 'cloud-storm';
    if (code >= 51) return 'cloud-rain';
    return 'cloud';
}

// Toast notifications
function showToast(message, type = 'success', duration = 5000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
    toast.innerHTML = `
        <span class="toast-icon">${icon(iconName, 18)}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Benachrichtigung schließen" title="Schließen">${icon('x', 16)}</button>
    `;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

function showSuccess(message) {
    showToast(message, 'success', 4000);
}

function showError(message) {
    showToast(message, 'error', 6000);
}

function showWarning(message) {
    showToast(message, 'warning', 5000);
}

document.addEventListener('DOMContentLoaded', () => hydrateIcons());
