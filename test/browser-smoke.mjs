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

  console.log('\n作業：老師派題 → 學生作答 → 自動批改');
  /* 老師派一份含三種題型的作業 */
  const asg = await (await fetch(`http://127.0.0.1:${API_PORT}/api/cam/classes/${classId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer devtok' },
    body: JSON.stringify({
      title: 'Unit 3 練習',
      items: [
        { kind: 'mc', q: 'She is keen ___ tennis.', options: ['on', 'in', 'at', 'for'], answer: 0, explanation: 'be keen on' },
        { kind: 'gap', q: 'It was ___ cold that the lake froze.', answers: ['so'], explanation: 'so + adj + that' },
        { kind: 'writing', prompt: 'Write an email about your weekend.', minWords: 20 }
      ]
    })
  })).json();
  check('老師建立作業成功', !!asg.assignment && asg.assignment.count === 3, JSON.stringify(asg).slice(0, 120));

  await open();
  await sleep(600);
  check('學生首頁列出作業', /Unit 3 練習/.test(await js(`document.getElementById('stu-assignments').textContent`)),
    await js(`document.getElementById('stu-assignments').textContent`));

  await js(`document.querySelector('#stu-assignments button').click()`);
  await sleep(900);
  check('進入作答畫面', await js(`!document.getElementById('view-take').classList.contains('hidden')`));
  check('三題都渲染出來', await js(`document.querySelectorAll('#take-items > .card').length === 3`));
  check('選擇題畫出四個選項', await js(`document.querySelectorAll('#take-items input[type=radio]').length === 4`));

  /* 網路上抓不到答案——這是「學生不能從開發者工具看答案」的實質驗證 */
  const leaked = await js(`(function(){
    var t = document.getElementById('take-items').textContent;
    return t.indexOf('be keen on') >= 0 || t.indexOf('so + adj') >= 0;
  })()`);
  check('作答頁看不到解析', leaked === false);

  /* 寫作題的字數會即時更新 */
  await js(`(function(){
    var ta = document.querySelector('#take-items textarea');
    ta.value = 'one two three';
    ta.dispatchEvent(new Event('input'));
  })()`);
  await sleep(200);
  check('寫作題顯示字數', /3 words/.test(await js(`document.getElementById('take-items').textContent`)),
    await js(`document.getElementById('take-items').textContent.slice(-120)`));

  /* 作答：選擇題選第一個（正解）、填空故意打大寫加句點 */
  await js(`(function(){
    var r = document.querySelectorAll('#take-items input[type=radio]')[0];
    r.checked = true; r.dispatchEvent(new Event('change'));
    var inp = document.querySelector('#take-items input[type=text]');
    inp.value = ' So. '; inp.dispatchEvent(new Event('input'));
  })()`);
  await js(`document.getElementById('do-submit').click()`);
  await sleep(1200);
  check('交卷後看到成績頁', await js(`!document.getElementById('view-result').classList.contains('hidden')`));
  check('自動批改給 2 / 2', (await js(`document.getElementById('res-score').textContent`)) === '2 / 2',
    await js(`document.getElementById('res-score').textContent`));
  check('提醒寫作要另外批改', /marked separately/.test(await js(`document.getElementById('res-note').textContent`)));
  check('交卷後才看得到解析', /be keen on/.test(await js(`document.getElementById('res-review').textContent`)));

  /* 老師端立刻看得到成績 */
  const detail = await (await fetch(`http://127.0.0.1:${API_PORT}/api/cam/assignments/${asg.assignment.id}`, {
    headers: { Authorization: 'Bearer devtok' }
  })).json();
  const me = detail.students.find((s) => s.seatNo === '7');
  check('老師端看得到該生已交', me && me.status === 'submitted');
  check('老師端看得到分數', me && me.score === 2 && me.total === 2);

  console.log('\n老師儀表板（用 dev token 直接驗後端算出來的數字）');
  const dash = await (await fetch(`http://127.0.0.1:${API_PORT}/api/cam/classes/${classId}/dashboard`, {
    headers: { Authorization: 'Bearer devtok' }
  })).json();
  check('儀表板算出全班人數', dash.students.length >= 1);
  const dStu = dash.students.find((s) => s.seatNo === '7');
  check('該生交了一份', dStu && dStu.submitted === 1);
  check('該生平均 100%（兩題全對）', dStu && dStu.avgPct === 100, JSON.stringify(dStu));
  check('作業平均算得出來', dash.assignments[0].avgPct === 100);
  check('題型統計不含寫作', !dash.byKind.writing);
  check('最容易錯的題目列表有內容', dash.hardest.length >= 2);

  const work = await (await fetch(
    `http://127.0.0.1:${API_PORT}/api/cam/classes/${classId}/students/${dStu.id}/work`,
    { headers: { Authorization: 'Bearer devtok' } })).json();
  check('看得到該生的作答明細', work.work.length === 1 && work.work[0].items.length === 3);
  check('選擇題的作答轉成選項文字', work.work[0].items[0].given === 'on', String(work.work[0].items[0].given));
  check('寫作全文有保留', work.work[0].items[2].given === 'one two three', String(work.work[0].items[2].given));

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
