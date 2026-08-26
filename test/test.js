/* CamReview — 純邏輯測試。執行：node test/test.js */
"use strict";
const path = require("path");
const fs = require("fs");
const U = require(path.join(__dirname, "..", "js", "util.js"));

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name); }
}

/* ---------- parseBulk ---------- */
{
  const rows = U.parseBulk("1,王小明\n2,陳小華\n3,林小美");
  check("解析三行名冊", rows.length === 3);
  check("座號與姓名對應正確", rows[0].seatNo === "1" && rows[0].name === "王小明");

  check("空白行略過", U.parseBulk("1,甲\n\n\n2,乙").length === 2);
  check("缺姓名的行略過", U.parseBulk("1,\n2,乙").length === 1);
  check("缺座號的行略過", U.parseBulk(",甲\n2,乙").length === 1);
  check("沒有分隔符號的行略過", U.parseBulk("王小明").length === 0);

  /* 老師常直接從試算表貼過來 */
  check("接受定位字元（Excel 貼上）", U.parseBulk("1\t王小明").length === 1);
  check("接受全形逗號", U.parseBulk("1，王小明")[0].name === "王小明");
  check("前後空白會被去掉", U.parseBulk("  7 ,  王小明  ")[0].seatNo === "7");
  check("姓名含逗號時整段保留", U.parseBulk("1,Smith, John")[0].name === "Smith, John");
  check("空字串不會爆", U.parseBulk("").length === 0);
  check("null 不會爆", U.parseBulk(null).length === 0);
}

/* ---------- normalizeCode ---------- */
{
  check("代碼轉大寫", U.normalizeCode("k7m2qd") === "K7M2QD");
  check("去掉空白", U.normalizeCode(" K7M 2QD ") === "K7M2QD");
  check("去掉連字號", U.normalizeCode("K7M-2QD") === "K7M2QD");
  check("空值回空字串", U.normalizeCode(null) === "");
}

/* ---------- fmtSeen ---------- */
{
  check("沒登入過講清楚", U.fmtSeen(null) === "尚未登入");
  check("0 也視為沒登入過", U.fmtSeen(0) === "尚未登入");
  const d = new Date(2026, 7, 26, 9, 5);      // 8/26 09:05（本地時區）
  check("時間補零", U.fmtSeen(d.getTime()) === "8/26 09:05");
}

/* ---------- esc ---------- */
{
  check("跳脫角括號", U.esc("<script>") === "&lt;script&gt;");
  check("跳脫引號", U.esc('a"b') === "a&quot;b");
  check("跳脫 & 且不重複跳脫", U.esc("a&b") === "a&amp;b");
}

/* ---------- 靜態檔案的一致性 ---------- */
{
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  /* 每一支 js/css 都要被 index.html 載到，否則就是靜默失效 */
  ["js/dialog.js", "js/util.js", "js/pick.js", "js/versions.js", "js/api.js", "js/app.js", "css/style.css"]
    .forEach((f) => check("index.html 有載入 " + f, html.includes(f)));

  /* 快取戳：所有本站資源的 ?v= 必須一致，否則會出現半新半舊的混版 */
  const stamps = [...html.matchAll(/(?:js|css)\/[\w.-]+\?v=([\w]+)/g)].map((m) => m[1]);
  check("有加上快取戳", stamps.length >= 5);
  check("快取戳全站一致", new Set(stamps).size === 1);

  /* app.js 寫進 innerHTML 的地方一定要先過 esc() —— 學生姓名是使用者輸入 */
  const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  const rawInterp = app.match(/innerHTML\s*=\s*[^;]*\+\s*(?:c|s)\.(?:name|code|seatNo)\b/g);
  check("寫入 innerHTML 前都有跳脫", rawInterp === null);

  /* 版本紀錄頁是本線的硬規則，新站上線就要有。versions.js 是瀏覽器腳本（寫 window），
   * 用假的 window 求值再檢查內容，不能直接 require。 */
  const win = {};
  new Function("window", fs.readFileSync(path.join(root, "js", "versions.js"), "utf8"))(win);
  check("versions.js 有版本條目", Array.isArray(win.APP_VERSIONS) && win.APP_VERSIONS.length >= 1);
  check("每條版本都有 v/date/items", win.APP_VERSIONS.every(
    (v) => v.v && v.date && Array.isArray(v.items) && v.items.length));
}

