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
  function $(id) { return document.getElementById(id); }
  var esc = U.esc;
  function alertMsg(m) { if (window.UIDialog) UIDialog.alert(m); else window.alert(m); }
  function confirmMsg(m, ok) { if (window.UIDialog) UIDialog.confirm(m, ok); else if (window.confirm(m)) ok(); }

  /* ---------------- 檢視切換 ---------------- */
  var VIEWS = ["view-role", "view-student-login", "view-student-home",
    "view-teacher-login", "view-teacher-home", "view-class", "view-versions"];
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

  function paintStudentHome() {
    var p = API.studentProfile();
    if (!p) return;
    $("stu-class").textContent = p.klass.name + " · " + p.klass.level.toUpperCase();
    $("stu-name").textContent = "Seat " + p.student.seatNo + " — " + p.student.name;
    $("stu-sync").textContent =
      "Signed in on this device. Use the same class code and seat number anywhere else and " +
      "you'll pick up exactly where you left off.";
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
