# Jagdtagebuch

Digitales Jagdtagebuch: Ansitze und Drückjagden mit Anblick und Strecke erfassen, Sitze und Reviere verwalten
(mit Karte), Wetter automatisch abrufen und alles nach Jagdjahr, Revier, Tierart und Monat auswerten.

## Welche Variante?

| | **Handy-App** | **Web-App** |
|---|---|---|
| Läuft | auf dem Handy, **komplett offline** | auf einem eigenen Webserver, im Browser von überall |
| Daten | nur auf dem Handy (regelmäßig sichern!) | in einer MySQL/MariaDB-Datenbank auf dem Server |
| Braucht | Webspace mit HTTPS, nur einmal zum Installieren | Webspace mit PHP 8 und MySQL/MariaDB |
| Download | `jagdtagebuch-mobile.zip` | `jagdtagebuch-web.zip` |

Beide Varianten haben dieselbe Oberfläche und können Daten über eine Sicherungsdatei austauschen.

**Download:** unter [Releases](../../releases/latest). In jeder ZIP-Datei liegt eine `ANLEITUNG.md`
mit allen Schritten.

> Die Web-App hat keine eigene Anmeldung. Auf einem öffentlichen Webspace unbedingt das Verzeichnis per
> Passwort schützen (siehe Anleitung).

## Funktionen

- Jagden erfassen: Datum, Tageszeit, Revier, Sitz, Jagdart, Anblick und Strecke (mit Gewicht und Schussdistanz),
  Kosten, Bemerkungen
- Wetter zur Jagd automatisch von [Open-Meteo](https://open-meteo.com/) (Temperatur, Wind, Niederschlag, …)
- Sitze pro Revier mit Koordinaten, Blick- und Schussrichtungen, Karte und Statistik je Sitz
- Auswertungen nach Jagdjahr (1. April bis 31. März), Revier, Tierart und Monat
- Filter nach Wind, Temperatur, Niederschlag, Zeitraum und mehr
- Sicherung als Datei: Austausch zwischen Handy und Web-App, Export als CSV für Excel

## Entwicklung

Voraussetzungen: PHP 8 mit `pdo_mysql` und `zip`, MySQL oder MariaDB, Apache mit `mod_rewrite`
(z. B. XAMPP).

1. Repository in das Web-Verzeichnis klonen, z. B. `htdocs/jagdtagebuch`.
2. Datenbank anlegen und `database/schema.sql` importieren.
3. `config/config.example.php` nach `config/config.php` kopieren und die Zugangsdaten eintragen.
4. `http://localhost/jagdtagebuch/` öffnen.

Aufbau:

| Pfad | Inhalt |
|---|---|
| `index.html`, `seats.html`, `seat_details.html`, `js/`, `css/`, `img/` | Oberfläche (von beiden Varianten genutzt) |
| `api/` | PHP-API der Web-App |
| `mobile/` | Nur in der Handy-App: lokale Datenbank, Service Worker, Manifest ([Details](mobile/README.md)) |
| `import/` | Datenaustausch (Sicherung) und einmaliger CSV-Import |
| `database/schema.sql` | Leere Datenbank |
| `tools/build.php` | Baut beide Varianten nach `deploy/` |

### Release

```
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions baut dann beide ZIP-Dateien mit `tools/build.php` und veröffentlicht sie als Release.
Lokal geht dasselbe mit `php tools/build.php`, das Ergebnis liegt in `deploy/` (nicht im Git).

## Lizenz

[MIT](LICENSE). Fotos: CC0, siehe [img/BILDNACHWEIS.txt](img/BILDNACHWEIS.txt).
Enthaltene Bibliotheken: [sql.js](https://github.com/sql-js/sql.js) (MIT), [Leaflet](https://leafletjs.com/) (BSD-2-Clause),
[IBM Plex Sans](https://github.com/IBM/plex) (SIL Open Font License 1.1). Kartendaten © OpenStreetMap-Mitwirkende.
