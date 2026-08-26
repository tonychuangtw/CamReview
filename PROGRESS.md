# 進度：CamReview（劍橋英檢課堂版）

<!-- 交接檔表頭。規格見 claude-shared/claude-md/shared.md §17。 -->

STATUS: in-progress
OBJECTIVE: 做一個 FCE 課堂站——老師建班級、派作業、看全班成績；學生用班級代碼登入練習，跨裝置同步
NEXT_ACTION: 第二批「派作業」：後端加 cam_assignments／cam_submissions／cam_questions 三張表與 /api/cam/assignments 端點；前端做老師的出題畫面（題庫挑題＋自訂選擇/填空/寫作題）與學生的作答畫面
VALIDATION: node test/test.js 全綠；後端 node test/cam-test.js（在 claude-shared/projects/LanExamMock/backend）全綠；瀏覽器實測老師建班→學生登入→跨裝置看到同一份資料
BLOCKERS: 無
PATHS: ~/TelegramClaude/CamReview/（前端）、claude-shared/projects/LanExamMock/backend/cam.js（後端）
UPDATED: 2026-08-26 11:10 台北

## 已完成

**第一批（2026-08-26）：身分、班級、名冊、跨裝置同步**

後端（`claude-shared/projects/LanExamMock/backend/`）
- `auth.js` 新增 `issueCamToken` / `verifyCamToken` / `camAuth`。學生 token 用 `cam.` 前綴，
  **`authenticate()` 不接受它**，且 `camAuth` 刻意不設 `req.userEmail` —— 保證學生身分
  永遠過不了既有的 `ownerOnly` 檢查，拿不到 seats/rooms/house 等任何個人資料。
- `cam.js`：`cam_classes` / `cam_students` / `cam_progress` 三張表與 `/api/cam/*` 路由。
  班級代碼 6 碼，字母表刻意去掉 I/O/0/1（學生手抄不會錯）。
- `server.js` 掛上 `/api/cam`，CORS 來源改成可用環境變數 `EXTRA_ORIGINS` 擴充（之後掛自訂網域不用改程式）。
- `test/cam-test.js`：24 項，含權限邊界（學生 token 打老師端點必須 401）與
  「同座號在第二台裝置登入拿得到同一份進度」。

前端（本 repo）
- `js/api.js` 學生與老師 token 分開存（`cam.student` / `cam.teacher`）
- `js/app.js` 身分選擇 → 學生登入 → 學生首頁；老師 Google 登入 → 班級列表 → 單一班級（代碼、名冊、鎖定、批次匯入、刪除）
- `js/util.js` 純函式（名冊解析、代碼正規化、跳脫），`test/test.js` 33 項測試

**語言分工（2026-08-26 定案）**：學生會看到的學習內容與練習介面一律英文（維持沉浸，與
LanExamMock 一致）；老師的管理介面用中文，因為那是工具不是教材。

## 待辦

- [ ] 第二批：派作業（題庫挑題 ＋ 老師自訂選擇/填空/寫作題）、學生作答與自動評分
- [ ] 第三批：老師儀表板（誰交了／分數／全班最常錯的題型）＋ CSV 匯出
- [ ] 第四批：計時考試模式（一次性作答、時間到自動收卷）＋ 寫作走 K3 批改
- [ ] `tools/sync-banks.js`：從 LanExamMock 同步 FCE 題庫（加題仍只加在 LanExamMock）
- [ ] Tony 之後會申請網址：屆時加 `CNAME` 檔，並把新網域加進後端的 `EXTRA_ORIGINS`
