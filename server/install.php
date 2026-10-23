<?php
// ایشیم — نصب یک‌باره سرور
// این صفحه اطلاعات پایگاه داده و حساب مدیر را می‌گیرد، config.php را می‌سازد و جدول‌ها را ایجاد می‌کند.
// بعد از نصب، دیگر کار نمی‌کند (تا وقتی config.php وجود دارد).
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function page(string $body): void {
    echo '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>نصب سرور ایشیم</title><style>'
        . 'body{font-family:Tahoma,sans-serif;background:#f1f0ec;color:#20262d;margin:0;padding:16px}'
        . '.box{max-width:480px;margin:20px auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.08)}'
        . 'h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:18px 0 8px;color:#b06d00}'
        . 'label{display:block;margin:10px 0 4px;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px}'
        . 'input[dir=ltr]{text-align:left}button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#f5b800;font-size:16px;font-weight:bold;cursor:pointer}'
        . '.err{background:#fde8e8;color:#a40000;padding:10px;border-radius:8px;margin-bottom:10px}.ok{background:#e6f6ea;color:#14662d;padding:10px;border-radius:8px}'
        . '.warn{background:#fff6dc;padding:10px;border-radius:8px;margin-bottom:10px;font-size:13px}code{direction:ltr;display:inline-block}'
        . '</style></head><body><div class="box">' . $body . '</div></body></html>';
    exit;
}

if (is_file(config_path())) {
    page('<h1>سرور ایشیم نصب شده است</h1><p class="ok">نصب قبلاً انجام شده است.</p><p>برای امنیت بیشتر، فایل <code>install.php</code> را از هاست پاک کنید.</p>');
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$errors = [];
$v = [
    'db_host' => 'localhost', 'db_name' => '', 'db_user' => '',
    'admin_user' => 'admin', 'admin_name' => '',
];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    foreach ($v as $k => $_) $v[$k] = trim((string) ($_POST[$k] ?? ''));
    $dbPass = (string) ($_POST['db_pass'] ?? '');
    $p1 = (string) ($_POST['admin_pass'] ?? '');
    $p2 = (string) ($_POST['admin_pass2'] ?? '');

    if ($v['db_host'] === '' || $v['db_name'] === '' || $v['db_user'] === '') $errors[] = 'اطلاعات پایگاه داده کامل نیست.';
    if (!valid_username($v['admin_user'])) $errors[] = 'نام کاربری مدیر فقط حروف انگلیسی، عدد و . _ - (۳ تا ۳۲ کاراکتر).';
    if (!valid_password($p1)) $errors[] = 'رمز مدیر باید حداقل ۸ کاراکتر باشد.';
    if ($p1 !== $p2) $errors[] = 'رمز مدیر و تکرار آن یکی نیستند.';

    if (!$errors) {
        $cfg = [
            'driver' => 'mysql',
            'db_host' => $v['db_host'], 'db_name' => $v['db_name'], 'db_user' => $v['db_user'], 'db_pass' => $dbPass,
            'allowed_origins' => ['https://appassets.androidplatform.net'],
        ];
        try {
            $pdo = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (Throwable $e) {
            error_log('eshim install db: ' . $e->getMessage());
            $errors[] = 'اتصال به پایگاه داده برقرار نشد. نام پایگاه داده، نام کاربری و رمز آن را بررسی کنید (در cPanel نام‌ها معمولاً با پیشوند حساب شروع می‌شوند).';
        }
        if (!$errors) {
            try {
                create_schema($pdo);
                $st = $pdo->prepare('SELECT COUNT(*) FROM rw_users WHERE username = ?');
                $st->execute([$v['admin_user']]);
                if ((int) $st->fetchColumn() === 0) {
                    $pdo->prepare('INSERT INTO rw_users (username, pass_hash, name, role, active, created) VALUES (?, ?, ?, ?, 1, ?)')
                        ->execute([$v['admin_user'], password_hash($p1, PASSWORD_DEFAULT), mb_substr($v['admin_name'], 0, 100), 'admin', now_ms()]);
                } else {
                    $pdo->prepare("UPDATE rw_users SET pass_hash = ?, role = 'admin', active = 1 WHERE username = ?")
                        ->execute([password_hash($p1, PASSWORD_DEFAULT), $v['admin_user']]);
                }
                $php = "<?php\n// ساخته‌شده توسط install.php — این فایل را با کسی به اشتراک نگذارید\nreturn " . var_export($cfg, true) . ";\n";
                $tmp = config_path() . '.tmp';
                if (@file_put_contents($tmp, $php, LOCK_EX) === false || !@rename($tmp, config_path())) {
                    @unlink($tmp);
                    $errors[] = 'فایل config.php ساخته نشد؛ دسترسی نوشتن پوشه را بررسی کنید.';
                } else {
                    @chmod(config_path(), 0600);
                    page('<h1>نصب انجام شد ✅</h1><p class="ok">سرور ایشیم آماده است و حساب مدیر ساخته شد.</p>'
                        . '<p>نشانی سرور برای وارد کردن در برنامه:</p><p><code>' . h(($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/') . '</code></p>'
                        . '<p><b>مهم:</b> حالا فایل <code>install.php</code> را از هاست پاک کنید.</p>');
                }
            } catch (Throwable $e) {
                error_log('eshim install: ' . $e->getMessage());
                $errors[] = 'ساخت جدول‌ها با خطا روبه‌رو شد. دسترسی کاربر پایگاه داده (ALL PRIVILEGES) را بررسی کنید.';
            }
        }
    }
}

$body = '<h1>نصب سرور ایشیم</h1>';
if (!$https) $body .= '<div class="warn">این صفحه با HTTPS باز نشده است. بهتر است اول گواهی SSL دامنه فعال شود و صفحه با <code>https://</code> باز شود تا رمزها امن منتقل شوند.</div>';
foreach ($errors as $e) $body .= '<div class="err">' . h($e) . '</div>';
$body .= '<form method="post" autocomplete="off">'
    . '<h2>پایگاه داده MySQL (از بخش Databases در cPanel)</h2>'
    . '<label>میزبان</label><input name="db_host" dir="ltr" value="' . h($v['db_host']) . '">'
    . '<label>نام پایگاه داده</label><input name="db_name" dir="ltr" value="' . h($v['db_name']) . '" placeholder="cpuser_eshim">'
    . '<label>نام کاربری پایگاه داده</label><input name="db_user" dir="ltr" value="' . h($v['db_user']) . '" placeholder="cpuser_eshim">'
    . '<label>رمز پایگاه داده</label><input name="db_pass" type="password" dir="ltr">'
    . '<h2>حساب مدیر برنامه</h2>'
    . '<label>نام کاربری (انگلیسی)</label><input name="admin_user" dir="ltr" value="' . h($v['admin_user']) . '">'
    . '<label>نام نمایشی</label><input name="admin_name" value="' . h($v['admin_name']) . '">'
    . '<label>رمز (حداقل ۸ کاراکتر)</label><input name="admin_pass" type="password" dir="ltr">'
    . '<label>تکرار رمز</label><input name="admin_pass2" type="password" dir="ltr">'
    . '<button type="submit">نصب</button></form>';
page($body);
