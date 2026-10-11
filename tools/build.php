<?php
/**
 * Builds both variants for end users into deploy/ (not in Git):
 *
 *   deploy/mobile/                    offline app, ready to upload (also for testing locally)
 *   deploy/jagdtagebuch-mobile.zip    the same as ZIP, with guide
 *   deploy/jagdtagebuch-web.zip       web app for a webserver, with guide and empty database
 *
 * The offline app is the web app's pages, scripts and styles plus the mobile-only files in mobile/
 * (local SQLite database instead of the PHP API, service worker, manifest, vendor libraries).
 *
 * Usage:  php tools/build.php [version]     e.g. php tools/build.php v1.2.0
 * The GitHub workflow .github/workflows/release.yml runs this for every tag v*.
 */

$root = dirname(__DIR__);
$deploy = "$root/deploy";
$version = $argv[1] ?? date('Y-m-d-His');

if (!class_exists('ZipArchive')) {
    fail('Die PHP-Erweiterung zip fehlt.');
}

buildMobile($root, "$deploy/mobile", $version);
zipDirectory("$deploy/mobile", "$deploy/jagdtagebuch-mobile.zip", [
    'ANLEITUNG.md' => file_get_contents("$root/tools/mobile/ANLEITUNG.md"),
]);
buildWebZip($root, "$deploy/jagdtagebuch-web.zip");

echo "Fertig ($version):\n";
foreach (['jagdtagebuch-mobile.zip', 'jagdtagebuch-web.zip'] as $file) {
    echo "  deploy/$file (" . round(filesize("$deploy/$file") / 1024) . " KB)\n";
}

// --- Offline app ---

function buildMobile($root, $target, $version) {
    removeDirectory($target);

    // Shared with the web app
    $shared = ['css/style.css'];
    foreach (['js/*.js', 'img/*'] as $pattern) {
        foreach (glob("$root/$pattern") as $path) {
            $shared[] = substr($path, strlen($root) + 1);
        }
    }
    // The web app's api.js talks to PHP; the offline app has its own in mobile/js/api.js
    $shared = array_diff($shared, ['js/api.js']);
    foreach ($shared as $file) {
        copyFile("$root/$file", "$target/$file");
    }

    // Mobile-only files (mobile/README.md is the developer documentation, not part of the app)
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$root/mobile", FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $path) {
        $file = str_replace('\\', '/', substr($path->getPathname(), strlen("$root/mobile") + 1));
        if ($file !== 'README.md') {
            copyFile($path->getPathname(), "$target/$file");
        }
    }

    foreach (['index.html', 'seats.html', 'seat_details.html'] as $page) {
        file_put_contents("$target/$page", mobilePage(file_get_contents("$root/$page"), $page));
    }

    // New cache version, so installed apps pick up the changed files
    $sw = file_get_contents("$target/sw.js");
    $sw = preg_replace("#const VERSION = '[^']*';#", "const VERSION = '" . addslashes($version) . "';", $sw, 1, $count);
    $count === 1 or fail('sw.js: VERSION nicht gefunden');
    file_put_contents("$target/sw.js", $sw);
}

