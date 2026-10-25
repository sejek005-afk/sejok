<?php
// ایشیم — پشتیبان‌گیری روزانه از پایگاه داده (فقط از خط فرمان / Cron اجرا می‌شود)
// خروجی: ~/eshim-backups/eshim-YYYYMMDD-HHMM.json.gz — ۱۴ نسخه آخر نگه داشته می‌شود.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/lib.php';

$cfg = require config_path();
$pdo = db($cfg);
$dir = (getenv('HOME') ?: dirname(__DIR__, 2)) . '/eshim-backups';
if (!is_dir($dir)) mkdir($dir, 0700, true);
@file_put_contents($dir . '/.htaccess', "Require all denied\n");

$tables = ['rw_users', 'rw_workspaces', 'rw_members', 'rw_devices', 'rw_records', 'rw_meta'];
$file = $dir . '/eshim-' . date('Ymd-His') . '.json.gz';
$gz = gzopen($file . '.tmp', 'wb6');
gzwrite($gz, '{"app":"eshim","created":' . now_ms() . ',"tables":{');
foreach ($tables as $i => $t) {
    gzwrite($gz, ($i ? ',' : '') . json_encode($t) . ':[');
    $first = true;
    foreach ($pdo->query("SELECT * FROM $t") as $row) {
        gzwrite($gz, ($first ? '' : ',') . json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $first = false;
    }
    gzwrite($gz, ']');
}
gzwrite($gz, '}}');
gzclose($gz);
rename($file . '.tmp', $file);
chmod($file, 0600);

// فقط ۱۴ نسخه آخر
$all = glob($dir . '/eshim-*.json.gz') ?: [];
sort($all);
foreach (array_slice($all, 0, max(0, count($all) - 14)) as $old) @unlink($old);
// خروجی فقط در فایل گزارش (Cron اجازه هدایت خروجی نمی‌دهد و هر خروجی ایمیل می‌شود)
@file_put_contents($dir . '/backup.log', date('Y-m-d H:i:s') . ' ok ' . basename($file) . ' ' . filesize($file) . "\n", FILE_APPEND);
if (in_array('-v', $argv ?? [], true)) echo "ok " . basename($file) . "\n";
