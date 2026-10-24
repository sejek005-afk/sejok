<?php
// ایشیم — API سرور
// مسیرها با ?r=نام:
//   ping, register, login, logout, me, change_password, use_ws, sync,
//   share_list, share_add, share_remove, users, user_save (دو مورد آخر فقط مدیر سرور)
// هر کاربر یک «حساب» (workspace) دارد؛ صاحب حساب می‌تواند با نام کاربری (شماره موبایل)
// کاربر دیگری را به حسابش اضافه کند تا هر دو همان اطلاعات را ببینند.
declare(strict_types=1);
require __DIR__ . '/lib.php';

set_exception_handler(function (Throwable $e) {
    error_log('eshim: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail(500, 'server_error', 'خطای سرور؛ دوباره تلاش کنید.');
});

$cfg = load_config();
cors($cfg);
$pdo = db($cfg);
migrate_schema($pdo);
$route = (string) ($_GET['r'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($route !== 'ping' && $method !== 'POST') fail(405, 'method');
$in = $method === 'POST' ? read_json() : [];

// پاسخ مشترک ورود و ثبت‌نام: توکن جدید برای یک دستگاه جدید
function start_session(PDO $pdo, array $u, array $in): void {
    $now = now_ms();
    $label = mb_substr(trim((string) ($in['device'] ?? '')), 0, 100);
    $pdo->prepare('INSERT INTO rw_devices (user_id, label, created) VALUES (?, ?, ?)')->execute([$u['id'], $label, $now]);
    $deviceId = (int) $pdo->lastInsertId();
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO rw_tokens (token_hash, user_id, device_id, created, last_seen, expires) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $u['id'], $deviceId, $now, $now, $now + TOKEN_DAYS * 86400000]);
    $own = own_ws($pdo, ['id' => (int) $u['id']]);
    $ws = (int) ($u['last_ws'] ?? 0);
    if ($ws <= 0 || member_role($pdo, $ws, (int) $u['id']) === '') $ws = $own;
    json_out([
        'ok' => true, 'token' => $token, 'deviceId' => $deviceId, 'user' => public_user($u),
        'workspaces' => user_workspaces($pdo, (int) $u['id']), 'ws' => $ws, 'ownWs' => $own,
        'serverHasData' => ws_has_data($pdo, $ws),
    ]);
}

switch ($route) {
    case 'ping':
        json_out(['ok' => true, 'app' => 'eshim', 'api' => API_VERSION]);

    case 'register': {
        $phone = norm_phone(trim((string) ($in['username'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        $name = mb_substr(trim((string) ($in['name'] ?? '')), 0, 100);
        if (too_many_attempts($pdo, 'reg:' . $phone, 5, 60)) fail(429, 'too_many', 'تعداد ثبت‌نام از این اینترنت زیاد است؛ یک ساعت بعد دوباره امتحان کنید.');
        if (!valid_phone($phone)) fail(400, 'bad_phone', 'شماره موبایل را درست وارد کنید (مثال: 09121234567).');
        if (!valid_password($password)) fail(400, 'weak', 'رمز باید حداقل ۸ کاراکتر باشد.');
        if ($name === '') fail(400, 'no_name', 'نام را وارد کنید.');
        $st = $pdo->prepare('SELECT COUNT(*) FROM rw_users WHERE username = ?');
        $st->execute([$phone]);
        if ((int) $st->fetchColumn() > 0) fail(409, 'exists', 'با این شماره قبلاً حساب ساخته شده است؛ از بخش «ورود» وارد شوید.');
        record_attempt($pdo, 'reg:' . $phone);
        $pdo->prepare('INSERT INTO rw_users (username, pass_hash, name, role, active, created) VALUES (?, ?, ?, ?, 1, ?)')
            ->execute([$phone, password_hash($password, PASSWORD_DEFAULT), $name, 'user', now_ms()]);
        $id = (int) $pdo->lastInsertId();
        $ws = own_ws($pdo, ['id' => $id]);
        $pdo->prepare('UPDATE rw_users SET last_ws = ? WHERE id = ?')->execute([$ws, $id]);
        start_session($pdo, ['id' => $id, 'username' => $phone, 'name' => $name, 'role' => 'user', 'active' => 1, 'last_ws' => $ws], $in);
    }

    case 'login': {
        $raw = trim((string) ($in['username'] ?? ''));
        $phone = norm_phone($raw);
        $username = valid_phone($phone) ? $phone : $raw;
        $password = (string) ($in['password'] ?? '');
        if (too_many_attempts($pdo, $username)) fail(429, 'too_many', 'تلاش زیاد برای ورود؛ ۱۵ دقیقه بعد دوباره امتحان کنید.');
        $st = $pdo->prepare('SELECT * FROM rw_users WHERE username = ?');
        $st->execute([$username]);
        $u = $st->fetch();
        // برای جلوگیری از حدس زمان، در هر حالت password_verify اجرا می‌شود
        $hash = $u['pass_hash'] ?? '$2y$10$KXBgThwyuBh7eW6.IzoV.ulEBDpqday.yP5EznaRFTu5EKbmJhJg6';
        if (!password_verify($password, $hash) || !$u) {
            record_attempt($pdo, $username);
            fail(401, 'bad_login', 'شماره (نام کاربری) یا رمز عبور اشتباه است.');
        }
        if (!(int) $u['active']) fail(403, 'disabled', 'حساب کاربری غیرفعال است.');
        if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE rw_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }
        start_session($pdo, $u, $in);
    }

    case 'logout': {
        $t = bearer_token();
        if ($t !== '') $pdo->prepare('DELETE FROM rw_tokens WHERE token_hash = ?')->execute([hash('sha256', $t)]);
        json_out(['ok' => true]);
    }

    case 'me': {
        $u = auth($pdo);
        $own = own_ws($pdo, $u);
        $ws = $u['last_ws'];
        if ($ws <= 0 || member_role($pdo, $ws, $u['id']) === '') $ws = $own;
        json_out(['ok' => true, 'user' => public_user($u), 'workspaces' => user_workspaces($pdo, $u['id']), 'ownWs' => $own, 'ws' => $ws]);
    }

    case 'use_ws': {
        // حساب فعال این کاربر را عوض می‌کند و می‌گوید اطلاعات دارد یا نه
        $u = auth($pdo);
        $ws = (int) ($in['ws'] ?? 0);
        require_member($pdo, $ws, $u);
        $pdo->prepare('UPDATE rw_users SET last_ws = ? WHERE id = ?')->execute([$ws, $u['id']]);
        json_out(['ok' => true, 'ws' => $ws, 'serverHasData' => ws_has_data($pdo, $ws)]);
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

    // ---------- اشتراک حساب ----------
    case 'share_list': {
        $u = auth($pdo);
        $ws = (int) ($in['ws'] ?? 0);
        require_member($pdo, $ws, $u);
        $st = $pdo->prepare('SELECT u.id, u.username, u.name, m.role FROM rw_members m JOIN rw_users u ON u.id = m.user_id WHERE m.ws_id = ? ORDER BY (m.role = \'owner\') DESC, m.created');
        $st->execute([$ws]);
        $out = [];
        foreach ($st as $r) $out[] = ['id' => (int) $r['id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role']];
        json_out(['ok' => true, 'members' => $out]);
    }

    case 'share_add': {
        $u = auth($pdo);
        $ws = (int) ($in['ws'] ?? 0);
        if (require_member($pdo, $ws, $u) !== 'owner') fail(403, 'forbidden', 'فقط صاحب حساب می‌تواند افراد را اضافه کند.');
        $raw = trim((string) ($in['username'] ?? ''));
        $phone = norm_phone($raw);
        $st = $pdo->prepare('SELECT id, username, name, active FROM rw_users WHERE username = ?');
        $st->execute([valid_phone($phone) ? $phone : $raw]);
        $t = $st->fetch();
        if (!$t || !(int) $t['active']) fail(404, 'no_user', 'کاربری با این شماره پیدا نشد. اول باید خودش در برنامه ثبت‌نام کند.');
        if ((int) $t['id'] === $u['id']) fail(400, 'self', 'این شماره خودتان است.');
        if (member_role($pdo, $ws, (int) $t['id']) !== '') fail(409, 'already', 'این کاربر از قبل به حساب دسترسی دارد.');
        $pdo->prepare('INSERT INTO rw_members (ws_id, user_id, role, created) VALUES (?, ?, ?, ?)')->execute([$ws, $t['id'], 'member', now_ms()]);
        json_out(['ok' => true, 'member' => ['id' => (int) $t['id'], 'username' => $t['username'], 'name' => $t['name'], 'role' => 'member']]);
    }

    case 'share_remove': {
        // صاحب حساب می‌تواند هر عضوی را حذف کند؛ هر عضو هم می‌تواند خودش خارج شود
        $u = auth($pdo);
        $ws = (int) ($in['ws'] ?? 0);
        $role = require_member($pdo, $ws, $u);
        $target = (int) ($in['user_id'] ?? 0);
        if ($target !== $u['id'] && $role !== 'owner') fail(403, 'forbidden', 'فقط صاحب حساب می‌تواند افراد را حذف کند.');
        if (member_role($pdo, $ws, $target) === 'owner') fail(400, 'owner', 'صاحب حساب را نمی‌توان حذف کرد.');
        $pdo->prepare('DELETE FROM rw_members WHERE ws_id = ? AND user_id = ?')->execute([$ws, $target]);
        json_out(['ok' => true]);
    }

    // ---------- مدیر سرور: بازنشانی رمز و غیرفعال کردن ----------
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
            $raw = trim((string) ($in['username'] ?? ''));
            $phone = norm_phone($raw);
            $username = valid_phone($phone) ? $phone : $raw;
            if (!valid_username($username)) fail(400, 'bad_username', 'نام کاربری فقط شماره موبایل یا حروف انگلیسی و عدد (۳ تا ۳۲ کاراکتر).');
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

    // ---------- همگام‌سازی ----------
    case 'sync': {
        $u = auth($pdo);
        $ws = (int) ($in['ws'] ?? 0);
        require_member($pdo, $ws, $u);
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
                    $st->execute([$ws, $c, $id, $json, $rev++, $del, $u['id'], $u['device_id'], $now]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        }
        // ردیف‌هایی که آخرین بار همین دستگاه نوشته بدون داده برگردانده می‌شوند (own) تا حجم کم شود
        // سقف شماره نسخه پیش از خواندن گرفته می‌شود تا تغییری که هم‌زمان ثبت می‌شود جا نماند
        $top = (int) $pdo->query("SELECT v FROM rw_meta WHERE k = 'rev'")->fetchColumn();
        $st = $pdo->prepare('SELECT coll, rid, rev, deleted, updated_dev, CASE WHEN updated_dev = ? THEN NULL ELSE data END AS data FROM rw_records WHERE ws_id = ? AND rev > ? AND rev <= ? ORDER BY rev LIMIT ' . PAGE_LIMIT);
        // skipOwn=false برای دستگاهی که اطلاعات محلی این حساب را ندارد (مثلاً بعد از عوض کردن حساب)
        $skipOwn = !array_key_exists('skipOwn', $in) || !empty($in['skipOwn']);
        $st->execute([$skipOwn ? $u['device_id'] : -1, $ws, $since, $top]);
        $out = [];
        $last = $since;
        foreach ($st as $r) {
            if ($skipOwn && (int) $r['updated_dev'] === $u['device_id']) $out[] = ['c' => $r['coll'], 'id' => $r['rid'], 'own' => 1];
            else $out[] = ['c' => $r['coll'], 'id' => $r['rid'], 'd' => (int) $r['deleted'] ? null : json_decode((string) $r['data'], true)];
            $last = (int) $r['rev'];
        }
        $more = count($out) === PAGE_LIMIT;
        if (!$more) $last = max($last, $top);
        json_out(['ok' => true, 'rev' => $last, 'more' => $more, 'changes' => $out, 'serverTime' => $now]);
    }

    default:
        fail(404, 'not_found');
}
