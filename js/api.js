/* ============================================================
 * CamReview — 後端存取層
 *
 * 兩種身分各存一顆 token，key 完全分開，互不覆蓋：
 *   cam.student  學生 token（班級代碼＋座號登入後由後端簽發，180 天）
 *   cam.teacher  老師 token（Google 登入換來的長效 session token，30 天）
 * 學生 token 只打得到 /api/cam/* 的學生端點，拿不到老師端或其他站台的任何資料。
 * ============================================================ */
(function () {
  "use strict";

  var API_BASE = "https://claudebot500.tailfcf67f.ts.net";
  var K_STUDENT = "cam.student";
  var K_TEACHER = "cam.teacher";
  var K_PROFILE = "cam.profile";     /* 學生的班級與姓名，離線時也能顯示 */

  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  function studentToken() { return ls(K_STUDENT); }
  function teacherToken() { return ls(K_TEACHER); }

  function profile() {
    try { return JSON.parse(ls(K_PROFILE) || "null"); } catch (e) { return null; }
  }

  /* 後端錯誤一律轉成 Error(訊息)，呼叫端只要 catch 一種型別。 */
  function request(method, path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    return fetch(API_BASE + path, {
      method: method,
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data && data.error ? data.error : "Request failed (" + r.status + ")");
          err.status = r.status;
          throw err;
        }
        return data;
      });
    }, function () {
      throw new Error("Can't reach the server. Check your connection and try again.");
    });
  }

  var API = {
    base: API_BASE,

    /* ---------- 學生 ---------- */
    isStudent: function () { return !!studentToken(); },
    studentProfile: profile,

    studentLogin: function (code, name, seatNo) {
      return request("POST", "/api/cam/login", { body: { code: code, name: name, seatNo: seatNo } })
        .then(function (data) {
          set(K_STUDENT, data.token);
          set(K_PROFILE, JSON.stringify({ student: data.student, klass: data.klass }));
          return data;
        });
    },

    studentLogout: function () { set(K_STUDENT, ""); set(K_PROFILE, ""); },

    /* 每次開站呼叫一次：確認 token 還有效，順便把班級名稱等資料更新到最新。 */
    me: function () {
      return request("GET", "/api/cam/me", { token: studentToken() }).then(function (data) {
        set(K_PROFILE, JSON.stringify(data));
        return data;
      });
    },

    getProgress: function () {
      return request("GET", "/api/cam/progress", { token: studentToken() });
    },
    putProgress: function (blob) {
      return request("PUT", "/api/cam/progress", { token: studentToken(), body: blob });
    },

    /* ---------- 老師 ---------- */
    isTeacher: function () { return !!teacherToken(); },
    setTeacherToken: function (t) { set(K_TEACHER, t || ""); },
    teacherLogout: function () { set(K_TEACHER, ""); },

    /* Google ID token 換一顆 30 天的 session token，手機才不用一直重登。 */
    exchangeGoogleToken: function (idToken) {
      return request("POST", "/api/session", { token: idToken }).then(function (data) {
        set(K_TEACHER, data.token);
        return data;
      });
    },

    listClasses: function () {
      return request("GET", "/api/cam/classes", { token: teacherToken() });
    },
    createClass: function (name, level) {
      return request("POST", "/api/cam/classes", { token: teacherToken(), body: { name: name, level: level } });
    },
    updateClass: function (id, patch) {
      return request("PATCH", "/api/cam/classes/" + id, { token: teacherToken(), body: patch });
    },
    deleteClass: function (id) {
      return request("DELETE", "/api/cam/classes/" + id, { token: teacherToken() });
    },
    listStudents: function (id) {
      return request("GET", "/api/cam/classes/" + id + "/students", { token: teacherToken() });
    },
    addStudents: function (id, students) {
      return request("POST", "/api/cam/classes/" + id + "/students", {
        token: teacherToken(), body: { students: students }
      });
    },
    removeStudent: function (id, sid) {
      return request("DELETE", "/api/cam/classes/" + id + "/students/" + sid, { token: teacherToken() });
    }
  };

  window.CamAPI = API;
})();
