/**
 * Utility functions for the hunting database
 */

/**
 * Format a date string to German format (DD.MM.YYYY)
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Format a time string to HH:MM format
 * @param {string} timeString - Time string
 * @returns {string} Formatted time string
 */
function formatTime(timeString) {
    if (!timeString) return '-';
    return timeString.substring(0, 5); // Extract HH:MM from HH:MM:SS
}

/**
 * Format a number with thousand separators
 * @param {number} number - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(number) {
    if (number === null || number === undefined) return '0';
    return new Intl.NumberFormat('de-DE').format(number);
}

/**
 * Get the current hunting season year
 * @returns {string} Season year in format YYYY/YYYY
 */
function getCurrentSeasonYear() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    // Hunting season starts in April
    if (month >= 4) {
        return `${year}/${year + 1}`;
    } else {
        return `${year - 1}/${year}`;
    }
}

// showSuccess / showError: see js/ui.js
