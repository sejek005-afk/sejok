<?php
// ایشیم — کتابخانه مشترک سرور
declare(strict_types=1);

const API_VERSION = 2;
const SCHEMA_VERSION = 3;
const SUPPORT_EMAIL = 'info@eshim.ir';
const TICKET_KINDS = ['suggest' => 'پیشنهاد', 'bug' => 'گزارش مشکل', 'question' => 'سؤال'];
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
    migrate_schema($pdo);
}

function meta_get(PDO $pdo, string $k): string {
    $st = $pdo->prepare('SELECT v FROM rw_meta WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? '' : (string) $v;
}
function meta_set(PDO $pdo, string $k, string $v): void {
    $pdo->prepare('DELETE FROM rw_meta WHERE k = ?')->execute([$k]);
    $pdo->prepare('INSERT INTO rw_meta (k, v) VALUES (?, ?)')->execute([$k, $v]);
}
function column_exists(PDO $pdo, string $table, string $col): bool {
    try { $pdo->query("SELECT $col FROM $table LIMIT 1"); return true; } catch (PDOException $e) { return false; }
}

// نسخه ۲: هر کاربر «حساب» (workspace) جداگانه دارد و می‌تواند آن را با کاربران دیگر به اشتراک بگذارد
function migrate_schema(PDO $pdo): void {
    if ((int) meta_get($pdo, 'schema') >= SCHEMA_VERSION) return;
    $sqlite = is_sqlite($pdo);
    if ($sqlite) $pdo->exec('BEGIN IMMEDIATE');
    else $pdo->query("SELECT GET_LOCK('eshim_migrate', 30)");
    try {
        if ((int) meta_get($pdo, 'schema') >= SCHEMA_VERSION) return;
        $auto = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $engine = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        $pdo->exec("CREATE TABLE IF NOT EXISTS rw_workspaces (id $auto, owner_id INT NOT NULL, name VARCHAR(100) NOT NULL DEFAULT '', created BIGINT NOT NULL)$engine");
        $pdo->exec("CREATE TABLE IF NOT EXISTS rw_members (ws_id INT NOT NULL, user_id INT NOT NULL, role VARCHAR(10) NOT NULL DEFAULT 'member', created BIGINT NOT NULL, PRIMARY KEY (ws_id, user_id))$engine");
        if (!column_exists($pdo, 'rw_users', 'last_ws')) $pdo->exec('ALTER TABLE rw_users ADD COLUMN last_ws INT NOT NULL DEFAULT 0');
        if (!column_exists($pdo, 'rw_records', 'ws_id')) {
            $pdo->exec("CREATE TABLE rw_records2 (ws_id INT NOT NULL, coll VARCHAR(20) NOT NULL, rid VARCHAR(40) NOT NULL, data $text, rev BIGINT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0, updated_by INT NOT NULL DEFAULT 0, updated_dev INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, PRIMARY KEY (ws_id, coll, rid))$engine");
            $hasRows = (int) $pdo->query('SELECT COUNT(*) FROM rw_records')->fetchColumn() > 0;
            $users = $pdo->query("SELECT id, role FROM rw_users ORDER BY (role = 'admin') DESC, id")->fetchAll();
            if ($users) {
                // اطلاعات مشترک قبلی در حساب مدیر قرار می‌گیرد و همه کاربران قبلی عضو آن می‌شوند
                $now = now_ms();
                $owner = (int) $users[0]['id'];
                $pdo->prepare('INSERT INTO rw_workspaces (owner_id, name, created) VALUES (?, ?, ?)')->execute([$owner, '', $now]);
                $ws = (int) $pdo->lastInsertId();
                foreach ($users as $u) {
                    $pdo->prepare('INSERT INTO rw_members (ws_id, user_id, role, created) VALUES (?, ?, ?, ?)')
                        ->execute([$ws, $u['id'], (int) $u['id'] === $owner ? 'owner' : 'member', $now]);
                }
                $pdo->prepare('UPDATE rw_users SET last_ws = ?')->execute([$ws]);
                if ($hasRows) $pdo->prepare('INSERT INTO rw_records2 (ws_id, coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at) SELECT ?, coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at FROM rw_records')->execute([$ws]);
            }
            $pdo->exec('DROP TABLE rw_records');
            $pdo->exec('ALTER TABLE rw_records2 RENAME TO rw_records');
            $pdo->exec('CREATE INDEX rw_records_wsrev ON rw_records (ws_id, rev)');
        }
        // نسخه ۳: تیکت پشتیبانی و پیشنهادها
        $pdo->exec("CREATE TABLE IF NOT EXISTS rw_tickets (id $auto, user_id INT NOT NULL, kind VARCHAR(10) NOT NULL DEFAULT 'question', subject VARCHAR(150) NOT NULL DEFAULT '', status VARCHAR(10) NOT NULL DEFAULT 'open', created BIGINT NOT NULL, updated BIGINT NOT NULL, user_seen BIGINT NOT NULL DEFAULT 0, admin_seen BIGINT NOT NULL DEFAULT 0, app VARCHAR(40) NOT NULL DEFAULT '', device VARCHAR(100) NOT NULL DEFAULT '')$engine");
        $pdo->exec("CREATE TABLE IF NOT EXISTS rw_ticket_msgs (id $auto, ticket_id INT NOT NULL, user_id INT NOT NULL, is_admin TINYINT NOT NULL DEFAULT 0, body $text, created BIGINT NOT NULL)$engine");
        try { $pdo->exec('CREATE INDEX rw_tickets_user ON rw_tickets (user_id, updated)'); } catch (PDOException $e) { }
        try { $pdo->exec('CREATE INDEX rw_ticket_msgs_t ON rw_ticket_msgs (ticket_id, id)'); } catch (PDOException $e) { }
        meta_set($pdo, 'schema', (string) SCHEMA_VERSION);
    } finally {
        if ($sqlite) { try { $pdo->exec('COMMIT'); } catch (PDOException $e) { } }
        else $pdo->query("SELECT RELEASE_LOCK('eshim_migrate')");
    }
}

// ---------- حساب‌ها (workspace) ----------
function own_ws(PDO $pdo, array $u): int {
    $st = $pdo->prepare('SELECT id FROM rw_workspaces WHERE owner_id = ? ORDER BY id LIMIT 1');
    $st->execute([$u['id']]);
    $id = (int) $st->fetchColumn();
    if ($id) return $id;
    $now = now_ms();
    $pdo->prepare('INSERT INTO rw_workspaces (owner_id, name, created) VALUES (?, ?, ?)')->execute([$u['id'], '', $now]);
    $id = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO rw_members (ws_id, user_id, role, created) VALUES (?, ?, ?, ?)')->execute([$id, $u['id'], 'owner', $now]);
    return $id;
}
function user_workspaces(PDO $pdo, int $userId): array {
    $st = $pdo->prepare('SELECT w.id, w.owner_id, m.role, u.username AS owner_username, u.name AS owner_name FROM rw_members m JOIN rw_workspaces w ON w.id = m.ws_id JOIN rw_users u ON u.id = w.owner_id WHERE m.user_id = ? ORDER BY (m.role = \'owner\') DESC, w.id');
    $st->execute([$userId]);
    $out = [];
    foreach ($st as $r) {
        $out[] = ['id' => (int) $r['id'], 'role' => $r['role'], 'owner' => ['id' => (int) $r['owner_id'], 'username' => $r['owner_username'], 'name' => $r['owner_name']]];
    }
    return $out;
}
function member_role(PDO $pdo, int $ws, int $userId): string {
    $st = $pdo->prepare('SELECT role FROM rw_members WHERE ws_id = ? AND user_id = ?');
    $st->execute([$ws, $userId]);
    $r = $st->fetchColumn();
    return $r === false ? '' : (string) $r;
}
function require_member(PDO $pdo, int $ws, array $u): string {
    $role = $ws > 0 ? member_role($pdo, $ws, $u['id']) : '';
    if ($role === '') fail(403, 'not_member', 'دسترسی شما به این حساب برداشته شده است.');
    return $role;
}
function ws_has_data(PDO $pdo, int $ws): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM rw_records WHERE ws_id = ? AND deleted = 0');
    $st->execute([$ws]);
    return (int) $st->fetchColumn() > 0;
}
// شماره موبایل: ارقام فارسی/عربی به انگلیسی، +98 و 0098 به 0
function norm_phone(string $s): string {
    $s = strtr($s, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']);
    $s = preg_replace('/[\s\-()]/', '', $s);
    if (preg_match('/^(\+98|0098|98)(9\d{9})$/', $s, $m)) $s = '0' . $m[2];
    elseif (preg_match('/^9\d{9}$/', $s)) $s = '0' . $s;
    return $s;
}
function valid_phone(string $s): bool { return (bool) preg_match('/^09\d{9}$/', $s); }

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
    // احراز هویت فقط با توکن در هدر است (نه کوکی)، پس پاسخ دادن به هر مبدأ خطر CSRF ندارد.
    // اگر در config فهرست مبدأها محدود شده باشد (strict_origins = true)، فقط همان‌ها مجازند.
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = $cfg['allowed_origins'] ?? ['https://appassets.androidplatform.net'];
    $strict = !empty($cfg['strict_origins']);
    if ($origin !== '' && (!$strict || in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
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
    $st = $pdo->prepare('SELECT t.user_id, t.device_id, t.expires, u.username, u.name, u.role, u.active, u.last_ws FROM rw_tokens t JOIN rw_users u ON u.id = t.user_id WHERE t.token_hash = ?');
    $st->execute([hash('sha256', $t)]);
    $r = $st->fetch();
    $now = now_ms();
    if (!$r || (int) $r['expires'] < $now) fail(401, 'bad_token', 'نشست منقضی شده است؛ دوباره وارد شوید.');
    if (!(int) $r['active']) fail(403, 'disabled', 'حساب کاربری غیرفعال است.');
    // تمدید خودکار
    $pdo->prepare('UPDATE rw_tokens SET last_seen = ?, expires = ? WHERE token_hash = ?')
        ->execute([$now, $now + TOKEN_DAYS * 86400000, hash('sha256', $t)]);
    return ['id' => (int) $r['user_id'], 'device_id' => (int) $r['device_id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role'], 'last_ws' => (int) $r['last_ws']];
}

function require_admin(array $u): void { if ($u['role'] !== 'admin') fail(403, 'forbidden', 'فقط مدیر دسترسی دارد.'); }

function too_many_attempts(PDO $pdo, string $username, int $max = 10, int $minutes = 15): bool {
    $since = now_ms() - $minutes * 60000;
    $pdo->prepare('DELETE FROM rw_attempts WHERE ts < ?')->execute([now_ms() - 86400000]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM rw_attempts WHERE ts > ? AND (ip = ? OR username = ?) AND username ' . (str_starts_with($username, 'reg:') ? "LIKE 'reg:%'" : "NOT LIKE 'reg:%'"));
    $st->execute([$since, client_ip(), $username]);
    return (int) $st->fetchColumn() >= $max;
}
function record_attempt(PDO $pdo, string $username): void {
    $pdo->prepare('INSERT INTO rw_attempts (ip, username, ts) VALUES (?, ?, ?)')->execute([client_ip(), $username, now_ms()]);
}

function valid_username(string $u): bool { return (bool) preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $u); }
function valid_password(string $p): bool { return mb_strlen($p) >= 8 && mb_strlen($p) <= 200; }

function public_user(array $r): array {
    return ['id' => (int) $r['id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role'], 'active' => (bool) (int) ($r['active'] ?? 1)];
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
        ? 'INSERT INTO rw_records (ws_id, coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ws_id, coll, rid) DO UPDATE SET data = excluded.data, rev = excluded.rev, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_dev = excluded.updated_dev, updated_at = excluded.updated_at'
        : 'INSERT INTO rw_records (ws_id, coll, rid, data, rev, deleted, updated_by, updated_dev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), rev = VALUES(rev), deleted = VALUES(deleted), updated_by = VALUES(updated_by), updated_dev = VALUES(updated_dev), updated_at = VALUES(updated_at)';
}

// ---------- پشتیبانی ----------
// فرستادن ایمیل اطلاع‌رسانی به صندوق پشتیبانی؛ شکست ایمیل کار اصلی را خراب نمی‌کند
function support_mail(array $cfg, string $subject, string $body, string $replyTo = ''): bool {
    $to = (string) ($cfg['support_email'] ?? SUPPORT_EMAIL);
    if ($to === '' || !function_exists('mail')) return false;
    $from = (string) ($cfg['mail_from'] ?? 'no-reply@eshim.ir');
    $headers = "From: =?UTF-8?B?" . base64_encode('ایشیمیز') . "?= <$from>\r\n"
        . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n";
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $headers .= "Reply-To: $replyTo\r\n";
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    try { return @mail($to, $subj, chunk_split(base64_encode($body)), $headers, '-f' . $from); } catch (Throwable $e) { return false; }
}
function ticket_public(array $t): array {
    return [
        'id' => (int) $t['id'], 'kind' => $t['kind'], 'subject' => $t['subject'], 'status' => $t['status'],
        'created' => (int) $t['created'], 'updated' => (int) $t['updated'],
        'userSeen' => (int) $t['user_seen'], 'adminSeen' => (int) $t['admin_seen'],
        'user' => isset($t['username']) ? ['id' => (int) $t['user_id'], 'username' => $t['username'], 'name' => $t['name']] : null,
        'app' => $t['app'] ?? '', 'device' => $t['device'] ?? '',
    ];
}
function load_ticket(PDO $pdo, int $id, array $u): array {
    $st = $pdo->prepare('SELECT t.*, u.username, u.name FROM rw_tickets t JOIN rw_users u ON u.id = t.user_id WHERE t.id = ?');
    $st->execute([$id]);
    $t = $st->fetch();
    if (!$t || ((int) $t['user_id'] !== $u['id'] && $u['role'] !== 'admin')) fail(404, 'not_found', 'تیکت پیدا نشد.');
    return $t;
}
function ticket_count_today(PDO $pdo, int $userId, bool $tickets): int {
    $since = now_ms() - 86400000;
    $st = $pdo->prepare($tickets ? 'SELECT COUNT(*) FROM rw_tickets WHERE user_id = ? AND created > ?'
        : 'SELECT COUNT(*) FROM rw_ticket_msgs WHERE user_id = ? AND is_admin = 0 AND created > ?');
    $st->execute([$userId, $since]);
    return (int) $st->fetchColumn();
}
