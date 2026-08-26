#!/usr/bin/env node
/* ============================================================
 * 從 LanExamMock 同步 FCE 題庫，產生 js/data/fce-bank.js
 *
 * 為什麼要同步而不是各自維護：題庫只有一份正本（LanExamMock），加題一律加在那邊，
 * CamReview 只是把它攤平成一支好載入的檔案。兩邊各改一份必定走鐘。
 *
 * 用法：node tools/sync-banks.js [LanExamMock 的路徑]
 * 預設路徑：~/TelegramClaude/LanExamMock
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const SRC = process.argv[2] || path.join(os.homedir(), "TelegramClaude", "LanExamMock");
const LEVEL = "fce";
const base = path.join(SRC, "js", "levels", LEVEL);
const banks = path.join(base, "banks");

if (!fs.existsSync(banks)) {
  console.error("找不到題庫來源：" + banks);
  console.error("用法：node tools/sync-banks.js [LanExamMock 的路徑]");
  process.exit(1);
}

/* 每一支 bank 檔在 Node 下都會 module.exports 出自己那一批題目（瀏覽器下才掛到 window），
 * 所以直接 require 就好，不必模擬瀏覽器環境。 */
function loadBanks(prefix) {
  return fs.readdirSync(banks)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".js"))
    .sort()
    .flatMap((f) => {
      const rows = require(path.join(banks, f));
      if (!Array.isArray(rows)) {
        console.error("⚠ " + f + " 沒有匯出陣列，略過");
        return [];
      }
      return rows;
    });
}

const seed = require(path.join(base, "questions.js"));

const bank = {
  /* Use of English：第一批的挑題器只用得到這四個部分與閱讀 */
  p1: seed.QUESTIONS.part1.concat(loadBanks("p1-w")),
  p2: seed.QUESTIONS.part2.concat(loadBanks("p2-w")),
  p3: seed.QUESTIONS.part3.concat(loadBanks("p3-w")),
  p4: seed.QUESTIONS.part4.concat(loadBanks("p4-w")),
  reading: {
    mc: loadBanks("reading-mc-w"),
    gap: loadBanks("reading-gap-w"),
    match: loadBanks("reading-match-w"),
    tfng: loadBanks("reading-tfng-w"),
    head: loadBanks("reading-head-w")
  },
  writing: seed.WRITING.concat(loadBanks("writing-x"), loadBanks("ielts-writing-x"))
};

/* 每一題都要有能唯一指認的 id。題庫裡的 p1–p4 原本沒有 id（靠陣列位置），
 * 這裡補上穩定的合成 id，作業存的是快照，之後題庫增刪也不會讓學生的作業跑掉。 */
function stamp(list, prefix) {
  list.forEach((q, i) => { if (!q.id) q.id = prefix + "-" + (i + 1); });
  return list;
}
stamp(bank.p1, "p1"); stamp(bank.p2, "p2"); stamp(bank.p3, "p3"); stamp(bank.p4, "p4");
Object.keys(bank.reading).forEach((k) => stamp(bank.reading[k], "r" + k));
stamp(bank.writing, "w");

const counts = {
  p1: bank.p1.length, p2: bank.p2.length, p3: bank.p3.length, p4: bank.p4.length,
  rmc: bank.reading.mc.length, rgap: bank.reading.gap.length, rmatch: bank.reading.match.length,
  rtfng: bank.reading.tfng.length, rhead: bank.reading.head.length,
  writing: bank.writing.length
};

const outDir = path.join(__dirname, "..", "js", "data");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "fce-bank.js");

const header = `/* ⚠️ 這支檔案是自動產生的，不要手改。
 * 正本在 LanExamMock（js/levels/fce/），要加題請加在那裡，再跑：
 *     node tools/sync-banks.js
 * 產生時間：${new Date().toISOString().slice(0, 10)}
 * 題數：${JSON.stringify(counts)}
 */
window.FCE_BANK = `;

fs.writeFileSync(out, header + JSON.stringify(bank) + ";\n", "utf8");

const kb = Math.round(fs.statSync(out).size / 1024);
console.log("寫入 " + path.relative(path.join(__dirname, ".."), out) + "（" + kb + " KB）");
Object.entries(counts).forEach(([k, v]) => console.log("  " + k.padEnd(8) + v));