// Same markup as the web app, but local fonts/Leaflet, the local database and the PWA scripts
function mobilePage($html, $page) {
    // Google Fonts and unpkg are not available offline: use the copies in vendor/
    $html = preg_replace('#\s*<link rel="preconnect"[^>]*>#', '', $html);
    $html = str_replace(
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap">',
        '<link rel="stylesheet" href="css/mobile.css">',
        $html
    );
    $html = str_replace('https://unpkg.com/leaflet@1.9.4/dist/', 'vendor/leaflet/', $html);

    // Manifest and theme color, so the page can be installed as an app
    $html = str_replace(
        '<link rel="apple-touch-icon" href="img/apple-touch-icon.png">',
        '<link rel="apple-touch-icon" href="img/apple-touch-icon.png">' . "\n"
        . '    <link rel="manifest" href="manifest.webmanifest">' . "\n"
        . '    <meta name="theme-color" content="#2F5D3A">',
        $html
    );

    // Extra tab "Daten" (export/import) after "Auswertungen"
    $html = preg_replace_callback(
        '#^(\s*)<a class="nav-link[^"]*" href="(index\.html)?\#auswertungen"[^>]*>.*?</a>\s*$#m',
        function ($m) {
            $otherPage = !empty($m[2]); // seats pages link to index.html#..., index.html uses data-page
            $href = $otherPage ? 'index.html#daten' : '#daten';
            $dataPage = $otherPage ? '' : ' data-page="daten"';
            return $m[0] . "\n" . $m[1]
                . "<a class=\"nav-link\" href=\"$href\"$dataPage><span data-icon=\"database\" data-size=\"22\"></span>Daten</a>";
        },
        $html
    );

    // Local database before api.js; backup.js (tab "Daten") and pwa.js after ui.js
    $html = str_replace(
        '<script src="js/api.js"></script>',
        '<script src="vendor/sql-wasm.js"></script>' . "\n"
        . '    <script src="js/db.js"></script>' . "\n"
        . '    <script src="js/api.js"></script>',
        $html
    );
    $html = str_replace(
        '<script src="js/ui.js"></script>',
        '<script src="js/ui.js"></script>' . "\n"
        . '    <script src="js/backup.js"></script>' . "\n"
        . '    <script src="js/pwa.js"></script>',
        $html
    );

    foreach (['css/mobile.css', 'manifest.webmanifest', 'vendor/sql-wasm.js', 'js/backup.js', 'Daten'] as $needle) {
        strpos($html, $needle) !== false
            or fail("$page: Anpassung für '$needle' hat nicht gegriffen, bitte tools/build.php prüfen");
    }
    return $html;
}

// --- Web app ---

function buildWebZip($root, $target) {
    $files = [
        'index.html', 'seats.html', 'seat_details.html',
        'css/style.css',
        'api/index.php', 'api/helpers/hunting_season.php',
        'config/.htaccess', 'config/database.php', 'config/config.example.php',
        'database/.htaccess', 'database/schema.sql',
        'import/index.html', 'import/import_csv.php',
    ];
    foreach (['js/*.js', 'img/*', 'api/handlers/*.php'] as $pattern) {
        foreach (glob("$root/$pattern") as $path) {
            $files[] = substr($path, strlen($root) + 1);
        }
    }

    @unlink($target);
    $zip = new ZipArchive();
    $zip->open($target, ZipArchive::CREATE) === true or fail("Konnte $target nicht anlegen");
    foreach ($files as $file) {
        $zip->addFile("$root/$file", $file) or fail("Konnte $file nicht hinzufügen");
    }
    $zip->addFile("$root/.htaccess", '.htaccess');
    // Ready to fill in: config.php with the placeholders of the example
    $zip->addFile("$root/config/config.example.php", 'config/config.php');
    $zip->addFile("$root/tools/web/ANLEITUNG.md", 'ANLEITUNG.md');
    $zip->addFile("$root/database/schema.sql", 'datenbank_leer.sql');
    $zip->close();
}

// --- Helpers ---

function zipDirectory($dir, $target, $extra = []) {
    @unlink($target);
    $zip = new ZipArchive();
    $zip->open($target, ZipArchive::CREATE) === true or fail("Konnte $target nicht anlegen");
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $path) {
        $zip->addFile($path->getPathname(), str_replace('\\', '/', substr($path->getPathname(), strlen($dir) + 1)));
    }
    foreach ($extra as $name => $content) {
        $zip->addFromString($name, $content);
    }
    $zip->close();
}

function copyFile($from, $to) {
    if (!is_dir(dirname($to))) {
        mkdir(dirname($to), 0777, true);
    }
    copy($from, $to) or fail("Konnte $from nicht kopieren");
}

function removeDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $path) {
        $path->isDir() ? rmdir($path->getPathname()) : unlink($path->getPathname());
    }
    rmdir($dir);
}

function fail($message) {
    fwrite(STDERR, $message . "\n");
    exit(1);
}
