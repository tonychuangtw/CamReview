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
      who.textContent = "Teacher";
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
    note.textContent = "Loading Google sign-in…";
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = function () {
      try {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
        google.accounts.id.renderButton($("gsi-slot"), { theme: "filled_black", size: "large", width: 260 });
        note.textContent = "";
      } catch (e) {
        note.textContent = "Google sign-in failed to start: " + e.message;
      }
    };
    s.onerror = function () {
      gsiLoaded = false;
      note.textContent = "Could not reach Google sign-in — usually a network problem or an ad blocker. Refresh and try again.";
    };
    document.head.appendChild(s);
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) return;
    $("gsi-note").textContent = "Signing in…";
    API.exchangeGoogleToken(resp.credential).then(function () {
      $("gsi-note").textContent = "";
      enterTeacher();
    }, function (e) {
      $("gsi-note").textContent = "Sign-in failed: " + e.message;
    });
  }

  /* Google 登入只證明身分，還要通過一次老師識別碼才進得了老師端。
   * 沒有這一層，學生用自己的 Google 帳號就能建班、出作業給自己先刷題
   * （Tony 2026-08-26 回報）。真正的關卡在後端，這裡只負責畫面。 */
  function showCodeBox(email) {
    show("view-teacher-login");
    $("gsi-note").textContent = "";
    $("tc-email").textContent = email || "";
    $("tc-error").classList.add("hidden");
    $("teacher-code-box").classList.remove("hidden");
    $("in-teacher-code").value = "";
    $("in-teacher-code").focus();
  }

  function hideCodeBox() {
    $("teacher-code-box").classList.add("hidden");
  }

  /* 老師端的唯一入口：先問後端這個帳號過了沒。 */
  function enterTeacher() {
    if (!API.isTeacher()) { hideCodeBox(); show("view-teacher-login"); loadGSI(); return; }
    API.teacherMe().then(function (data) {
      if (data.approved) {
        hideCodeBox();
        loadClasses();
        show("view-teacher-home");
      } else {
        showCodeBox(data.email);
      }
    }, function (e) {
      if (e.status === 401) { API.teacherLogout(); hideCodeBox(); show("view-teacher-login"); loadGSI(); return; }
      $("gsi-note").textContent = e.message;
      show("view-teacher-login");
    });
  }

  function submitTeacherCode() {
    var code = $("in-teacher-code").value.trim();
    var err = $("tc-error");
    err.classList.add("hidden");
    if (!code) { err.textContent = "Enter the teacher code."; err.classList.remove("hidden"); return; }
    var btn = $("do-teacher-code");
    btn.disabled = true;
    API.activateTeacher(code).then(function () {
      btn.disabled = false;
      hideCodeBox();
      loadClasses();
      show("view-teacher-home");
    }, function (e) {
      btn.disabled = false;
      err.textContent = e.message;
      err.classList.remove("hidden");
    });
  }

  /* ---------------- 老師：班級 ---------------- */
  function loadClasses() {
    var box = $("class-list");
    box.innerHTML = '<p class="hint">Loading…</p>';
    API.listClasses().then(function (data) {
      if (!data.classes.length) {
        box.innerHTML = '<p class="hint">No classes yet. Type a name below to create your first one.</p>';
        return;
      }
      box.innerHTML = "";
      data.classes.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "class-row";
        b.innerHTML = '<span class="code">' + esc(c.code) + "</span>" +
          "<span>" + esc(c.name) + "</span>" +
          '<span class="count">' + c.students + (c.students === 1 ? " student" : " students") + "</span>";
        b.addEventListener("click", function () { openClass(c.id); });
        box.appendChild(b);
      });
    }, function (e) {
      if (e.status === 401) { API.teacherLogout(); hideCodeBox(); show("view-teacher-login"); loadGSI(); return; }
      if (e.status === 403) { enterTeacher(); return; }
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function createClass() {
    var name = $("in-class-name").value.trim();
    var err = $("class-error");
    err.classList.add("hidden");
    if (!name) {
      err.textContent = "Please enter a class name first.";
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
    box.innerHTML = '<p class="hint">Loading…</p>';
    API.listStudents(openId).then(function (data) {
      $("cls-count").textContent = "(" + data.students.length + (data.students.length === 1 ? " student" : " students") + ")";
      if (!data.students.length) {
        box.innerHTML = '<p class="hint">The roster is empty. Students appear here as soon as they sign in ' +
          "with the class code, or you can bulk-import the list below.</p>";
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
        rm.title = "Remove from roster";
        rm.addEventListener("click", function () {
          confirmMsg("Remove " + s.seatNo + " " + s.name + " from the roster? Their work is deleted too.", function () {
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
      err.textContent = "No lines in the format \"seat number, name\" were found. Check that every line has a comma.";
      err.classList.remove("hidden");
      return;
    }
    API.addStudents(openId, rows).then(function (data) {
      $("in-bulk").value = "";
      alertMsg("Imported " + data.added + (data.added === 1 ? " student." : " students."));
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
      if (r.kind === "writing") card.appendChild(writingBlock(i));
      box.appendChild(card);
    });
    show("view-result");
    loadStudentAssignments();
  }


  /* ---------------- 寫作批改（學生端） ---------------- */
  function renderFeedback(fb) {
    var wrap = document.createElement("div");
    if (!fb) return wrap;
    if (fb.error) {
      wrap.innerHTML = '<p class="error-text">' + esc(fb.error) + "</p>";
      return wrap;
    }
    var t = fb.teacher;
    var ai = fb.ai;
    var html = "";
    if (t) {
      html += '<div class="fb-teacher"><p class="eyebrow">Your teacher</p>' +
        (t.score != null ? "<p><strong>" + t.score + "</strong></p>" : "") +
        (t.comment ? '<p class="pre">' + esc(t.comment) + "</p>" : "") + "</div>";
    }
    if (ai) {
      html += '<p class="eyebrow">Examiner feedback</p>';
      if (Array.isArray(ai.scores)) {
        html += '<div class="roster">' + ai.scores.map(function (sc) {
          return '<div class="roster-row"><span class="seat">' + esc(sc.score) + "/" + esc(sc.max) +
            "</span><span>" + esc(sc.criterion) + " — " + esc(sc.comment || "") + "</span></div>";
        }).join("") + "</div>";
      }
      if (ai.overall) html += '<p class="hint">' + esc(ai.overall) + "</p>";
      if (Array.isArray(ai.improvements) && ai.improvements.length) {
        html += "<p><strong>How to improve</strong></p><ul class=\"steps\">" +
          ai.improvements.map(function (im) {
            return "<li>" + esc(im.issue) + " → " + esc(im.fix) +
              (im.example ? '<br><span class="hint">' + esc(im.example) + "</span>" : "") + "</li>";
          }).join("") + "</ul>";
      }
      if (Array.isArray(ai.corrections) && ai.corrections.length) {
        html += "<p><strong>Language corrections</strong></p><ul class=\"steps\">" +
          ai.corrections.map(function (c) {
            return "<li><s>" + esc(c.original) + "</s> → <strong>" + esc(c.corrected) + "</strong>" +
              (c.reason ? '<br><span class="hint">' + esc(c.reason) + "</span>" : "") + "</li>";
          }).join("") + "</ul>";
      }
    }
    wrap.innerHTML = html;
    return wrap;
  }

  function writingBlock(i) {
    var wrap = document.createElement("div");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary-btn small";
    btn.textContent = "Get examiner feedback";
    var out = document.createElement("div");

    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Marking… (this takes up to a minute)";
      API.gradeWriting(take.assignment.id).then(function (data) {
        btn.remove();
        out.appendChild(renderFeedback(data.feedback[i]));
      }, function (e) {
        btn.disabled = false;
        btn.textContent = "Get examiner feedback";
        out.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
      });
    });

    /* 已經批改過就直接顯示，不再花一次錢 */
    API.writingFeedback(take.assignment.id).then(function (data) {
      if (data.feedback && data.feedback[i]) {
        btn.remove();
        out.appendChild(renderFeedback(data.feedback[i]));
      }
    }, function () {});

    wrap.appendChild(btn);
    wrap.appendChild(out);
    return wrap;
  }

  /* ================= 老師：作業 ================= */
  var draft = { items: [] };

  function loadAssignments() {
    var box = $("assign-list");
    box.innerHTML = '<p class="hint">Loading…</p>';
    API.listAssignments(openId).then(function (data) {
      if (!data.assignments.length) {
        box.innerHTML = '<p class="hint">No assignments yet.</p>';
        return;
      }
      box.innerHTML = "";
      data.assignments.forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "class-row";
        b.innerHTML = "<span>" + esc(a.title) + "</span>" +
          '<span class="count">' + a.submitted + " / " + a.students + " submitted</span>";
        b.addEventListener("click", function () { openAssignment(a.id); });
        box.appendChild(b);
      });
    }, function (e) {
      box.innerHTML = '<p class="error-text">' + esc(e.message) + "</p>";
    });
  }

  function itemSummary(item) {
    if (item.kind === "mc") return "Multiple choice · " + item.q;
    if (item.kind === "gap") return "Gap fill · " + item.q.replace(/\n/g, " ");
    return "Writing · " + item.prompt;
  }

  function paintDraft() {
    var box = $("assign-items");
    $("assign-count").textContent = "(" + draft.items.length + ")";
    if (!draft.items.length) {
      box.innerHTML = '<p class="hint">No questions yet. Pick some from the bank above, or write your own.</p>';
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
      rm.title = "Remove this question";
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
      el.onerror = function () { reject(new Error("The question bank failed to load. Check your connection and try again.")); };
      document.body.appendChild(el);
    });
    return bankLoading;
  }

  function bankPick() {
    var note = $("bank-note");
    var source = $("in-bank-source").value;
    var n = Math.max(1, Math.min(30, Number($("in-bank-count").value) || 5));
    note.textContent = "Loading the question bank…";
    ensureBank().then(function (bank) {
      var picked = window.CamPick.pick(bank, source, n);
      if (!picked.length) {
        note.textContent = "There are no questions available from this source.";
        return;
      }
      draft.items = draft.items.concat(picked);
      paintDraft();
      note.textContent = "Added " + picked.length + (picked.length === 1 ? " question." : " questions.");
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
      err.textContent = "This question is incomplete. Multiple choice needs a question, at least two options and a valid answer number; gap fill needs a question and an answer; a writing task needs a prompt.";
      err.classList.remove("hidden");
      return;
    }
    draft.items.push(item);
    paintDraft();
    ["in-q-text", "in-q-options", "in-q-gaptext", "in-q-answers", "in-q-prompt", "in-q-exp",
      "in-q-min", "in-q-max"].forEach(function (id) { $(id).value = ""; });
    $("in-q-answer").value = 1;
  }

  function saveAssignment() {
    var err = $("assign-error");
    err.classList.add("hidden");
    var title = $("in-assign-title").value.trim();
    if (!title) {
      err.textContent = "Please give the assignment a title.";
      err.classList.remove("hidden");
      return;
    }
    if (!draft.items.length) {
      err.textContent = "Add at least one question.";
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
      $("ad-meta").textContent = a.count + (a.count === 1 ? " question" : " questions") +
        (a.examMode ? " · Exam mode (one attempt)" : "") +
        (a.timeLimitMin ? " · " + a.timeLimitMin + " min limit" : "") +
        (a.dueAt ? " · Due " + U.fmtSeen(a.dueAt) : "");
      var box = $("ad-students");
      box.innerHTML = "";
      if (!data.students.length) {
        box.innerHTML = '<p class="hint">The roster is empty.</p>';
      }
      data.students.forEach(function (st) {
        var row = document.createElement("div");
        row.className = "roster-row";
        var mark = st.status === "submitted" ? "✅" : (st.status === "in-progress" ? "✏️" : "—");
        var right = st.status === "submitted"
          ? (st.total ? st.score + " / " + st.total : "Submitted")
          : (st.status === "in-progress" ? "In progress" : "Not started");
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
    $("db-meta").textContent = "Loading…";
    API.dashboard(openId).then(function (data) {
      dash = data;
      var done = data.assignments.reduce(function (n, a) { return n + a.submitted; }, 0);
      var expected = data.assignments.length * data.students.length;
      $("db-meta").textContent = data.students.length + " students · " + data.assignments.length +
        " assignments · " + done + " / " + expected + " submitted";

      /* 全班 */
      var box = $("db-students");
      box.innerHTML = "";
      if (!data.students.length) box.innerHTML = '<p class="hint">The roster is empty.</p>';
      data.students.forEach(function (st) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "roster-row as-btn";
        row.innerHTML = '<span class="seat">' + esc(st.seatNo) + "</span>" +
          "<span>" + esc(st.name) + "</span>" +
          '<span class="seen">' + st.submitted + " / " + st.assigned + " done · " +
          esc(U.pctLabel(st.avgPct)) + "</span>";
        row.addEventListener("click", function () { openStudentWork(st); });
        box.appendChild(row);
      });

      /* 各份作業 */
      var ab = $("db-assignments");
      ab.innerHTML = "";
      if (!data.assignments.length) ab.innerHTML = '<p class="hint">No assignments yet.</p>';
      data.assignments.forEach(function (a) {
        var row = document.createElement("div");
        row.className = "roster-row";
        row.innerHTML = "<span>" + esc(a.title) + "</span>" +
          '<span class="seen">' + a.submitted + " / " + a.students + " submitted · avg " +
          esc(U.pctLabel(a.avgPct)) + "</span>";
        ab.appendChild(row);
      });

      /* 各題型 */
      var kb = $("db-kinds");
      var KIND_LABEL = { mc: "Multiple choice", gap: "Gap fill", writing: "Writing" };
      var kinds = Object.keys(data.byKind);
      kb.innerHTML = kinds.length ? "" : '<p class="hint">No marked answers yet.</p>';
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
      if (!data.hardest.length) hb.innerHTML = '<p class="hint">No marked answers yet.</p>';
      data.hardest.forEach(function (h) {
        var row = document.createElement("div");
        row.className = "roster-row";
        row.innerHTML = '<span class="seat">' + h.correctPct + "%</span>" +
          "<span>" + esc(h.title) + " · Q" + h.index + " — " + esc(h.q.slice(0, 60)) + "</span>" +
          '<span class="seen">' + h.attempts + " attempts</span>";
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
    var header = ["Seat", "Name"].concat(dash.assignments.map(function (a) { return a.title; }))
      .concat(["Submitted", "Average"]);
    var rows = [header];

    /* 每位學生每份作業的分數要另外查——儀表板只給總計，這裡直接用作業詳情補齊 */
    Promise.all(dash.assignments.map(function (a) { return API.getAssignment(a.id); }))
      .then(function (details) {
        dash.students.forEach(function (st) {
          var line = [st.seatNo, st.name];
          details.forEach(function (d) {
            var row = d.students.filter(function (x) { return x.id === st.id; })[0];
            line.push(row && row.status === "submitted"
              ? (row.total ? row.score + "/" + row.total : "Submitted")
              : (row && row.status === "in-progress" ? "In progress" : ""));
          });
          line.push(st.submitted + "/" + st.assigned);
          line.push(st.avgPct == null ? "" : st.avgPct + "%");
          rows.push(line);
        });

        var blob = new Blob([U.toCSV(rows)], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (dash.klass.name || "class") + "-scores.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }, function (e) { alertMsg(e.message); });
  }

  function openStudentWork(st) {
    $("sw-name").textContent = st.seatNo + " " + st.name;
    var box = $("sw-body");
    box.innerHTML = '<div class="card"><p class="hint">Loading…</p></div>';
    API.studentWork(openId, st.id).then(function (data) {
      box.innerHTML = "";
      if (!data.work.length) {
        box.innerHTML = '<div class="card"><p class="hint">This student has not submitted anything yet.</p></div>';
        return;
      }
      data.work.forEach(function (w) {
        var card = document.createElement("div");
        card.className = "card";
        var head = '<p class="eyebrow">' + esc(w.title) + "</p><h3>" +
          (w.total ? w.score + " / " + w.total : "Submitted") + "</h3>";
        var body = w.items.map(function (it, i) {
          var mark = it.correct === true ? "✅" : (it.correct === false ? "❌" : "📝");
          var right = it.correct === false && it.answer
            ? "  Answer: " + esc(Array.isArray(it.answer) ? it.answer.join(" / ") : it.answer)
            : "";
          return '<div class="roster-row"><span class="seat">' + mark + "</span><span>" +
            "Q" + (i + 1) + "  Answered: " + esc(it.given == null || it.given === "" ? "(blank)" : String(it.given).slice(0, 120)) +
            right + "</span></div>";
        }).join("");
        card.innerHTML = head + '<div class="roster">' + body + "</div>";

        /* 寫作題：秀出全文與 AI 批改，並讓老師直接打分數 */
        w.items.forEach(function (it, i) {
          if (it.kind !== "writing") return;
          card.appendChild(writingMarkBlock(w, i, it));
        });
        box.appendChild(card);
      });
      show("view-student-work");
    }, function (e) { alertMsg(e.message); });
  }


  /* 老師替單一寫作題打分數與寫評語 */
  function writingMarkBlock(work, i, item) {
    var wrap = document.createElement("div");
    wrap.className = "writing-mark";
    var fb = (work.feedback || {})[i] || {};
    var t = fb.teacher || {};

    wrap.innerHTML = '<p class="eyebrow">Q' + (i + 1) + " · Writing</p>" +
      '<details class="bulk"><summary>Read what the student wrote</summary><p class="pre">' +
      esc(item.given == null || item.given === "" ? "(blank)" : item.given) + "</p></details>" +
      (fb.ai && fb.ai.overall ? '<p class="hint">AI examiner: ' + esc(fb.ai.overall) + "</p>" : "");

    var row = document.createElement("div");
    row.className = "row-form";
    var score = document.createElement("input");
    score.type = "number";
    score.min = 0;
    score.max = 100;
    score.placeholder = "Score";
    score.style.maxWidth = "6em";
    if (t.score != null) score.value = t.score;
    var comment = document.createElement("input");
    comment.type = "text";
    comment.maxLength = 500;
    comment.placeholder = "Comment (optional)";
    if (t.comment) comment.value = t.comment;
    var save = document.createElement("button");
    save.type = "button";
    save.className = "primary-btn small";
    save.textContent = "Save";
    save.addEventListener("click", function () {
      save.disabled = true;
      save.textContent = "Saving…";
      API.markWriting(openId, work.submissionId, i,
        score.value === "" ? null : Number(score.value), comment.value).then(function () {
        save.disabled = false;
        save.textContent = "Saved ✓";
        setTimeout(function () { save.textContent = "Save"; }, 1500);
      }, function (e) {
        save.disabled = false;
        save.textContent = "Save";
        alertMsg(e.message);
      });
    });
    row.appendChild(score);
    row.appendChild(comment);
    row.appendChild(save);
    wrap.appendChild(row);
    return wrap;
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
      if (API.isTeacher()) { enterTeacher(); }
      else { hideCodeBox(); show("view-teacher-login"); loadGSI(); }
      return;
    }
    if (target === "teacher-home") { loadClasses(); show("view-teacher-home"); return; }
    if (target === "class") { stopTimer(); if (openId) openClass(openId); else goto("teacher-home"); return; }
    if (target === "dashboard") { loadDashboard(); return; }
    if (target === "back") { show(beforeVersions); return; }
  }

  /* ---------------- 色系主題與字級（Tony 2026-08-26 要求，比照 LanExamMock） ---------------- */
  var K_THEME = "cam_theme", K_FS = "cam_fontsize";
  var THEMES = [
    { id: "ink",     name: "Ink Black",    bg: "#0d0d10", accent: "#e0a458" },
    { id: "navy",    name: "Deep Navy",    bg: "#0a1220", accent: "#d6b25e" },
    { id: "forest",  name: "Forest Green", bg: "#0c1410", accent: "#d8c69a" },
    { id: "paper",   name: "Warm Paper",   bg: "#f4efe4", accent: "#8a5a26" },
    { id: "plum",    name: "Rose Plum",    bg: "#16101a", accent: "#e08ba1" },
    { id: "celadon", name: "Celadon",      bg: "#0d1416", accent: "#62c4b8" }
  ];

  function currentTheme() {
    try { return localStorage.getItem(K_THEME) || "ink"; } catch (e) { return "ink"; }
  }

  function applyTheme(id) {
    var t = null;
    for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) { t = THEMES[i]; break; } }
    if (!t) t = THEMES[0];
    /* ink 是 :root 的預設值，不掛 data-theme 屬性 */
    if (t.id === "ink") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t.id);
    try { localStorage.setItem(K_THEME, t.id); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.bg);
  }

  function currentFS() {
    var n;
    try { n = parseInt(localStorage.getItem(K_FS), 10); } catch (e) { n = NaN; }
    return (n >= 85 && n <= 175) ? n : 100;
  }

  function applyFS(n) {
    n = Math.max(85, Math.min(175, n));
    document.documentElement.style.fontSize = n + "%";
    try { localStorage.setItem(K_FS, String(n)); } catch (e) {}
    $("fs-val").textContent = n + "%";
  }

  function initTheme() {
    var btn = $("theme-btn"), sheet = $("theme-sheet"),
        backdrop = $("theme-backdrop"), grid = $("theme-grid");
    if (!btn || !sheet || !backdrop || !grid) return;

    function close() { sheet.classList.add("hidden"); backdrop.classList.add("hidden"); }
    function paint() {
      grid.innerHTML = "";
      var cur = currentTheme();
      THEMES.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "theme-swatch" + (t.id === cur ? " selected" : "");
        b.setAttribute("aria-label", t.name);
        var dot = document.createElement("span");
        dot.className = "theme-dot";
        dot.style.background = "linear-gradient(135deg, " + t.bg + " 55%, " + t.accent + " 55%)";
        b.appendChild(dot);
        b.appendChild(document.createTextNode(t.name));
        b.addEventListener("click", function () { applyTheme(t.id); paint(); });
        grid.appendChild(b);
      });
    }
    btn.addEventListener("click", function () {
      paint();
      sheet.classList.remove("hidden");
      backdrop.classList.remove("hidden");
    });
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    $("fs-minus").addEventListener("click", function () { applyFS(currentFS() - 10); });
    $("fs-plus").addEventListener("click", function () { applyFS(currentFS() + 10); });

    applyTheme(currentTheme());
    applyFS(currentFS());
  }

  function logout() {
    confirmMsg("Sign out?", function () {
      API.studentLogout();
      API.teacherLogout();
      hideCodeBox();
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
    $("do-teacher-code").addEventListener("click", submitTeacherCode);
    $("in-teacher-code").addEventListener("keydown", function (e) { if (e.key === "Enter") submitTeacherCode(); });
    $("do-teacher-signout").addEventListener("click", function () {
      API.teacherLogout();
      hideCodeBox();
      show("view-role");
    });
    initTheme();
    $("brand").addEventListener("click", function () { goto(API.isStudent() ? "student" : (API.isTeacher() ? "teacher" : "role")); });
    /* 把這份檔案的快取戳顯示出來。Tony 用手機回報問題時，
       光看畫面分不出他拿到的是修好前還是修好後的版本（GitHub Pages 的
       HTML 會被快取 10 分鐘），有這個戳就不用猜。 */
    $("build-stamp").textContent = STAMP;
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
    /* 寫作題的現成題型：按一下就把題目與字數填進表單，老師還是可以改。 */
    var wtRow = $("wt-row");
    window.CamPick.WRITING_TEMPLATES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ghost-btn small";
      b.textContent = t.label;
      b.addEventListener("click", function () {
        $("in-q-prompt").value = t.prompt;
        $("in-q-min").value = t.minWords;
        $("in-q-max").value = t.maxWords;
        $("in-q-prompt").focus();
      });
      wtRow.appendChild(b);
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
      confirmMsg("Delete this assignment? Student answers for it are deleted too.", function () {
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
      confirmMsg("Delete this class? The roster and every student record are deleted too. This cannot be undone.", function () {
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
      enterTeacher();
    } else {
      show("view-role");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