/* ---------- pick.js：題庫轉換與自訂題 ---------- */
{
  const P = require(path.join(__dirname, "..", "js", "pick.js"));

  /* 四種 Part 的原始格式各不相同，轉出來都必須是 mc 或 gap */
  const p1 = P.toItem("p1", { text: "I'm keen ___ films.", options: ["on", "in"], answer: 0, explanation: "keen on" });
  check("part1 轉成選擇題", p1.kind === "mc" && p1.options.length === 2 && p1.answer === 0);

  const p2 = P.toItem("p2", { text: "living here ___ ten years", answers: ["for"], explanation: "x" });
  check("part2 轉成填空題", p2.kind === "gap" && p2.answers[0] === "for");

  const p3 = P.toItem("p3", { text: "The ___ is planned.", stem: "OPEN", answers: ["opening"] });
  check("part3 題幹要帶出提示字", p3.q.includes("OPEN"));

  const p4 = P.toItem("p4", { original: "I haven't seen Tom.", keyword: "LAST", gapped: "The ___ was ages ago.", answers: ["last time I saw"] });
  check("part4 帶出原句與關鍵字", p4.q.includes("LAST") && p4.q.includes("I haven't seen Tom."));

  check("認不得的來源回 null", P.toItem("zzz", { text: "x" }) === null);
  check("缺欄位回 null", P.toItem("p1", { text: "x" }) === null);

  /* 閱讀：一篇文章攤平成多題，每題都要帶著文章 */
  const rd = P.readingToItems({
    text: "PASSAGE",
    questions: [
      { q: "Q1", options: ["a", "b"], answer: 1, explanation: "e1" },
      { q: "Q2", options: ["c", "d"], answer: 0 }
    ]
  });
  check("閱讀攤平成兩題", rd.length === 2);
  check("每一題都帶著文章", rd.every((r) => r.passage === "PASSAGE"));

  /* 抽題不可重複——同一份作業出現兩題一樣的，老師就不會再信任這個功能 */
  const pool = [1, 2, 3, 4, 5];
  const picked = P.sample(pool, 5, () => 0);           // 固定 rng 也要抽滿且不重複
  check("抽題數量正確", picked.length === 5);
  check("抽題不重複", new Set(picked).size === 5);
  check("要求超過題庫數量時就給全部", P.sample([1, 2], 10, Math.random).length === 2);
  check("抽題不會動到原始陣列", pool.length === 5);

  /* 自訂題 */
  const mc = P.buildCustom({ kind: "mc", q: "Pick one", options: ["a", "b", " ", "c"], answer: 1 });
  check("自訂選擇題會過濾空選項", mc.options.length === 3);
  check("自訂選擇題答案索引保留", mc.answer === 1);
  check("答案索引超出範圍回 null", P.buildCustom({ kind: "mc", q: "x", options: ["a", "b"], answer: 9 }) === null);
  check("選項不足回 null", P.buildCustom({ kind: "mc", q: "x", options: ["a"], answer: 0 }) === null);
  check("沒有題幹回 null", P.buildCustom({ kind: "mc", q: "  ", options: ["a", "b"], answer: 0 }) === null);

  const gap = P.buildCustom({ kind: "gap", q: "It was ___ cold.", answers: "so, such" });
  check("自訂填空可以有多個答案", gap.answers.length === 2 && gap.answers[1] === "such");
  check("全形逗號也能分隔答案", P.buildCustom({ kind: "gap", q: "x", answers: "a，b" }).answers.length === 2);
  check("沒有答案回 null", P.buildCustom({ kind: "gap", q: "x", answers: " " }) === null);

  const wr = P.buildCustom({ kind: "writing", prompt: "Write an email.", minWords: 140, maxWords: 190 });
  check("自訂寫作題", wr.kind === "writing" && wr.minWords === 140);
  check("寫作題沒有題目回 null", P.buildCustom({ kind: "writing", prompt: "" }) === null);

  /* 字數（寫作題的下限提示） */
  check("字數：空白回 0", P.countWords("   ") === 0);
  check("字數：連續空白只算一次", P.countWords("a   b  c") === 3);
  check("字數：換行也算分隔", P.countWords("a\nb") === 2);
}

/* ---------- CSV 匯出 ---------- */
{
  const csv = U.toCSV([["座號", "姓名", "分數"], ["7", "王, 小明", "3/5"]]);
  check("CSV 開頭有 BOM（Excel 才不會亂碼）", csv.charCodeAt(0) === 0xfeff);
  check("含逗號的欄位有加引號", csv.includes('"王, 小明"'));
  check("列以 CRLF 分隔", csv.includes("\r\n"));
  check("引號會被跳脫成兩個", U.toCSV([['say "hi"']]).includes('""hi""'));
  check("含換行的欄位有加引號", U.toCSV([["a\nb"]]).includes('"a\nb"'));
  check("空值不會變成 undefined", U.toCSV([[null, undefined, 0]]).endsWith(",,0"));
  check("空陣列不會爆", typeof U.toCSV([]) === "string");

  check("正確率 null 顯示破折號", U.pctLabel(null) === "—");
  check("正確率 0 要顯示 0% 而不是破折號", U.pctLabel(0) === "0%");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
