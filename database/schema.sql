-- Jagdtagebuch: leere Datenbank (nur Tabellen, keine Daten)
--
-- In die beim Hoster angelegte Datenbank importieren, z. B. mit phpMyAdmin:
-- Datenbank auswählen -> "Importieren" -> diese Datei -> "OK".
-- Die Daten kommen danach über import/index.html -> "Sicherung importieren".

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `hunting_areas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `area_size` decimal(10,2) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_coordinates` (`latitude`,`longitude`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `animal_species` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `scientific_name` varchar(255) DEFAULT NULL,
  `category` enum('Wild','Raubwild','Federwild','Schalenwild') DEFAULT 'Wild',
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `seats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hunting_area_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` enum('Kanzel','Drückjagdbock','Ansitzleiter','Sonstige') DEFAULT 'Kanzel',
  `latitude` decimal(10,8) DEFAULT NULL COMMENT 'Breitengrad',
  `longitude` decimal(11,8) DEFAULT NULL COMMENT 'Längengrad',
  `view_direction` varchar(10) DEFAULT NULL COMMENT 'Hauptblickrichtung: N, NO, O, SO, S, SW, W, NW',
  `shot_directions` longtext DEFAULT NULL COMMENT 'Mögliche Schussrichtungen als JSON-Array',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hunting_area` (`hunting_area_id`),
  CONSTRAINT `seats_ibfk_1` FOREIGN KEY (`hunting_area_id`) REFERENCES `hunting_areas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hunts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `hunting_area_id` int(11) NOT NULL,
  `seat_id` int(11) DEFAULT NULL,
  `hunt_type` enum('Ansitz','Drückjagd','Gruppenansitz') DEFAULT 'Ansitz',
  `seat` varchar(100) DEFAULT NULL,
  `time_from` time DEFAULT NULL,
  `time_to` time DEFAULT NULL,
  `weather` varchar(100) DEFAULT NULL,
  `temperature` decimal(5,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `costs` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_date` (`date`),
  KEY `idx_hunting_area` (`hunting_area_id`),
  KEY `idx_date_hunting_area` (`date`,`hunting_area_id`),
  KEY `fk_hunts_seat` (`seat_id`),
  CONSTRAINT `fk_hunts_seat` FOREIGN KEY (`seat_id`) REFERENCES `seats` (`id`) ON DELETE SET NULL,
  CONSTRAINT `hunts_ibfk_1` FOREIGN KEY (`hunting_area_id`) REFERENCES `hunting_areas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `observed_animals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hunt_id` int(11) NOT NULL,
  `animal_species_id` int(11) NOT NULL,
  `quantity` int(11) DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hunt` (`hunt_id`),
  KEY `idx_animal_species` (`animal_species_id`),
  CONSTRAINT `fk_observed_animals_animal_species` FOREIGN KEY (`animal_species_id`) REFERENCES `animal_species` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `observed_animals_ibfk_1` FOREIGN KEY (`hunt_id`) REFERENCES `hunts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `harvested_animals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hunt_id` int(11) NOT NULL,
  `animal_species_id` int(11) NOT NULL,
  `quantity` int(11) DEFAULT 1,
  `weight` decimal(8,2) DEFAULT NULL,
  `shot_distance` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hunt` (`hunt_id`),
  KEY `idx_animal_species` (`animal_species_id`),
  CONSTRAINT `fk_harvested_animals_animal_species` FOREIGN KEY (`animal_species_id`) REFERENCES `animal_species` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `harvested_animals_ibfk_1` FOREIGN KEY (`hunt_id`) REFERENCES `hunts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `weather_data` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hunt_id` int(11) NOT NULL,
  `temperature` decimal(5,2) DEFAULT NULL COMMENT 'Temperatur in °C',
  `precipitation` decimal(6,2) DEFAULT NULL COMMENT 'Niederschlag in mm',
  `wind_speed` decimal(5,2) DEFAULT NULL COMMENT 'Windgeschwindigkeit in km/h',
  `wind_direction` int(11) DEFAULT NULL COMMENT 'Windrichtung in Grad (0-360)',
  `pressure` decimal(7,2) DEFAULT NULL COMMENT 'Luftdruck in hPa',
  `humidity` int(11) DEFAULT NULL COMMENT 'Relative Luftfeuchte in %',
  `cloud_cover` int(11) DEFAULT NULL COMMENT 'Bewölkung in %',
  `weather_code` int(11) DEFAULT NULL COMMENT 'WMO-Wettercode',
  `fetched_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hunt` (`hunt_id`),
  CONSTRAINT `weather_data_ibfk_1` FOREIGN KEY (`hunt_id`) REFERENCES `hunts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
