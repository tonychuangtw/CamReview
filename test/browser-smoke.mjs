/* 瀏覽器 smoke test（無 npm 依賴，用 CDP 直接驅動 chrome-headless-shell）
 *
 * 為什麼要有這支：test/test.js 只跑純函式，真正要驗的是「學生登入後，關掉再開仍然是同一個人」
 * 這種只有在瀏覽器裡才看得出來的行為。
 *
 * 用法：node test/browser-smoke.mjs
 *   找不到 chrome-headless-shell 就跳過（exit 0）。需要 python3 與 node ≥ 22（內建 WebSocket）。
 *   會在 127.0.0.1:4198 起一個「開發模式」的測試後端，資料寫進暫存的 SQLite，
 *   不會碰到正式資料庫。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = resolve(process.env.HOME, 'TelegramClaude/claude-shared/projects/LanExamMock/backend');
const SHELL = process.env.CHROME_SHELL ||
  process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';

if (!existsSync(SHELL)) {
  console.log('（跳過瀏覽器 smoke test：找不到 ' + SHELL + '，可用 CHROME_SHELL=<路徑> 指定）');
  process.exit(0);
}
if (!existsSync(join(BACKEND, 'cam.js'))) {
  console.log('（跳過瀏覽器 smoke test：找不到後端 ' + BACKEND + '）');
  process.exit(0);
}

const WEB_PORT = 8793;
const API_PORT = 4198;
const fails = [];
const check = (n, c, x = '') => {
  console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' — ' + x));
  if (!c) fails.push(n);
};

/* ---- 測試用後端：開發模式 ＋ 暫存資料庫，絕不碰正式的 progress.db ---- */
const TMP = mkdtempSync(join(tmpdir(), 'camreview-smoke-'));
const bootstrap = join(TMP, 'server.mjs');
writeFileSync(bootstrap, `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(join(BACKEND, 'x.js'))});
process.env.DEV_MODE = 'true';
process.env.DEV_TOKEN = 'devtok';
process.env.DEV_USER_EMAIL = 'smoke@example.com';
process.env.DEV_USER_SUB = 'smoke-sub';
const express = require('express');
const cors = require('cors');
const cam = require(${JSON.stringify(join(BACKEND, 'cam.js'))});
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/cam', cam.router);
app.listen(${API_PORT}, () => console.log('ready'));
`);

