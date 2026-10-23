<?php
// ایشیم — API سرور
// مسیرها با ?r=نام: ping, login, logout, me, change_password, sync, users, user_save
declare(strict_types=1);
require __DIR__ . '/lib.php';

set_exception_handler(function (Throwable $e) {
    error_log('eshim: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail(500, 'server_error', 'خطای سرور؛ دوباره تلاش کنید.');
});

$cfg = load_config();
cors($cfg);
$pdo = db($cfg);
$route = (string) ($_GET['r'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($route !== 'ping' && $method !== 'POST') fail(405, 'method');
$in = $method === 'POST' ? read_json() : [];

switch ($route) {
    case 'ping':
        json_out(['ok' => true, 'app' => 'eshim', 'api' => API_VERSION]);

    case 'login': {
        $username = trim((string) ($in['username'] ?? ''));
        $password = (string) ($in['password'] ?? '');
        if (too_many_attempts($pdo, $username)) fail(429, 'too_many', 'تلاش زیاد برای ورود؛ ۱۵ دقیقه بعد دوباره امتحان کنید.');
        $st = $pdo->prepare('SELECT * FROM rw_users WHERE username = ?');
        $st->execute([$username]);
        $u = $st->fetch();
        // برای جلوگیری از حدس زمان، در هر حالت password_verify اجرا می‌شود
        $hash = $u['pass_hash'] ?? '$2y$10$KXBgThwyuBh7eW6.IzoV.ulEBDpqday.yP5EznaRFTu5EKbmJhJg6';
        if (!password_verify($password, $hash) || !$u) {
            record_attempt($pdo, $username);
            fail(401, 'bad_login', 'نام کاربری یا رمز عبور اشتباه است.');
        }
        if (!(int) $u['active']) fail(403, 'disabled', 'حساب کاربری غیرفعال است.');
        if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE rw_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }
        $now = now_ms();
        $label = mb_substr(trim((string) ($in['device'] ?? '')), 0, 100);
        $pdo->prepare('INSERT INTO rw_devices (user_id, label, created) VALUES (?, ?, ?)')->execute([$u['id'], $label, $now]);
        $deviceId = (int) $pdo->lastInsertId();
        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO rw_tokens (token_hash, user_id, device_id, created, last_seen, expires) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([hash('sha256', $token), $u['id'], $deviceId, $now, $now, $now + TOKEN_DAYS * 86400000]);
        $hasData = (int) $pdo->query('SELECT COUNT(*) FROM rw_records WHERE deleted = 0')->fetchColumn() > 0;
        json_out(['ok' => true, 'token' => $token, 'deviceId' => $deviceId, 'user' => public_user($u), 'serverHasData' => $hasData]);
    }

    case 'logout': {
        $t = bearer_token();
        if ($t !== '') $pdo->prepare('DELETE FROM rw_tokens WHERE token_hash = ?')->execute([hash('sha256', $t)]);
        json_out(['ok' => true]);
    }

    case 'me': {
        $u = auth($pdo);
        json_out(['ok' => true, 'user' => $u]);
    }

    case 'change_password': {
        $u = auth($pdo);
        $st = $pdo->prepare('SELECT pass_hash FROM rw_users WHERE id = ?');
        $st->execute([$u['id']]);
        if (!password_verify((string) ($in['old'] ?? ''), (string) $st->fetchColumn())) fail(400, 'bad_old', 'رمز فعلی اشتباه است.');
        $new = (string) ($in['new'] ?? '');
        if (!valid_password($new)) fail(400, 'weak', 'رمز جدید باید حداقل ۸ کاراکتر باشد.');
        $pdo->prepare('UPDATE rw_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        // خروج بقیه دستگاه‌ها
        $pdo->prepare('DELETE FROM rw_tokens WHERE user_id = ? AND token_hash <> ?')->execute([$u['id'], hash('sha256', bearer_token())]);
        json_out(['ok' => true]);
    }

    case 'users': {
        $u = auth($pdo);
        require_admin($u);
        $rows = $pdo->query('SELECT id, username, name, role, active FROM rw_users ORDER BY id')->fetchAll();
        json_out(['ok' => true, 'users' => array_map('public_user', $rows)]);
    }

    case 'user_save': {
        $u = auth($pdo);
        require_admin($u);
        $id = (int) ($in['id'] ?? 0);
        $name = mb_substr(trim((string) ($in['name'] ?? '')), 0, 100);
        $role = ($in['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
        $active = !empty($in['active']) ? 1 : 0;
        $password = (string) ($in['password'] ?? '');
        if ($id === 0) {
            $username = trim((string) ($in['username'] ?? ''));
            if (!valid_username($username)) fail(400, 'bad_username', 'نام کاربری فقط حروف انگلیسی، عدد و . _ - (۳ تا ۳۲ کاراکتر).');
            if (!valid_password($password)) fail(400, 'weak', 'رمز باید حداقل ۸ کاراکتر باشد.');
            $st = $pdo->prepare('SELECT COUNT(*) FROM rw_users WHERE username = ?');
            $st->execute([$username]);
            if ((int) $st->fetchColumn() > 0) fail(400, 'exists', 'این نام کاربری قبلاً ثبت شده است.');
            $pdo->prepare('INSERT INTO rw_users (username, pass_hash, name, role, active, created) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $name, $role, $active, now_ms()]);
            json_out(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
        }
        // ویرایش: مدیر نمی‌تواند خودش را غیرفعال یا از مدیری خارج کند
        if ($id === $u['id'] && (!$active || $role !== 'admin')) fail(400, 'self', 'نمی‌توانید حساب مدیر خودتان را غیرفعال یا محدود کنید.');
        $pdo->prepare('UPDATE rw_users SET name = ?, role = ?, active = ? WHERE id = ?')->execute([$name, $role, $active, $id]);
        if ($password !== '') {
            if (!valid_password($password)) fail(400, 'weak', 'رمز باید حداقل ۸ کاراکتر باشد.');
            $pdo->prepare('UPDATE rw_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
            $pdo->prepare('DELETE FROM rw_tokens WHERE user_id = ?')->execute([$id]);
        }
        if (!$active) $pdo->prepare('DELETE FROM rw_tokens WHERE user_id = ?')->execute([$id]);
        json_out(['ok' => true, 'id' => $id]);
    }

    case 'sync': {
        $u = auth($pdo);
        $since = max(0, (int) ($in['since'] ?? 0));
        $changes = $in['changes'] ?? [];
        if (!is_array($changes) || count($changes) > 20000) fail(400, 'bad_changes');
        $clean = [];
        foreach ($changes as $ch) {
            if (!is_array($ch)) fail(400, 'bad_change');
            $c = (string) ($ch['c'] ?? '');
            $id = (string) ($ch['id'] ?? '');
            if (!in_array($c, COLLECTIONS, true) || !valid_rid($c, $id)) fail(400, 'bad_record', "$c/$id");
            $d = $ch['d'] ?? null;
            if ($d !== null) {
                if (!is_array($d)) fail(400, 'bad_data', "$c/$id");
                $json = json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($json === false || strlen($json) > max_record_bytes($c)) fail(413, 'record_too_large', "$c/$id");
                $clean[] = [$c, $id, $json, 0];
            } else {
                $clean[] = [$c, $id, null, 1];
            }
        }
        $now = now_ms();
        if ($clean) {
            $pdo->beginTransaction();
            try {
                $rev = next_revs($pdo, count($clean));
                $st = $pdo->prepare(upsert_sql($pdo));
                foreach ($clean as [$c, $id, $json, $del]) {
                    $st->execute([$c, $id, $json, $rev++, $del, $u['id'], $u['device_id'], $now]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        }
        // ردیف‌هایی که آخرین بار همین دستگاه نوشته بدون داده برگردانده می‌شوند (own) تا حجم کم شود
        $st = $pdo->prepare('SELECT coll, rid, rev, deleted, updated_dev, CASE WHEN updated_dev = ? THEN NULL ELSE data END AS data FROM rw_records WHERE rev > ? ORDER BY rev LIMIT ' . PAGE_LIMIT);
        $st->execute([$u['device_id'], $since]);
        $out = [];
        $last = $since;
        foreach ($st as $r) {
            if ((int) $r['updated_dev'] === $u['device_id']) $out[] = ['c' => $r['coll'], 'id' => $r['rid'], 'own' => 1];
            else $out[] = ['c' => $r['coll'], 'id' => $r['rid'], 'd' => (int) $r['deleted'] ? null : json_decode((string) $r['data'], true)];
            $last = (int) $r['rev'];
        }
        $more = count($out) === PAGE_LIMIT;
        if (!$more) $last = max($last, (int) $pdo->query("SELECT v FROM rw_meta WHERE k = 'rev'")->fetchColumn());
        json_out(['ok' => true, 'rev' => $last, 'more' => $more, 'changes' => $out, 'serverTime' => $now]);
    }

    default:
        fail(404, 'not_found');
}
