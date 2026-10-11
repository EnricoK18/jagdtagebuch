# Jagdtagebuch – Handy-App installieren

Die Handy-App läuft komplett auf dem Handy, auch ohne Internet. Alle Daten bleiben auf dem Gerät.
Internet wird nur für die Wetterabfrage und für noch nicht geladene Kartenausschnitte gebraucht.

## Voraussetzungen

- Ein Webspace mit **HTTPS** (ohne HTTPS lässt sich die App nicht installieren). PHP oder eine Datenbank
  sind nicht nötig, es reicht reiner Speicherplatz für statische Dateien.
- Android-Handy mit **Chrome** (andere Browser wie Edge oder Samsung Internet funktionieren meist auch).

## 1. Hochladen

Den gesamten Inhalt dieses Pakets per FTP/SFTP in ein Verzeichnis auf dem Webspace laden, z. B. `/jagd/`.
Die versteckte Datei `.htaccess` mit hochladen (im FTP-Programm versteckte Dateien anzeigen).
`ANLEITUNG.md` muss nicht mit hoch.

## 2. Auf dem Handy installieren

1. In Chrome die Adresse öffnen, z. B. `https://deine-domain.de/jagd/`.
2. Menü **⋮** → **App installieren** (oder **Zum Startbildschirm hinzufügen**).
3. Ab jetzt die App über das Icon **Jagdtagebuch** auf dem Startbildschirm starten.

Nach dem ersten Öffnen ist alles auf dem Handy gespeichert. Die App startet dann auch im Flugmodus.

## 3. Loslegen

- Die wichtigsten Tierarten sind schon angelegt. Unter **Reviere** die eigenen Reviere anlegen
  (mit Koordinaten, dann wird das Wetter automatisch abgerufen), danach Jagden erfassen.
- Daten aus der Web-App übernehmen: dort auf `import/index.html` → **Sicherung herunterladen**,
  die Datei aufs Handy bringen und in der App unter **Daten → Sicherung importieren** einlesen.

## Wichtig: Daten sichern

Die Daten liegen **nur auf diesem Handy**. Geht das Handy verloren oder wird die App gelöscht, sind sie weg.

Unter **Daten** regelmäßig **Sicherung speichern** oder **Teilen** (z. B. an Google Drive oder per Mail).
Die App erinnert daran, wenn die letzte Sicherung länger als 14 Tage her ist.
Eine Sicherung lässt sich jederzeit wieder importieren, auch auf einem neuen Handy oder in der Web-App.

## Updates

Eine neue Version einfach wieder auf den Webspace laden (Dateien überschreiben). Die installierte App
lädt sie beim nächsten Start mit Internetverbindung; die Daten bleiben erhalten.
