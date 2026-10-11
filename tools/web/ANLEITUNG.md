# Jagdtagebuch – Installation auf einem Webserver

## Voraussetzungen

- Webspace mit **PHP 8.0 oder neuer** (Erweiterung `pdo_mysql`)
- **MySQL 8** oder **MariaDB 10.3** oder neuer
- **Apache** mit `mod_rewrite` (bei den meisten Hostern Standard)
- **HTTPS** (bei den meisten Hostern kostenlos über Let's Encrypt zuschaltbar)

## 1. Datenbank anlegen

1. Im Kundenbereich des Hosters eine neue MySQL-Datenbank anlegen. Datenbankname, Benutzer, Passwort
   und Server (oft `localhost`) notieren.
2. phpMyAdmin öffnen, die neue Datenbank auswählen → **Importieren** → Datei `datenbank_leer.sql`
   aus diesem Paket auswählen → **OK**.
   Danach gibt es 7 leere Tabellen (`hunts`, `hunting_areas`, `seats`, …).

## 2. Zugangsdaten eintragen

`config/config.php` mit einem Texteditor öffnen und die vier Werte ersetzen:

```php
define('DB_HOST', 'localhost');           // Server laut Hoster
define('DB_USER', 'DEIN_DB_BENUTZER');
define('DB_PASS', 'DEIN_DB_PASSWORT');
define('DB_NAME', 'DEIN_DB_NAME');
```

## 3. Dateien hochladen

Den gesamten Inhalt dieses Pakets per FTP/SFTP in das gewünschte Verzeichnis laden, z. B. `/jagd/`.
Die versteckte Datei **`.htaccess`** muss mit hochgeladen werden (im FTP-Programm versteckte Dateien anzeigen).

Die Seiten laufen, aber die Daten laden nicht
(Fehlermeldungen beim Öffnen)? Dann in der `.htaccess` die Zeile mit `RewriteBase` aktivieren (das `#` am Anfang entfernen) und den
Pfad eintragen, unter dem die App liegt, z. B. `RewriteBase /jagd/`.

## 4. Zugriff schützen (wichtig)

Die Web-App hat **keine eigene Anmeldung**. Ohne Schutz kann jeder, der die Adresse kennt, alle Daten
sehen, ändern oder durch einen Import ersetzen.

Am einfachsten über den Kundenbereich des Hosters: Dort gibt es meist „Verzeichnisschutz“ bzw.
„Passwortschutz für Verzeichnisse“. Das Verzeichnis der App auswählen und Benutzer und Passwort anlegen.
Danach fragt der Browser beim Öffnen einmal nach den Zugangsdaten.

## 5. Daten übernehmen (falls vorhanden)

1. In der bisherigen Installation `import/index.html` öffnen → **Sicherung herunterladen**
   (oder in der Handy-App unter **Daten** eine Sicherung speichern).
2. In der neuen Installation `https://deine-domain.de/jagd/import/index.html` öffnen →
   **Sicherung importieren** → die heruntergeladene Datei wählen.

Danach sind alle Jagden, Reviere, Sitze, Tierarten und Wetterdaten da. Mit derselben Funktion lassen sich
Daten zwischen Web-App und Handy-App austauschen (Handy-App: Registerkarte **Daten**).

Ohne Datenübernahme startet die App leer. Dann zuerst unter **Tierarten** und **Reviere** die
Grundeinträge anlegen, danach können Jagden erfasst werden.

## 6. Prüfen

- `https://deine-domain.de/jagd/` öffnen: Die Jagdenliste erscheint.
- Unter **Reviere** bei einem Revier Koordinaten eintragen. Beim Speichern einer Jagd wird dann das
  Wetter abgerufen (der Server braucht dafür ausgehende Verbindungen zu `open-meteo.com`).

## Hinweise

- Vor jedem Import legt die App den bisherigen Stand unter `database/backups/` auf dem Server ab
  (über das Web nicht abrufbar, per FTP erreichbar).
- `datenbank_leer.sql` und diese Anleitung können nach der Installation gelöscht werden. Über das Web
  sind sie ohnehin nicht abrufbar.
- Der CSV-Import auf `import/index.html` liest eine Datei `Jagdtagebuch.csv` im Hauptverzeichnis und
  ist nur für die allererste Übernahme aus der Excel-Tabelle gedacht.
