<?php
// ایشیم — کتابخانه مشترک سرور
declare(strict_types=1);

const API_VERSION = 1;
const TOKEN_DAYS = 180;
const PAGE_LIMIT = 2000;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const COLLECTIONS = ['cats', 'projects', 'workers', 'installers', 'contractors', 'progress', 'tx', 'adj', 'notes', 'cheques', 'invoices', 'statements', 'att', 'settings', 'asset'];

function now_ms(): int { return (int) floor(microtime(true) * 1000); }

function json_out(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $error, string $message = ''): void {
    json_out(['ok' => false, 'error' => $error, 'message' => $message], $code);
}

function config_path(): string { return __DIR__ . '/config.php'; }

function load_config(): array {
    if (!is_file(config_path())) fail(503, 'not_installed', 'سرور هنوز نصب نشده است.');
    $cfg = require config_path();
    if (!is_array($cfg)) fail(500, 'bad_config');
    return $cfg;
}

function db(array $cfg): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        if (($cfg['driver'] ?? 'mysql') === 'sqlite') {
            $pdo = new PDO('sqlite:' . $cfg['sqlite_path']);
            $pdo->exec('PRAGMA busy_timeout=10000');
            $pdo->exec('PRAGMA journal_mode=WAL');
        } else {
            $dsn = 'mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4';
            $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass']);
        }
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    } catch (Throwable $e) {
        error_log('eshim db: ' . $e->getMessage());
        fail(500, 'db_error', 'اتصال به پایگاه داده برقرار نشد.');
    }
    return $pdo;
}
function is_sqlite(PDO $pdo): bool { return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'; }

function create_schema(PDO $pdo): void {
    $sqlite = is_sqlite($pdo);
    $auto = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $engine = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
    $stmts = [
        "CREATE TABLE IF NOT EXISTS rw_users (id $auto, username VARCHAR(64) NOT NULL UNIQUE, pass_hash VARCHAR(255) NOT NULL, name VARCHAR(100) NOT NULL DEFAULT '', role VARCHAR(10) NOT NULL DEFAULT 'user', active TINYINT NOT NULL DEFAULT 1, created BIGINT NOT NULL)$engine",
        "CREATE TABLE IF NOT EXISTS rw_devices (id $auto, user_id INT NOT NULL, label VARCHAR(100) NOT NULL DEFAULT '', created BIGINT NOT NULL)$engine",
        "CREATE TABLE IF NOT EXISTS rw_tokens (token_hash CHAR(64) NOT NULL PRIMARY KEY, user_id INT NOT NULL, device_id INT NOT NULL, created BIGINT NOT NULL, last_seen BIGINT NOT NULL, expires BIGINT NOT NULL)$engine",
        "CREATE TABLE IF NOT EXISTS rw_records (coll VARCHAR(20) NOT NULL, rid VARCHAR(40) NOT NULL, data $text, rev BIGINT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0, updated_by INT NOT NULL DEFAULT 0, updated_dev INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, PRIMARY KEY (coll, rid))$engine",
        "CREATE INDEX " . ($sqlite ? 'IF NOT EXISTS ' : '') . "rw_records_rev ON rw_records (rev)",
        "CREATE TABLE IF NOT EXISTS rw_meta (k VARCHAR(40) NOT NULL PRIMARY KEY, v VARCHAR(255) NOT NULL)$engine",
        "CREATE TABLE IF NOT EXISTS rw_attempts (id $auto, ip VARCHAR(45) NOT NULL, username VARCHAR(64) NOT NULL, ts BIGINT NOT NULL)$engine",
    ];
    foreach ($stmts as $s) {
        try { $pdo->exec($s); } catch (PDOException $e) {
            // MySQL: ایندکس از قبل وجود دارد
            if (stripos($s, 'CREATE INDEX') === false) throw $e;
        }
    }
    $pdo->exec("INSERT " . ($sqlite ? 'OR IGNORE' : 'IGNORE') . " INTO rw_meta (k, v) VALUES ('rev', '0')");
}

// ---------- درخواست ----------
function read_json(): array {
    $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > MAX_REQUEST_BYTES) fail(413, 'too_large', 'حجم درخواست زیاد است.');
    $raw = file_get_contents('php://input', false, null, 0, MAX_REQUEST_BYTES + 1);
    if ($raw === '' || $raw === false) return [];
    if (strlen($raw) > MAX_REQUEST_BYTES) fail(413, 'too_large');
    $d = json_decode($raw, true);
    if (!is_array($d)) fail(400, 'bad_json');
    return $d;
}

function cors(array $cfg): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = $cfg['allowed_origins'] ?? ['https://appassets.androidplatform.net'];
    if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Eshim-Token');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}