const api = spawn('node', [bootstrap], { stdio: 'ignore', env: { ...process.env, LANEXAM_DB: join(TMP, 'test.db') } });
const web = spawn('python3', ['-m', 'http.server', String(WEB_PORT)], { cwd: ROOT, stdio: 'ignore' });
const PROFILE = mkdtempSync(join(tmpdir(), 'camreview-profile-'));
const chrome = spawn(SHELL, ['--remote-debugging-port=0', '--no-sandbox', '--disable-gpu',
  `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

async function cdpPort() {
  for (let i = 0; i < 60; i++) {
    try { return parseInt(readFileSync(join(PROFILE, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); }
    catch (e) { await sleep(250); }
  }
  throw new Error('chrome 沒有寫出 DevToolsActivePort');
}

let classCode = null, classId = null;

try {
  /* 等測試後端起來 */
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${API_PORT}/api/cam/classes`); break; } catch (e) { await sleep(250); }
  }

  /* 老師建一個班（走 dev token，不需要真的 Google 登入） */
  const created = await (await fetch(`http://127.0.0.1:${API_PORT}/api/cam/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer devtok' },
    body: JSON.stringify({ name: '煙霧測試班', level: 'fce' })
  })).json();
  classCode = created.klass.code;
  classId = created.klass.id;

  const CDP = await cdpPort();
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise(r => pending.set(mid, r));
  };
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.CAM_API_BASE = 'http://127.0.0.1:${API_PORT}';`
  });
  const open = async () => {
    await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/index.html` });
    await sleep(900);
  };

  console.log('學生登入與跨裝置同步');
  await open();
  check('首頁顯示身分選擇', await js(`!document.getElementById('view-role').classList.contains('hidden')`));

  await js(`document.querySelector('[data-go="student"]').click()`);
  await sleep(200);
  check('進到學生登入畫面', await js(`!document.getElementById('view-student-login').classList.contains('hidden')`));

  /* 欄位沒填完要擋下來，不能送出去 */
  await js(`document.getElementById('do-login').click()`);
  await sleep(300);
  check('欄位沒填完會擋下來', await js(`!document.getElementById('login-error').classList.contains('hidden')`));

  /* 代碼故意打小寫＋夾一個連字號，驗證前端會正規化 */
  await js(`document.getElementById('in-code').value = '${classCode.toLowerCase().slice(0, 3)}-${classCode.toLowerCase().slice(3)}';
            document.getElementById('in-name').value = '王小明';
            document.getElementById('in-seat').value = '7';
            document.getElementById('do-login').click();`);
  await sleep(1200);
  check('小寫＋連字號的代碼也能登入', await js(`!document.getElementById('view-student-home').classList.contains('hidden')`),
    await js(`document.getElementById('login-error').textContent`));
  check('首頁顯示座號與姓名', /Seat 7 — 王小明/.test(await js(`document.getElementById('stu-name').textContent`)),
    await js(`document.getElementById('stu-name').textContent`));
  check('標題列顯示班級與身分', /煙霧測試班/.test(await js(`document.getElementById('who').textContent`)));
  check('token 存進 localStorage', (await js(`localStorage.getItem('cam.student') || ''`)).startsWith('cam.'));

  /* 關掉再開＝同一台裝置的下一次造訪，必須自動回到已登入狀態 */
  await open();
  check('重新開啟仍是已登入狀態', await js(`!document.getElementById('view-student-home').classList.contains('hidden')`));
  check('重開後身分沒有跑掉', /Seat 7 — 王小明/.test(await js(`document.getElementById('stu-name').textContent`)));

  /* 寫一筆進度，清掉 localStorage（模擬換一台裝置）再用同一組代碼＋座號登入 */
  await js(`window.CamAPI.putProgress({ done: [1,2,3] })`);
  await js(`localStorage.clear()`);
  await open();
  check('清掉本機資料後回到身分選擇', await js(`!document.getElementById('view-role').classList.contains('hidden')`));
  await js(`document.querySelector('[data-go="student"]').click();
            document.getElementById('in-code').value = '${classCode}';
            document.getElementById('in-name').value = '王小明';
            document.getElementById('in-seat').value = '7';
            document.getElementById('do-login').click();`);
  await sleep(1200);
  const blob = await js(`window.CamAPI.getProgress().then(function (d) { return JSON.stringify(d.blob); })`);
  check('換裝置後讀得到同一份進度', blob === '{"done":[1,2,3]}', String(blob));

  /* 學生看不到老師端 */
  const teacherProbe = await js(`window.CamAPI.listClasses().then(function(){return 'ok';}, function(e){return 'blocked:' + e.status;})`);
  check('學生身分打不到老師端點', teacherProbe === 'blocked:401', String(teacherProbe));

  console.log('\n老師端名冊');
  const roster = await (await fetch(`http://127.0.0.1:${API_PORT}/api/cam/classes/${classId}/students`, {
    headers: { Authorization: 'Bearer devtok' }
  })).json();
  check('名冊自動長出登入過的學生', roster.students.length === 1 && roster.students[0].seatNo === '7');
  check('名冊記錄最後登入時間', !!roster.students[0].lastSeen);

} catch (e) {
  check('smoke test 執行完成', false, e.message);
} finally {
  try { chrome.kill(); } catch (e) {}
  try { web.kill(); } catch (e) {}
  try { api.kill(); } catch (e) {}
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  try { rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

console.log(fails.length ? `\n${fails.length} 項失敗` : '\n全部通過');
process.exit(fails.length ? 1 : 0);
