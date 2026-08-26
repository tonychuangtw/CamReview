/* ============================================================
 * CamReview — 把 FCE 題庫的原始格式轉成「作業題目」的統一格式（純函式，可測）
 *
 * 題庫裡每一個 Part 的欄位長得都不一樣（part1 是選擇、part2/3 是填空、
 * part4 是句型轉換、閱讀是一篇文章配數個子題），作業端只認得三種題型：
 *   mc / gap / writing
 * 這支就是那層轉換。轉出來的東西會原封不動存進作業快照，所以格式要穩定。
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CamPick = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  /* 題庫來源的代號 → 給老師看的名稱 */
  var SOURCES = [
    { key: "p1", label: "Use of English Part 1 — 四選一克漏字" },
    { key: "p2", label: "Use of English Part 2 — 填空（一格一字）" },
    { key: "p3", label: "Use of English Part 3 — 詞形變化" },
    { key: "p4", label: "Use of English Part 4 — 句型轉換" },
    { key: "rmc", label: "Reading — 閱讀測驗（四選一）" }
  ];

  function toItem(source, raw) {
    if (!raw) return null;

    if (source === "p1") {
      if (!raw.text || !Array.isArray(raw.options)) return null;
      return {
        kind: "mc", q: raw.text, options: raw.options.slice(),
        answer: raw.answer, explanation: raw.explanation || ""
      };
    }

    if (source === "p2") {
      if (!raw.text || !Array.isArray(raw.answers)) return null;
      return { kind: "gap", q: raw.text, answers: raw.answers.slice(), explanation: raw.explanation || "" };
    }

    if (source === "p3") {
      if (!raw.text || !Array.isArray(raw.answers)) return null;
      /* 詞形變化一定要把題幹給的那個字（stem）秀出來，否則題目無解 */
      return {
        kind: "gap",
        q: raw.text + (raw.stem ? "   [" + raw.stem + "]" : ""),
        answers: raw.answers.slice(),
        explanation: raw.explanation || ""
      };
    }

    if (source === "p4") {
      if (!raw.gapped || !Array.isArray(raw.answers)) return null;
      return {
        kind: "gap",
        q: raw.original + "\n[" + raw.keyword + "]\n" + raw.gapped,
        answers: raw.answers.slice(),
        explanation: raw.explanation || ""
      };
    }

    return null;
  }

  /* 閱讀是「一篇文章 ＋ 數個子題」，攤平成數個 mc，每一題都帶著同一篇文章。 */
  function readingToItems(set) {
    if (!set || !Array.isArray(set.questions)) return [];
    return set.questions.map(function (q) {
      if (!q || !Array.isArray(q.options)) return null;
      return {
        kind: "mc",
        q: q.q,
        options: q.options.slice(),
        answer: q.answer,
        explanation: q.explanation || "",
        passage: set.text
      };
    }).filter(Boolean);
  }

  /* 從題庫抽 n 題。rng 傳入才好測（不傳就用 Math.random）。
   * 抽出來的是不重複的題目——同一份作業出現兩題一模一樣，老師會直接不信任這個功能。 */
  function sample(list, n, rng) {
    rng = rng || Math.random;
    var pool = list.slice();
    var out = [];
    n = Math.min(n, pool.length);
    for (var i = 0; i < n; i++) {
      var idx = Math.floor(rng() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  /* 從 window.FCE_BANK 依來源抽 n 題，回傳作業題目陣列。 */
  function pick(bank, source, n, rng) {
    if (!bank) return [];
    if (source === "rmc") {
      var sets = sample(bank.reading && bank.reading.mc ? bank.reading.mc : [], 1, rng);
      /* 閱讀一次給一整組（同一篇文章的全部子題），再依需要截斷 */
      return readingToItems(sets[0]).slice(0, n);
    }
    var list = bank[source] || [];
    return sample(list, n, rng).map(function (raw) { return toItem(source, raw); }).filter(Boolean);
  }

  /* 老師手打的題目：把表單欄位整理成作業題目。回傳 null 代表資料不完整。 */
  function buildCustom(form) {
    form = form || {};
    if (form.kind === "mc") {
      var options = (form.options || []).map(function (o) { return String(o == null ? "" : o).trim(); })
        .filter(function (o) { return o.length; });
      var answer = Number(form.answer);
      if (!String(form.q || "").trim() || options.length < 2) return null;
      if (!(answer >= 0 && answer < options.length)) return null;
      return {
        kind: "mc", q: String(form.q).trim(), options: options, answer: answer,
        explanation: String(form.explanation || "").trim()
      };
    }
    if (form.kind === "gap") {
      /* 可接受的答案用半形或全形逗號分隔，讓老師能一次寫好幾種寫法 */
      var answers = String(form.answers || "").split(/[,，]/)
        .map(function (a) { return a.trim(); })
        .filter(function (a) { return a.length; });
      if (!String(form.q || "").trim() || !answers.length) return null;
      return {
        kind: "gap", q: String(form.q).trim(), answers: answers,
        explanation: String(form.explanation || "").trim()
      };
    }
    if (form.kind === "writing") {
      var prompt = String(form.prompt || "").trim();
      if (!prompt) return null;
      var min = Number(form.minWords) > 0 ? Number(form.minWords) : null;
      var max = Number(form.maxWords) > 0 ? Number(form.maxWords) : null;
      return { kind: "writing", prompt: prompt, minWords: min, maxWords: max };
    }
    return null;
  }

  /* 學生作答的字數（寫作題的下限提示用）。英文以空白分詞就夠準。 */
  function countWords(text) {
    var t = String(text == null ? "" : text).trim();
    return t ? t.split(/\s+/).length : 0;
  }

  return {
    SOURCES: SOURCES,
    toItem: toItem,
    readingToItems: readingToItems,
    sample: sample,
    pick: pick,
    buildCustom: buildCustom,
    countWords: countWords
  };
});
