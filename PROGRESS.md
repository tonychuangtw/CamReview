# 進度：CamReview（劍橋英檢課堂版）

<!-- 交接檔表頭。規格見 claude-shared/claude-md/shared.md §17。 -->

STATUS: in-progress
OBJECTIVE: 做一個 FCE 課堂站——老師建班級、派作業、看全班成績；學生用班級代碼登入練習，跨裝置同步
NEXT_ACTION: 四批都完成，等 Tony 實際帶班後的回饋再調整。可以先做的加值項：聽力題型（需 TTS，可沿用 LanExamMock 剛做好的英/美口音切換）、學生的自由練習模式、老師端一鍵複製作業到另一個班
VALIDATION: node test/test.js 全綠；後端 node test/cam-test.js（在 claude-shared/projects/LanExamMock/backend）全綠；瀏覽器實測老師建班→學生登入→跨裝置看到同一份資料
BLOCKERS: 無
PATHS: ~/TelegramClaude/CamReview/（前端）、claude-shared/projects/LanExamMock/backend/cam.js（後端）
UPDATED: 2026-08-26 13:30 台北

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

**第二批（2026-08-26）：派作業、作答、自動批改**

後端
- `cam_assignments` / `cam_submissions` / `cam_questions` 三張表。作業存的是**出題當下的題目快照**，
  之後題庫或自訂題再怎麼改，已派出去的作業與批改依據都不會變。
- 三種題型：`mc`（2–6 選項）、`gap`（多組可接受答案）、`writing`（不自動給分）。
- 批改：填空比對前會**忽略大小寫、前後空白、連續空白與句尾標點**——這幾項不忽略的話，
  「答對卻被判錯」的申訴會多到老師不敢用自動批改。
- ⚠ `/assignments/:aid/take` 一定要走 `itemForStudent()` 把 answer 與 explanation 剝掉，
  否則學生打開開發者工具就看得到答案。smoke test 有專門一條在守這件事。
- 考試模式：`exam_mode` 為真時交過就不能再取題也不能再交（403）。
- 限時：`take` 回傳 `remainingSec`（由伺服器的 `started_at` 算），前端只負責倒數顯示，
  學生改裝置時鐘沒有用。

前端
- `js/pick.js`（純函式）把題庫四種 Part 與閱讀題組轉成統一的作業題型，並處理老師自訂題的表單。
- 老師：新增作業（題庫挑題／自己出題／混合）、題目清單可逐題移除、單一作業看全班交件與分數。
- 學生：作業清單 → 作答（選擇／填空／寫作，寫作即時字數）→ 交卷 → 成績與逐題檢討。
- 題庫（約 950 KB）只有老師點「加入」時才動態載入，學生端完全不會下載到。

測試：前端 59 項純邏輯、後端 55 項、瀏覽器 27 項（含「作答頁看不到解析」與完整的
派題 → 作答 → 自動批改 → 老師看到分數）。

**第三批（2026-08-26）：老師儀表板與 CSV**
- `/classes/:id/dashboard` 一次算完：每位學生交了幾份與平均正確率、每份作業的交件數與班平均、
  各題型的整體正確率、全班最容易錯的前 20 題（只統計自動批改的題，寫作不列入）。
- `/classes/:id/students/:sid/work` 單一學生的逐題作答（含他寫的答案、對錯、正解與寫作全文）。
- CSV 在前端組（一列一位學生、每份作業一欄）。⚠ 開頭一定要補 BOM，否則老師用 Excel 開，
  中文姓名會變亂碼——這是這類匯出最常被回報的問題。

**第四批（2026-08-26）：寫作批改**
- `/assignments/:aid/grade-writing` 呼叫既有的 `gradeEssay`（Kimi K3），依劍橋四項標準給分。
- ⚠ 速率限制的 key 用「學生 id」而不是預設的 IP —— 全班共用學校的一個對外 IP，
  用 IP 當 key 會整班一起被鎖。
- 同一題批改過就存在 `cam_submissions.feedback`，不會重複送（重複送＝重複花錢）。
- `/classes/:id/submissions/:subId/writing` 讓老師打分數與寫評語，與 AI 批改並存，
  老師的分數是最終成績。
- ⚠ smoke test **刻意不按**「取得批改」那顆按鈕——那會真的呼叫 K3 花錢。只驗按鈕有出現。

## 待辦

- [x] `tools/sync-banks.js`：從 LanExamMock 同步 FCE 題庫（加題仍只加在 LanExamMock）
- [ ] Tony 之後會申請網址：屆時加 `CNAME` 檔，並把新網域加進後端的 `EXTRA_ORIGINS`
