/* ============================================================
 * CamReview — 純函式工具（不碰 DOM，node test/test.js 直接 require 這支）
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CamUtil = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  /* 批次匯入名冊：一行「座號,姓名」。
   * 全形逗號與定位字元也接受——老師常直接從 Excel 或 Google 試算表貼過來。
   * 姓名中若含半形逗號，第一個逗號之後全部視為姓名（座號不會有逗號）。 */
  function parseBulk(text) {
    return String(text == null ? "" : text).split(/\r?\n/).map(function (line) {
      var parts = line.split(/[,，\t]/);
      if (parts.length < 2) return null;
      var seatNo = parts[0].trim();
      var name = parts.slice(1).join(",").trim();
      if (!seatNo || !name) return null;
      return { seatNo: seatNo, name: name };
    }).filter(Boolean);
  }

  /* 最後登入時間，顯示成 8/26 14:05；沒登入過就講清楚。 */
  function fmtSeen(ts) {
    if (!ts) return "Not signed in yet";
    var d = new Date(ts);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* 班級代碼一律轉大寫並去掉空白與連字號——學生手抄常會補上分隔符號。 */
  function normalizeCode(raw) {
    return String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /* HTML 轉義，所有寫進 innerHTML 的使用者輸入都必須先過這一關。 */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 產生 CSV。老師會用 Excel 開，所以：
   *   - 含逗號、引號或換行的欄位要用雙引號包起來，內部的引號要變成兩個
   *   - 開頭補 BOM，Excel 才不會把中文姓名讀成亂碼（這是最常被回報的問題） */
  function toCSV(rows) {
    var body = (rows || []).map(function (row) {
      return (row || []).map(function (cell) {
        var v = cell == null ? "" : String(cell);
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\r\n");
    return "\ufeff" + body;
  }

  /* 正確率轉成一句人看得懂的話（null 代表還沒有可統計的作答） */
  function pctLabel(pct) {
    if (pct == null) return "—";
    return pct + "%";
  }

  return {
    parseBulk: parseBulk, fmtSeen: fmtSeen, normalizeCode: normalizeCode, esc: esc,
    toCSV: toCSV, pctLabel: pctLabel
  };
});
