/**
 * API Client for Hunting Database
 */

const API_BASE = 'api';

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

class API {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}/${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                throw new Error(`Ungültige Antwort vom Server (HTTP ${response.status})`);
            }

            if (!response.ok) {
                throw new Error(data.error || 'An error occurred');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Hunting Areas
    static async getHuntingAreas() {
        return this.request('hunting-areas');
    }

    static async getHuntingArea(id) {
        return this.request(`hunting-areas/${id}`);
    }

    static async createHuntingArea(data) {
        return this.request('hunting-areas', {
            method: 'POST',
            body: data
        });
    }

    static async updateHuntingArea(id, data) {
        return this.request(`hunting-areas/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteHuntingArea(id) {
        return this.request(`hunting-areas/${id}`, {
            method: 'DELETE'
        });
    }

    // Animal Species
    static async getAnimalSpecies(category = null) {
        const endpoint = category ? `animal-species?category=${category}` : 'animal-species';
        return this.request(endpoint);
    }

    static async getAnimalSpeciesItem(id) {
        return this.request(`animal-species/${id}`);
    }

    static async createAnimalSpecies(data) {
        return this.request('animal-species', {
            method: 'POST',
            body: data
        });
    }

    static async updateAnimalSpecies(id, data) {
        return this.request(`animal-species/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteAnimalSpecies(id) {
        return this.request(`animal-species/${id}`, {
            method: 'DELETE'
        });
    }

    // Hunts
    static async getHunts(filters = {}) {
        const params = new URLSearchParams();

        // Basic filters
        if (filters.hunting_area_id) params.append('hunting_area_id', filters.hunting_area_id);
        if (filters.season_year) params.append('season_year', filters.season_year);
        if (filters.year) params.append('year', filters.year); // Legacy support
        if (filters.month) params.append('month', filters.month);
        if (filters.animal_species_id) params.append('animal_species_id', filters.animal_species_id);

        // Advanced filters
        if (filters.hunt_type) params.append('hunt_type', filters.hunt_type);
        if (filters.has_observed) params.append('has_observed', filters.has_observed);
        if (filters.has_harvested) params.append('has_harvested', filters.has_harvested);
        if (filters.wind_direction) params.append('wind_direction', filters.wind_direction);
        if (filters.temperature_min) params.append('temperature_min', filters.temperature_min);
        if (filters.temperature_max) params.append('temperature_max', filters.temperature_max);
        if (filters.precipitation_min) params.append('precipitation_min', filters.precipitation_min);
        if (filters.precipitation_max) params.append('precipitation_max', filters.precipitation_max);
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
        if (filters.seat) params.append('seat', filters.seat);

        const query = params.toString();
        const endpoint = query ? `hunts?${query}` : 'hunts';
        return this.request(endpoint);
    }

    static async getHunt(id) {
        return this.request(`hunts/${id}`);
    }

    static async createHunt(data) {
        return this.request('hunts', {
            method: 'POST',
            body: data
        });
    }

    static async updateHunt(id, data) {
        return this.request(`hunts/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteHunt(id) {
        return this.request(`hunts/${id}`, {
            method: 'DELETE'
        });
    }

    // Observed Animals
    static async getObservedAnimals(huntId = null) {
        const endpoint = huntId ? `observed-animals?hunt_id=${huntId}` : 'observed-animals';
        return this.request(endpoint);
    }

    static async createObservedAnimal(data) {
        return this.request('observed-animals', {
            method: 'POST',
            body: data
        });
    }

    static async deleteObservedAnimal(id) {
        return this.request(`observed-animals/${id}`, {
            method: 'DELETE'
        });
    }

    // Harvested Animals
    static async getHarvestedAnimals(huntId = null) {
        const endpoint = huntId ? `harvested-animals?hunt_id=${huntId}` : 'harvested-animals';
        return this.request(endpoint);
    }

    static async createHarvestedAnimal(data) {
        return this.request('harvested-animals', {
            method: 'POST',
            body: data
        });
    }

    static async deleteHarvestedAnimal(id) {
        return this.request(`harvested-animals/${id}`, {
            method: 'DELETE'
        });
    }

    // Reports
    static async getReport(type, filters = {}) {
        const params = new URLSearchParams();
        if (filters.season_year) params.append('season_year', filters.season_year);
        if (filters.year) params.append('year', filters.year); // Legacy support
        if (filters.hunting_area_id) params.append('hunting_area_id', filters.hunting_area_id);

        const query = params.toString();
        const endpoint = query ? `reports/${type}?${query}` : `reports/${type}`;
        return this.request(endpoint);
    }

    // Hunting Seasons
    static async getHuntingSeasons() {
        return this.request('hunting-seasons');
    }

    static async getHuntingSeason(seasonYear) {
        return this.request(`hunting-seasons/${encodeURIComponent(seasonYear)}`);
    }

    // Weather
    static async getWeatherForHunt(huntId) {
        return this.request(`weather/${huntId}`);
    }

    static async fetchWeather(data) {
        return this.request('weather', {
            method: 'POST',
            body: data
        });
    }

    static async deleteWeatherData(huntId) {
        return this.request(`weather/${huntId}`, {
            method: 'DELETE'
        });
    }

    // Seats
    static async getSeats(filters = {}) {
        const params = new URLSearchParams();
        if (filters.hunting_area_id) params.append('hunting_area_id', filters.hunting_area_id);

        const query = params.toString();
        const endpoint = query ? `seats?${query}` : 'seats';
        return this.request(endpoint);
    }

    static async getSeat(id) {
        return this.request(`seats/${id}`);
    }

    static async createSeat(data) {
        return this.request('seats', {
            method: 'POST',
            body: data
        });
    }

    static async updateSeat(id, data) {
        return this.request(`seats/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteSeat(id) {
        return this.request(`seats/${id}`, {
            method: 'DELETE'
        });
    }
}
