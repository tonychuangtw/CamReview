/* ============================================================
 * CamReview — 前端主程式（第一批：身分、班級、名冊、跨裝置同步）
 *
 * 語言分工（2026-08-26 定案）：
 *   學生會看到的「學習內容與練習介面」一律英文，維持沉浸（與 LanExamMock 一致）
 *   老師的管理介面（班級、名冊、作業設定）用中文，因為那是工具不是教材
 * ============================================================ */
(function () {
  "use strict";

  var API = window.CamAPI;
  var GOOGLE_CLIENT_ID = "481860179039-gb37qsdogd4vgnn2g5umh73jen02avj4.apps.googleusercontent.com";

  var U = window.CamUtil;
  /* 快取戳：從自己的 <script src> 讀出來，之後動態載入題庫時沿用同一個戳記，
     不必在 HTML 裡另外維護一份（維護兩份必定走鐘）。 */
  var STAMP = (function () {
    var src = document.currentScript ? document.currentScript.src : "";
    var m = /[?&]v=(\w+)/.exec(src);
    return m ? m[1] : "1";
  })();
  function $(id) { return document.getElementById(id); }
  var esc = U.esc;
  function alertMsg(m) { if (window.UIDialog) UIDialog.alert(m); else window.alert(m); }
  function confirmMsg(m, ok) { if (window.UIDialog) UIDialog.confirm(m, ok); else if (window.confirm(m)) ok(); }

  /* ---------------- 檢視切換 ---------------- */
  var VIEWS = ["view-role", "view-student-login", "view-student-home",
    "view-teacher-login", "view-teacher-home", "view-class", "view-assign-build",
    "view-assign-detail", "view-dashboard", "view-student-work",
    "view-take", "view-result", "view-versions"];
  var current = "view-role";
  var beforeVersions = "view-role";

  function show(id) {
    if (id !== "view-versions") beforeVersions = id;
    current = id;
    VIEWS.forEach(function (v) {
      var el = $(v);
      if (el) el.classList.toggle("hidden", v !== id);
    });
    window.scrollTo(0, 0);
    paintWho();
  }

  function paintWho() {
    var who = $("who"), out = $("logout");
    var p = API.studentProfile();
    if (API.isStudent() && p) {
      who.textContent = p.klass.name + " · " + p.student.seatNo + " " + p.student.name;
      out.classList.remove("hidden");
    } else if (API.isTeacher()) {
      who.textContent = "老師";
      out.classList.remove("hidden");
    } else {
      who.textContent = "";
      out.classList.add("hidden");
    }
  }

  /* ---------------- 學生 ---------------- */
  function studentLogin() {
    var code = U.normalizeCode($("in-code").value);
    var name = $("in-name").value.trim();
    var seat = $("in-seat").value.trim();
    var err = $("login-error");
    err.classList.add("hidden");

    if (!code || !name || !seat) {
      err.textContent = "Please fill in the class code, your name and your seat number.";
      err.classList.remove("hidden");
      return;
    }
    var btn = $("do-login");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    API.studentLogin(code, name, seat).then(function () {
      btn.disabled = false;
      btn.textContent = "Sign in";
      paintStudentHome();
      show("view-student-home");
    }, function (e) {
      btn.disabled = false;
      btn.textContent = "Sign in";
      err.textContent = e.message;
      err.classList.remove("hidden");
    });
  }

  var STATUS_TEXT = {
    "not-started": "Not started",
    "in-progress": "In progress",
    "submitted": "Submitted"
  };

  function loadStudentAssignments() {
    var box = $("stu-assignments");
    box.innerHTML = '<p class="hint">Loading…</p>';
    API.myAssignments().then(function (data) {
      if (!data.assignments.length) {
        box.innerHTML = '<p class="hint">No assignments yet. They will appear here as soon as your teacher sets one.</p>';
        return;
      }
      box.innerHTML = "";
      data.assignments.forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "class-row";
        var right = a.status === "submitted"
          ? (a.total ? a.score + " / " + a.total : "Submitted")
          : STATUS_TEXT[a.status];
        b.innerHTML = "<span>" + esc(a.title) + "</span>" +
          '<span class="count">' + esc(right) + "</span>";
        b.addEventListener("click", function () { startTake(a); });
        box.appendChild(b);
      });
    }, function (e) {
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function paintStudentHome() {
    var p = API.studentProfile();
    if (!p) return;
    $("stu-class").textContent = p.klass.name + " · " + p.klass.level.toUpperCase();
    $("stu-name").textContent = "Seat " + p.student.seatNo + " — " + p.student.name;
    $("stu-sync").textContent =
      "Signed in on this device. Use the same class code and seat number anywhere else and " +
      "you'll pick up exactly where you left off.";
    loadStudentAssignments();
  }

  /* ---------------- 老師：Google 登入 ---------------- */
  var gsiLoaded = false;

  function loadGSI() {
    if (gsiLoaded) return;
    gsiLoaded = true;
    var note = $("gsi-note");
    note.textContent = "載入 Google 登入元件…";
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = function () {
      try {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
        google.accounts.id.renderButton($("gsi-slot"), { theme: "filled_black", size: "large", width: 260 });
        note.textContent = "";
      } catch (e) {
        note.textContent = "Google 登入元件初始化失敗：" + e.message;
      }
    };
    s.onerror = function () {
      gsiLoaded = false;
      note.textContent = "連不上 Google 登入元件（通常是網路或擋廣告的擴充套件）。重新整理再試一次。";
    };
    document.head.appendChild(s);
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) return;
    $("gsi-note").textContent = "登入中…";
    API.exchangeGoogleToken(resp.credential).then(function () {
      $("gsi-note").textContent = "";
      loadClasses();
      show("view-teacher-home");
    }, function (e) {
      $("gsi-note").textContent = "登入失敗：" + e.message;
    });
  }

  /* ---------------- 老師：班級 ---------------- */
  function loadClasses() {
    var box = $("class-list");
    box.innerHTML = '<p class="hint">載入中…</p>';
    API.listClasses().then(function (data) {
      if (!data.classes.length) {
        box.innerHTML = '<p class="hint">還沒有班級。在下面輸入名稱就能建立第一個班。</p>';
        return;
      }
      box.innerHTML = "";
      data.classes.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "class-row";
        b.innerHTML = '<span class="code">' + esc(c.code) + "</span>" +
          "<span>" + esc(c.name) + "</span>" +
          '<span class="count">' + c.students + " 人</span>";
        b.addEventListener("click", function () { openClass(c.id); });
        box.appendChild(b);
      });
    }, function (e) {
      if (e.status === 401) { API.teacherLogout(); show("view-teacher-login"); loadGSI(); return; }
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function createClass() {
    var name = $("in-class-name").value.trim();
    var err = $("class-error");
    err.classList.add("hidden");
    if (!name) {
      err.textContent = "請先輸入班級名稱。";
      err.classList.remove("hidden");
      return;
    }
    API.createClass(name, "fce").then(function (data) {
      $("in-class-name").value = "";
      loadClasses();
      openClass(data.klass.id);
    }, function (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
    });
  }

  /* ---------------- 老師：單一班級 ---------------- */
  var openId = null;

  function openClass(id) {
    openId = id;
    API.listClasses().then(function (data) {
      var c = data.classes.filter(function (x) { return x.id === id; })[0];
      if (!c) { loadClasses(); show("view-teacher-home"); return; }
      $("cls-name").textContent = c.name;
      $("cls-code").textContent = c.code;
      $("cls-locked").checked = !!c.locked;
      loadRoster();
      loadAssignments();
      show("view-class");
    });
  }

  function loadRoster() {
    var box = $("roster");
    box.innerHTML = '<p class="hint">載入中…</p>';
    API.listStudents(openId).then(function (data) {
      $("cls-count").textContent = "（" + data.students.length + " 人）";
      if (!data.students.length) {
        box.innerHTML = '<p class="hint">名冊還是空的。學生用班級代碼登入後就會自動出現，' +
          "你也可以先用下面的批次匯入建好。</p>";
        return;
      }
      box.innerHTML = "";
      data.students.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "roster-row";
        row.innerHTML = '<span class="seat">' + esc(s.seatNo) + "</span>" +
          "<span>" + esc(s.name) + "</span>" +
          '<span class="seen">' + esc(U.fmtSeen(s.lastSeen)) + "</span>";
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "rm";
        rm.textContent = "✕";
        rm.title = "從名冊移除";
        rm.addEventListener("click", function () {
          confirmMsg("把「" + s.seatNo + " " + s.name + "」從名冊移除？他的練習紀錄也會一起刪除。", function () {
            API.removeStudent(openId, s.id).then(loadRoster, function (e) { alertMsg(e.message); });
          });
        });
        row.appendChild(rm);
        box.appendChild(row);
      });
    }, function (e) {
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function bulkImport() {
    var err = $("roster-error");
    err.classList.add("hidden");
    var rows = U.parseBulk($("in-bulk").value);
    if (!rows.length) {
      err.textContent = "看不出任何一行「座號,姓名」。請確認每一行都有逗號分隔。";
      err.classList.remove("hidden");
      return;
    }
    API.addStudents(openId, rows).then(function (data) {
      $("in-bulk").value = "";
      alertMsg("已匯入 " + data.added + " 位學生。");
      loadRoster();
    }, function (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
    });
  }


  /* ================= 學生：作答 ================= */
  var take = { assignment: null, items: [], answers: [], timer: null, deadline: null };

  function renderTakeItem(item, i) {
    var card = document.createElement("div");
    card.className = "card";
    var head = "<p class=\"eyebrow\">Question " + (i + 1) + "</p>";

    if (item.passage) {
      head += '<details class="bulk"><summary>Read the passage</summary><p class="passage">' +
        esc(item.passage) + "</p></details>";
    }

    if (item.kind === "mc") {
      card.innerHTML = head + "<p>" + esc(item.q) + "</p>";
      item.options.forEach(function (opt, oi) {
        var lab = document.createElement("label");
        lab.className = "check opt";
        lab.innerHTML = '<input type="radio" name="q' + i + '" value="' + oi + '"> ' + esc(opt);
        lab.querySelector("input").addEventListener("change", function () { take.answers[i] = oi; });
        card.appendChild(lab);
      });
      return card;
    }

    if (item.kind === "gap") {
      card.innerHTML = head + '<p class="pre">' + esc(item.q) + "</p>";
      var inp = document.createElement("input");
      inp.type = "text";
      inp.maxLength = 200;
      inp.placeholder = "Your answer";
      inp.addEventListener("input", function () { take.answers[i] = inp.value; });
      card.appendChild(inp);
      return card;
    }

    /* writing */
    var limit = item.minWords || item.maxWords
      ? " (" + (item.minWords ? item.minWords + "–" : "up to ") + (item.maxWords || "") + " words)"
      : "";
    card.innerHTML = head + '<p class="pre">' + esc(item.prompt) + esc(limit) + "</p>";
    var ta = document.createElement("textarea");
    ta.rows = 10;
    var counter = document.createElement("p");
    counter.className = "hint";
    counter.textContent = "0 words";
    ta.addEventListener("input", function () {
      take.answers[i] = ta.value;
      var n = window.CamPick.countWords(ta.value);
      counter.textContent = n + " word" + (n === 1 ? "" : "s") +
        (item.minWords && n < item.minWords ? " — " + (item.minWords - n) + " to go" : "");
    });
    card.appendChild(ta);
    card.appendChild(counter);
    return card;
  }

  function stopTimer() {
    if (take.timer) { clearInterval(take.timer); take.timer = null; }
  }

  /* 倒數以「後端回傳的剩餘秒數」為準，不看裝置時鐘——學生把手機時間調掉也沒有用。 */
  function startTimer(remainingSec) {
    var el = $("take-timer");
    stopTimer();
    if (remainingSec == null) { el.classList.add("hidden"); return; }
    take.deadline = Date.now() + remainingSec * 1000;
    el.classList.remove("hidden");
    var tick = function () {
      var left = Math.max(0, Math.round((take.deadline - Date.now()) / 1000));
      var m = Math.floor(left / 60), sec = left % 60;
      el.textContent = m + ":" + (sec < 10 ? "0" : "") + sec;
      if (left <= 0) {
        stopTimer();
        alertMsg("Time is up — your answers are being submitted.");
        submitTake(true);
      }
    };
    tick();
    take.timer = setInterval(tick, 1000);
  }

  function startTake(meta) {
    $("take-error").classList.add("hidden");
    API.takeAssignment(meta.id).then(function (data) {
      take.assignment = data.assignment;
      take.items = data.items;
      take.answers = data.items.map(function () { return null; });
      $("take-title").textContent = data.assignment.title;
      $("take-meta").textContent = data.assignment.count + " question" +
        (data.assignment.count === 1 ? "" : "s") +
        (data.assignment.examMode ? " · exam mode: one attempt only" : "") +
        (data.assignment.timeLimitMin ? " · " + data.assignment.timeLimitMin + " min" : "");
      var box = $("take-items");
      box.innerHTML = "";
      data.items.forEach(function (item, i) { box.appendChild(renderTakeItem(item, i)); });
      startTimer(data.remainingSec);
      show("view-take");
    }, function (e) {
      alertMsg(e.message);
      loadStudentAssignments();
    });
  }

  function submitTake(auto) {
    var btn = $("do-submit");
    var err = $("take-error");
    err.classList.add("hidden");

    if (!auto) {
      var blank = take.answers.filter(function (a) { return a === null || a === ""; }).length;
      if (blank) {
        confirmMsg(blank + " question" + (blank === 1 ? " is" : "s are") + " still blank. Submit anyway?", function () {
          doSubmit();
        });
        return;
      }
    }
    doSubmit();

    function doSubmit() {
      btn.disabled = true;
      btn.textContent = "Submitting…";
      API.submitAssignment(take.assignment.id, take.answers).then(function (res) {
        stopTimer();
        btn.disabled = false;
        btn.textContent = "Submit";
        showResult(res);
      }, function (e) {
        btn.disabled = false;
        btn.textContent = "Submit";
        err.textContent = e.message;
        err.classList.remove("hidden");
      });
    }
  }

  function showResult(res) {
    $("res-title").textContent = take.assignment.title;
    $("res-score").textContent = res.total ? res.score + " / " + res.total : "—";
    $("res-note").textContent = res.needsReview
      ? "Your writing will be marked separately — the score above covers the auto-marked questions only."
      : "All questions were marked automatically.";

    var box = $("res-review");
    box.innerHTML = "";
    res.review.forEach(function (r, i) {
      var card = document.createElement("div");
      card.className = "card";
      var mark = r.correct === true ? "✅" : (r.correct === false ? "❌" : "📝");
      var given = r.kind === "mc"
        ? (take.items[i].options[r.given] != null ? take.items[i].options[r.given] : "(blank)")
        : (r.given || "(blank)");
      var right = "";
      if (r.correct === false) {
        right = r.kind === "mc"
          ? "<p>Correct answer: <strong>" + esc(take.items[i].options[r.answer]) + "</strong></p>"
          : "<p>Correct answer: <strong>" + esc((r.answer || []).join(" / ")) + "</strong></p>";
      }
      card.innerHTML = '<p class="eyebrow">' + mark + " Question " + (i + 1) + "</p>" +
        '<p class="pre">' + esc(take.items[i].q || take.items[i].prompt) + "</p>" +
        "<p>Your answer: " + esc(given) + "</p>" + right +
        (r.explanation ? '<p class="hint">' + esc(r.explanation) + "</p>" : "");
      box.appendChild(card);
    });
    show("view-result");
    loadStudentAssignments();
  }

  /* ================= 老師：作業 ================= */
  var draft = { items: [] };

  function loadAssignments() {
    var box = $("assign-list");
    box.innerHTML = '<p class="hint">載入中…</p>';
    API.listAssignments(openId).then(function (data) {
      if (!data.assignments.length) {
        box.innerHTML = '<p class="hint">還沒有作業。</p>';
        return;
      }
      box.innerHTML = "";
      data.assignments.forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "class-row";
        b.innerHTML = "<span>" + esc(a.title) + "</span>" +
          '<span class="count">' + a.submitted + " / " + a.students + " 已交</span>";
        b.addEventListener("click", function () { openAssignment(a.id); });
        box.appendChild(b);
      });
    }, function (e) {
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function itemSummary(item) {
    if (item.kind === "mc") return "四選一 · " + item.q;
    if (item.kind === "gap") return "填空 · " + item.q.replace(/\n/g, " ");
    return "寫作 · " + item.prompt;
  }

  function paintDraft() {
    var box = $("assign-items");
    $("assign-count").textContent = "（" + draft.items.length + " 題）";
    if (!draft.items.length) {
      box.innerHTML = '<p class="hint">還沒有題目。從上面的題庫挑題，或自己出題。</p>';
      return;
    }
    box.innerHTML = "";
    draft.items.forEach(function (item, i) {
      var row = document.createElement("div");
      row.className = "roster-row";
      row.innerHTML = '<span class="seat">' + (i + 1) + "</span><span>" +
        esc(itemSummary(item).slice(0, 70)) + "</span>";
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "rm";
      rm.textContent = "✕";
      rm.title = "移除這一題";
      rm.addEventListener("click", function () { draft.items.splice(i, 1); paintDraft(); });
      row.appendChild(rm);
      box.appendChild(row);
    });
  }

  /* 題庫近 1 MB，只有老師要挑題時才載，學生端完全不會載到。 */
  var bankLoading = null;
  function ensureBank() {
    if (window.FCE_BANK) return Promise.resolve(window.FCE_BANK);
    if (bankLoading) return bankLoading;
    bankLoading = new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = "js/data/fce-bank.js?v=" + STAMP;
      el.onload = function () { resolve(window.FCE_BANK); };
      el.onerror = function () { reject(new Error("題庫載入失敗，請檢查網路後重試。")); };
      document.body.appendChild(el);
    });
    return bankLoading;
  }

  function bankPick() {
    var note = $("bank-note");
    var source = $("in-bank-source").value;
    var n = Math.max(1, Math.min(30, Number($("in-bank-count").value) || 5));
    note.textContent = "載入題庫中…";
    ensureBank().then(function (bank) {
      var picked = window.CamPick.pick(bank, source, n);
      if (!picked.length) {
        note.textContent = "這個來源目前沒有可用的題目。";
        return;
      }
      draft.items = draft.items.concat(picked);
      paintDraft();
      note.textContent = "已加入 " + picked.length + " 題。";
    }, function (e) {
      note.textContent = e.message;
    });
  }

  function addCustomQuestion() {
    var kind = $("in-q-kind").value;
    var err = $("assign-error");
    err.classList.add("hidden");
    var form = { kind: kind, explanation: $("in-q-exp").value };
    if (kind === "mc") {
      form.q = $("in-q-text").value;
      form.options = $("in-q-options").value.split(/\r?\n/);
      form.answer = Number($("in-q-answer").value) - 1;      /* 老師輸入的是第幾個，程式要的是索引 */
    } else if (kind === "gap") {
      form.q = $("in-q-gaptext").value;
      form.answers = $("in-q-answers").value;
    } else {
      form.prompt = $("in-q-prompt").value;
      form.minWords = $("in-q-min").value;
      form.maxWords = $("in-q-max").value;
    }
    var item = window.CamPick.buildCustom(form);
    if (!item) {
      err.textContent = "這一題還不完整：選擇題要有題目、至少兩個選項與正確的正解編號；填空要有題目與答案；寫作要有題目。";
      err.classList.remove("hidden");
      return;
    }
    draft.items.push(item);
    paintDraft();
    ["in-q-text", "in-q-options", "in-q-gaptext", "in-q-answers", "in-q-prompt", "in-q-exp"]
      .forEach(function (id) { $(id).value = ""; });
    $("in-q-answer").value = 1;
  }

  function saveAssignment() {
    var err = $("assign-error");
    err.classList.add("hidden");
    var title = $("in-assign-title").value.trim();
    if (!title) {
      err.textContent = "請先填作業名稱。";
      err.classList.remove("hidden");
      return;
    }
    if (!draft.items.length) {
      err.textContent = "至少要有一題。";
      err.classList.remove("hidden");
      return;
    }
    var dueRaw = $("in-assign-due").value;
    var body = {
      title: title,
      items: draft.items,
      dueAt: dueRaw ? new Date(dueRaw).getTime() : null,
      timeLimitMin: Number($("in-assign-limit").value) || null,
      examMode: $("in-assign-exam").checked
    };
    API.createAssignment(openId, body).then(function () {
      draft.items = [];
      ["in-assign-title", "in-assign-due", "in-assign-limit"].forEach(function (id) { $(id).value = ""; });
      $("in-assign-exam").checked = false;
      paintDraft();
      loadAssignments();
      show("view-class");
    }, function (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
    });
  }

  var openAssignId = null;

  function openAssignment(aid) {
    openAssignId = aid;
    API.getAssignment(aid).then(function (data) {
      var a = data.assignment;
      $("ad-title").textContent = a.title;
      $("ad-meta").textContent = a.count + " 題" +
        (a.examMode ? " · 考試模式（只能作答一次）" : "") +
        (a.timeLimitMin ? " · 限時 " + a.timeLimitMin + " 分鐘" : "") +
        (a.dueAt ? " · 截止 " + U.fmtSeen(a.dueAt) : "");
      var box = $("ad-students");
      box.innerHTML = "";
      if (!data.students.length) {
        box.innerHTML = '<p class="hint">名冊還是空的。</p>';
      }
      data.students.forEach(function (st) {
        var row = document.createElement("div");
        row.className = "roster-row";
        var mark = st.status === "submitted" ? "✅" : (st.status === "in-progress" ? "✏️" : "—");
        var right = st.status === "submitted"
          ? (st.total ? st.score + " / " + st.total : "已交")
          : (st.status === "in-progress" ? "作答中" : "未開始");
        row.innerHTML = '<span class="seat">' + esc(st.seatNo) + "</span><span>" + esc(st.name) +
          "</span><span class=\"seen\">" + mark + " " + esc(right) + "</span>";
        box.appendChild(row);
      });
      show("view-assign-detail");
    }, function (e) { alertMsg(e.message); });
  }


  /* ================= 老師：班級儀表板 ================= */
  var dash = null;

  function bar(pct) {
    var v = pct == null ? 0 : pct;
    return '<span class="bar"><span class="bar-fill" style="width:' + v + '%"></span></span>';
  }

  function loadDashboard() {
    $("db-meta").textContent = "載入中…";
    API.dashboard(openId).then(function (data) {
      dash = data;
      var done = data.assignments.reduce(function (n, a) { return n + a.submitted; }, 0);
      var expected = data.assignments.length * data.students.length;
      $("db-meta").textContent = data.students.length + " 位學生 · " + data.assignments.length +
        " 份作業 · 已交 " + done + " / " + expected + " 份";

      /* 全班 */
      var box = $("db-students");
      box.innerHTML = "";
      if (!data.students.length) box.innerHTML = '<p class="hint">名冊還是空的。</p>';
      data.students.forEach(function (st) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "roster-row as-btn";
        row.innerHTML = '<span class="seat">' + esc(st.seatNo) + "</span>" +
          "<span>" + esc(st.name) + "</span>" +
          '<span class="seen">' + st.submitted + " / " + st.assigned + " 份 · " +
          esc(U.pctLabel(st.avgPct)) + "</span>";
        row.addEventListener("click", function () { openStudentWork(st); });
        box.appendChild(row);
      });

      /* 各份作業 */
      var ab = $("db-assignments");
      ab.innerHTML = "";
      if (!data.assignments.length) ab.innerHTML = '<p class="hint">還沒有作業。</p>';
      data.assignments.forEach(function (a) {
        var row = document.createElement("div");
        row.className = "roster-row";
        row.innerHTML = "<span>" + esc(a.title) + "</span>" +
          '<span class="seen">' + a.submitted + " / " + a.students + " 已交 · 平均 " +
          esc(U.pctLabel(a.avgPct)) + "</span>";
        ab.appendChild(row);
      });

      /* 各題型 */
      var kb = $("db-kinds");
      var KIND_LABEL = { mc: "四選一", gap: "填空", writing: "寫作" };
      var kinds = Object.keys(data.byKind);
      kb.innerHTML = kinds.length ? "" : '<p class="hint">還沒有可統計的作答。</p>';
      kinds.forEach(function (k) {
        var v = data.byKind[k];
        var pct = v.total ? Math.round((v.correct / v.total) * 100) : null;
        var row = document.createElement("div");
        row.className = "kind-row";
        row.innerHTML = "<span>" + esc(KIND_LABEL[k] || k) + "</span>" + bar(pct) +
          '<span class="seen">' + esc(U.pctLabel(pct)) + "（" + v.correct + " / " + v.total + "）</span>";
        kb.appendChild(row);
      });

      /* 最容易錯的題目 */
      var hb = $("db-hardest");
      hb.innerHTML = "";
      if (!data.hardest.length) hb.innerHTML = '<p class="hint">還沒有可統計的作答。</p>';
      data.hardest.forEach(function (h) {
        var row = document.createElement("div");
        row.className = "roster-row";
        row.innerHTML = '<span class="seat">' + h.correctPct + "%</span>" +
          "<span>" + esc(h.title) + " 第 " + h.index + " 題 — " + esc(h.q.slice(0, 60)) + "</span>" +
          '<span class="seen">' + h.attempts + " 人作答</span>";
        hb.appendChild(row);
      });

      show("view-dashboard");
    }, function (e) {
      $("db-meta").textContent = e.message;
    });
  }

  /* 匯出：一列一位學生，欄位是每份作業的得分，最後一欄是平均。 */
  function exportCSV() {
    if (!dash) return;
    var header = ["座號", "姓名"].concat(dash.assignments.map(function (a) { return a.title; }))
      .concat(["已交份數", "平均正確率"]);
    var rows = [header];

    /* 每位學生每份作業的分數要另外查——儀表板只給總計，這裡直接用作業詳情補齊 */
    Promise.all(dash.assignments.map(function (a) { return API.getAssignment(a.id); }))
      .then(function (details) {
        dash.students.forEach(function (st) {
          var line = [st.seatNo, st.name];
          details.forEach(function (d) {
            var row = d.students.filter(function (x) { return x.id === st.id; })[0];
            line.push(row && row.status === "submitted"
              ? (row.total ? row.score + "/" + row.total : "已交")
              : (row && row.status === "in-progress" ? "作答中" : ""));
          });
          line.push(st.submitted + "/" + st.assigned);
          line.push(st.avgPct == null ? "" : st.avgPct + "%");
          rows.push(line);
        });

        var blob = new Blob([U.toCSV(rows)], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (dash.klass.name || "class") + "-成績.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }, function (e) { alertMsg(e.message); });
  }

  function openStudentWork(st) {
    $("sw-name").textContent = st.seatNo + " " + st.name;
    var box = $("sw-body");
    box.innerHTML = '<div class="card"><p class="hint">載入中…</p></div>';
    API.studentWork(openId, st.id).then(function (data) {
      box.innerHTML = "";
      if (!data.work.length) {
        box.innerHTML = '<div class="card"><p class="hint">這位學生還沒有交過任何作業。</p></div>';
        return;
      }
      data.work.forEach(function (w) {
        var card = document.createElement("div");
        card.className = "card";
        var head = '<p class="eyebrow">' + esc(w.title) + "</p><h3>" +
          (w.total ? w.score + " / " + w.total : "已交") + "</h3>";
        var body = w.items.map(function (it, i) {
          var mark = it.correct === true ? "✅" : (it.correct === false ? "❌" : "📝");
          var right = it.correct === false && it.answer
            ? "　正解：" + esc(Array.isArray(it.answer) ? it.answer.join(" / ") : it.answer)
            : "";
          return '<div class="roster-row"><span class="seat">' + mark + "</span><span>" +
            "第 " + (i + 1) + " 題　作答：" + esc(it.given == null || it.given === "" ? "（空白）" : String(it.given).slice(0, 120)) +
            right + "</span></div>";
        }).join("");
        card.innerHTML = head + '<div class="roster">' + body + "</div>";
        box.appendChild(card);
      });
      show("view-student-work");
    }, function (e) { alertMsg(e.message); });
  }

  /* ---------------- 版本紀錄 ---------------- */
  function paintVersions() {
    var box = $("versions");
    box.innerHTML = (window.APP_VERSIONS || []).map(function (v) {
      return '<div class="ver"><h4>' + esc(v.v) + " · " + esc(v.date) + "</h4><ul>" +
        v.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") +
        "</ul></div>";
    }).join("");
  }

  /* ---------------- 啟動 ---------------- */
  function goto(target) {
    if (target === "role") { show("view-role"); return; }
    if (target === "student") {
      stopTimer();
      if (API.isStudent()) { paintStudentHome(); show("view-student-home"); }
      else show("view-student-login");
      return;
    }
    if (target === "teacher") {
      if (API.isTeacher()) { loadClasses(); show("view-teacher-home"); }
      else { show("view-teacher-login"); loadGSI(); }
      return;
    }
    if (target === "teacher-home") { loadClasses(); show("view-teacher-home"); return; }
    if (target === "class") { stopTimer(); if (openId) openClass(openId); else goto("teacher-home"); return; }
    if (target === "dashboard") { loadDashboard(); return; }
    if (target === "back") { show(beforeVersions); return; }
  }

  function logout() {
    confirmMsg("要登出嗎？", function () {
      API.studentLogout();
      API.teacherLogout();
      show("view-role");
    });
  }

  function init() {
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { goto(b.dataset.go); });
    });
    $("do-login").addEventListener("click", studentLogin);
    $("in-seat").addEventListener("keydown", function (e) { if (e.key === "Enter") studentLogin(); });
    $("do-create-class").addEventListener("click", createClass);
    $("in-class-name").addEventListener("keydown", function (e) { if (e.key === "Enter") createClass(); });
    $("do-bulk").addEventListener("click", bulkImport);
    $("logout").addEventListener("click", logout);
    $("brand").addEventListener("click", function () { goto(API.isStudent() ? "student" : (API.isTeacher() ? "teacher" : "role")); });
    $("show-versions").addEventListener("click", function () { paintVersions(); show("view-versions"); });

    /* 題庫來源下拉：內容由 pick.js 定義，兩邊才不會走鐘 */
    var srcSel = $("in-bank-source");
    window.CamPick.SOURCES.forEach(function (s2) {
      var o = document.createElement("option");
      o.value = s2.key;
      o.textContent = s2.label;
      srcSel.appendChild(o);
    });

    $("do-new-assign").addEventListener("click", function () {
      draft.items = [];
      paintDraft();
      show("view-assign-build");
    });
    $("do-bank-pick").addEventListener("click", bankPick);
    $("do-add-q").addEventListener("click", addCustomQuestion);
    $("do-save-assign").addEventListener("click", saveAssignment);
    $("in-q-kind").addEventListener("change", function () {
      var k = $("in-q-kind").value;
      ["mc", "gap", "writing"].forEach(function (x) {
        $("q-form-" + x).classList.toggle("hidden", x !== k);
      });
    });
    $("do-delete-assign").addEventListener("click", function () {
      confirmMsg("確定要刪除這份作業嗎？學生的作答紀錄也會一起刪除。", function () {
        API.deleteAssignment(openAssignId).then(function () {
          loadAssignments();
          show("view-class");
        }, function (e) { alertMsg(e.message); });
      });
    });
    $("do-submit").addEventListener("click", function () { submitTake(false); });
    $("do-dashboard").addEventListener("click", loadDashboard);
    $("do-csv").addEventListener("click", exportCSV);

    $("cls-locked").addEventListener("change", function () {
      API.updateClass(openId, { locked: $("cls-locked").checked }).then(null, function (e) {
        alertMsg(e.message);
        $("cls-locked").checked = !$("cls-locked").checked;
      });
    });
    $("do-delete-class").addEventListener("click", function () {
      confirmMsg("確定要刪除這個班級嗎？名冊與所有學生的練習紀錄都會一起刪除，無法復原。", function () {
        API.deleteClass(openId).then(function () {
          loadClasses();
          show("view-teacher-home");
        }, function (e) { alertMsg(e.message); });
      });
    });

    /* 已登入過就直接進去；token 過期或班級被刪除時退回身分選擇。 */
    if (API.isStudent()) {
      paintStudentHome();
      show("view-student-home");
      API.me().then(paintStudentHome, function (e) {
        if (e.status === 401 || e.status === 404) {
          API.studentLogout();
          show("view-role");
          alertMsg("Your sign-in is no longer valid. Please sign in again with your class code.");
        }
      });
    } else if (API.isTeacher()) {
      loadClasses();
      show("view-teacher-home");
    } else {
      show("view-role");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
