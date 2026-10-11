# Handy-App (Entwicklung)

Dieser Ordner enthält nur die Dateien, die es ausschließlich in der Handy-App gibt. Die fertige App
(`deploy/mobile/` bzw. `deploy/jagdtagebuch-mobile.zip`) baut `php tools/build.php` aus diesen Dateien und
den Seiten, Skripten, Styles und Bildern der Web-App.

| Datei | Zweck |
|---|---|
| `js/db.js` | SQLite-Datenbank im Browser (sql.js), gespeichert in IndexedDB; Export/Import der Sicherungen |
| `js/api.js` | Gleiche Methoden wie `js/api.js` der Web-App, aber gegen die lokale Datenbank statt die PHP-API |
| `js/backup.js` | Registerkarte „Daten“ (Sicherung speichern/teilen/importieren, CSV-Export) |
| `js/pwa.js` | Service Worker registrieren, fehlendes Wetter nachladen, Erinnerung an Sicherungen |
| `sw.js` | Service Worker: App-Dateien und gesehene Kartenkacheln offline vorhalten |
| `manifest.webmanifest` | Name, Icons und Farben für die Installation |
| `css/mobile.css` | Lokale Schriften und Styles der Registerkarte „Daten“ |
| `vendor/` | sql.js 1.10.3, Leaflet 1.9.4, IBM Plex Sans (lokal, weil offline kein CDN erreichbar ist) |

## Regeln

- Ändert sich die PHP-API (`api/handlers/*.php`), muss `mobile/js/api.js` mitgezogen werden
  (gleiche Rückgabeformen, sonst funktioniert `js/app.js` in der Handy-App nicht).
- Globale Namen in `mobile/js/*.js` dürfen nicht mit denen der gemeinsamen Skripte kollidieren
  (alle Skripte teilen sich den globalen Gültigkeitsbereich).
- Das Sicherungsformat (`format: 'jagddatenbank-backup'`) ist zwischen Web-App (`api/handlers/backup.php`)
  und Handy-App gleich und darf sich nur abwärtskompatibel ändern.

## Lokal testen

`php tools/build.php` ausführen und `http://localhost/<projektordner>/deploy/mobile/` öffnen
(Service Worker laufen nur über `localhost` oder HTTPS).