function client_ip(): string { return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }

// ---------- احراز هویت ----------
function bearer_token(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    // برخی هاست‌ها هدر Authorization را حذف می‌کنند؛ هدر جایگزین
    if ($h === '' && !empty($_SERVER['HTTP_X_ESHIM_TOKEN'])) $h = 'Bearer ' . $_SERVER['HTTP_X_ESHIM_TOKEN'];
    if ($h === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $k => $v) if (strcasecmp($k, 'Authorization') === 0) $h = $v;
    }
    return preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($h), $m) ? strtolower($m[1]) : '';
}

function auth(PDO $pdo): array {
    $t = bearer_token();
    if ($t === '') fail(401, 'no_token', 'ابتدا وارد شوید.');
    $st = $pdo->prepare('SELECT t.user_id, t.device_id, t.expires, u.username, u.name, u.role, u.active FROM rw_tokens t JOIN rw_users u ON u.id = t.user_id WHERE t.token_hash = ?');
    $st->execute([hash('sha256', $t)]);
    $r = $st->fetch();
    $now = now_ms();
    if (!$r || (int) $r['expires'] < $now) fail(401, 'bad_token', 'نشست منقضی شده است؛ دوباره وارد شوید.');
    if (!(int) $r['active']) fail(403, 'disabled', 'حساب کاربری غیرفعال است.');
    // تمدید خودکار
    $pdo->prepare('UPDATE rw_tokens SET last_seen = ?, expires = ? WHERE token_hash = ?')
        ->execute([$now, $now + TOKEN_DAYS * 86400000, hash('sha256', $t)]);
    return ['id' => (int) $r['user_id'], 'device_id' => (int) $r['device_id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role']];
}

function require_admin(array $u): void { if ($u['role'] !== 'admin') fail(403, 'forbidden', 'فقط مدیر دسترسی دارد.'); }

function too_many_attempts(PDO $pdo, string $username): bool {
    $since = now_ms() - 15 * 60000;
    $pdo->prepare('DELETE FROM rw_attempts WHERE ts < ?')->execute([now_ms() - 86400000]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM rw_attempts WHERE ts > ? AND (ip = ? OR username = ?)');
    $st->execute([$since, client_ip(), $username]);
    return (int) $st->fetchColumn() >= 10;
}
function record_attempt(PDO $pdo, string $username): void {
    $pdo->prepare('INSERT INTO rw_attempts (ip, username, ts) VALUES (?, ?, ?)')->execute([client_ip(), $username, now_ms()]);
}

function valid_username(string $u): bool { return (bool) preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $u); }
function valid_password(string $p): bool { return mb_strlen($p) >= 8 && mb_strlen($p) <= 200; }

function public_user(array $r): array {
    return ['id' => (int) $r['id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role'], 'active' => (bool) (int) $r['active']];
}

// ---------- همگام‌سازی ----------
function valid_rid(string $coll, string $rid): bool {
    switch ($coll) {
        case 'att': return (bool) preg_match('/^\d{1,16}\|\d{4}\/\d{2}\/\d{2}$/', $rid);
        case 'settings': return $rid === 'inv';
        case 'asset': return $rid === 'logo' || $rid === 'stamp';
        default: return (bool) preg_match('/^[1-9]\d{0,15}$/', $rid);
    }
}
function max_record_bytes(string $coll): int { return $coll === 'asset' ? 1500000 : 300000; }

function next_revs(PDO $pdo, int $n): int {
    // شماره نسخه سراسری را n واحد بالا می‌برد و اولین شماره جدید را برمی‌گرداند
    if (is_sqlite($pdo)) {
        $cur = (int) $pdo->query("SELECT v FROM rw_meta WHERE k = 'rev'")->fetchColumn();
    } else {
        $cur = (int) $pdo->query("SELECT v FROM rw_meta WHERE k = 'rev' FOR UPDATE")->fetchColumn();
    }
    $pdo->prepare("UPDATE rw_meta SET v = ? WHERE k = 'rev'")->execute([(string) ($cur + $n)]);
    return $cur + 1;
}

function upsert_sql(PDO $pdo): string {
    return is_sqlite($pdo)
        ? 'INSERT INTO rw_records (coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(coll, rid) DO UPDATE SET data = excluded.data, rev = excluded.rev, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_dev = excluded.updated_dev, updated_at = excluded.updated_at'
        : 'INSERT INTO rw_records (coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), rev = VALUES(rev), deleted = VALUES(deleted), updated_by = VALUES(updated_by), updated_dev = VALUES(updated_dev), updated_at = VALUES(updated_at)';
}
