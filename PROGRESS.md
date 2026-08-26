# 進度：CamReview（劍橋英檢課堂版）

<!-- 交接檔表頭。規格見 claude-shared/claude-md/shared.md §17。 -->

STATUS: in-progress
OBJECTIVE: 做一個 FCE 課堂站——老師建班級、派作業、看全班成績；學生用班級代碼登入練習，跨裝置同步
NEXT_ACTION: 六批都完成（最新是 2026-08-26 Tony 六點回報：老師識別碼、色系主題、對話框置中、Add 溢出、去 LanExamMock 字樣、版面不溢出），等 Tony 實際帶班後的回饋再調整。**老師識別碼在 backend .env 的 CAM_TEACHER_CODE，要給新老師時從那裡看**（不在 repo 裡）。可以先做的加值項：聽力題型（需 TTS，可沿用 LanExamMock 剛做好的英/美口音切換）、學生的自由練習模式、老師端一鍵複製作業到另一個班
VALIDATION: node test/test.js 全綠；後端 node test/cam-test.js（在 claude-shared/projects/LanExamMock/backend）全綠；瀏覽器實測老師建班→學生登入→跨裝置看到同一份資料
BLOCKERS: 無
PATHS: ~/TelegramClaude/CamReview/（前端）、claude-shared/projects/LanExamMock/backend/cam.js（後端）
UPDATED: 2026-08-26 18:40 台北

## 2026-08-26 Tony 六點回報（全部處理完，v6）

1. **Sign out 的 OK 跑到頁面最下面** —— `dialog.js` 從一開始就在產 `.dlg-overlay`／`.dlg-card`，
   但 `css/style.css` 裡**從來沒有這幾條規則**，所以 overlay 只是個普通區塊，接在 `<main>` 後面排到頁尾。
   補上 `position:fixed` 滿版置中 ＋ 遮罩。這種「JS 產了 class、CSS 沒跟上」的洞，肉眼看程式很難發現，
   所以 browser-smoke 加了一條：對話框的按鈕必須落在 viewport 之內。

2. **派作業的 Add 被擠到畫面右邊外面** —— `.row-form` 是 flex 但沒有 `flex-wrap`，
   而且 flex 子項預設 `min-width:auto`（內容多寬就多寬，壓不下去）。手機上「長選單＋數字框＋按鈕」
   一定擠爆。改成可換行、每個子項 `min-width:0`，題庫來源的長選單自己佔一整行。

3. **介面不要出現 LanExamMock** —— Tony：「這系統是不同人使用的，他根本就不知道是什麼」。
   題庫提示與版本紀錄的字樣都改掉了。**執行時本來就沒有跨站相依**：題庫是本站自己的
   `js/data/fce-bank.js`。`tools/sync-banks.js` 是編譯期工具（從正本 LanExamMock 產出這支檔），
   使用者永遠看不到；真要完全分家再說，分家的代價是題庫從此要維護兩份。

4. **色系主題** —— 🎨 六色（Ink Black／Deep Navy／Forest Green／Warm Paper／Rose Plum／Celadon）
   ＋ 字級 85–175%，色票與變數名稱直接沿用 LanExamMock，兩站看起來才是同一家人。存 localStorage，
   `index.html` 在第一次繪製前就套用（否則會閃一下預設色）。

5. **老師識別碼** —— Tony：「不然學生們都可以登錄當老師，出題目給自己先刷題」。
   Google 登入只證明「你是誰」，不代表「你是老師」。後端新增 `cam_teachers` 白名單與
   `POST /api/cam/teacher/activate`，**17 個老師端點全部從 `authenticate` 改走 `teacherAuth`**。
   識別碼放 backend `.env` 的 `CAM_TEACHER_CODE`（不進 repo），猜碼每小時 10 次上限。
   ⚠️ **這一層一定要在後端**：只擋前端等於沒擋，學生開 devtools 就繞過去了。

6. **版面不得橫向溢出** —— Tony：「有些會超出去頁面，我要放大縮小很麻煩」。
   `html`/`body` 用 `overflow-x: clip`。⚠️ **不可以用 `hidden`**：hidden 會讓祖先變成捲動容器，
   標題列的 `position:sticky` 當場失效（實測 scrollY=400 時標題列 top=-400，等於跟著捲走了）。
   這件事是 browser-smoke 抓到的，現在留了一條回歸測試守著。

### browser-smoke 新增的四類檢查

- **360px 逐頁量橫向溢出**：走訪 13 個 view，逐一比對每個元素的 `getBoundingClientRect()` 與
  視窗寬度，超出就印出兇手的標籤、id、class 與座標區間。**不能只看 `document.scrollWidth`** ——
  加了 `overflow-x:clip` 之後 scrollWidth 永遠等於視窗寬，症狀被蓋掉了，只有逐元素量才抓得到。
- **量的是「有真實內容」的頁面**：先用 dev token 當老師走完 班級列表→單一班級→儀表板→學生明細→派作業，
  學生端也點進已交的作業。空白頁當然不會溢出，量空白頁等於沒量。
- **對話框浮在畫面內**、**捲動後標題列仍固定**、**換色系會立刻套用並記住**。
- 後端測試同步加了「沒有識別碼就建不了班／識別碼錯要擋下／輸入正確即解鎖」。

## 2026-08-26 Tony 追加的兩項（已完成）

1. **介面全部英文**（原話：「介面全部用英文就好，不要有中文. 他們是雙語班沒有問題的」）
   —— index.html、app.js、pick.js、util.js、versions.js 裡所有使用者看得到的字串都改成英文，
   包含錯誤訊息、確認對話框、CSV 的欄位標題與檔名。**程式註解維持中文**（那是給維護的人看的，不是介面）。
   `test/test.js` 加了一道守門：把 HTML 註解與 JS 註解剝掉之後，這幾支檔案不可以再出現中日韓字元，
   之後誰再塞中文進介面就會測試失敗。

2. **老師自己出作文題** —— 這個功能其實 v2 就有（出題下拉選 Writing task，填題目＋字數範圍），
   Tony 會提出來多半是不夠明顯。這次補上 `CamPick.WRITING_TEMPLATES`：essay／email／article／review
   四個 B2 First 現成題型，在寫作表單上方一排按鈕，按一下把題目與 140–190 字填進去，老師再改。
   另外修掉一個小坑：加入題目後沒有清空字數欄，下一題會沿用上一題的字數。

⚠️ 這一站的 repo 沒有設定 git 使用者，第一次 commit 會被 `Author identity unknown` 擋下來。
已經在 repo 內設好 `tonychuangtw / tonychuangtw@gmail.com`，之後不會再遇到。

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
