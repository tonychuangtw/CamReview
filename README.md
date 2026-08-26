# CamReview — 劍橋英檢課堂版

一堂課用的劍橋英檢練習站。老師建立班級、派作業、看全班狀況；學生用班級代碼登入練習，
進度自動跨裝置同步。這一班的程度是 **B2 First (FCE)**。

- 線上網址：https://tonychuangtw.github.io/CamReview/
- 後端：與 LanExamMock 共用 `lanexammock-backend.service`（本機 4100，Tailscale Funnel 對外），
  CamReview 專用的端點在 `/api/cam/*`，程式在 `claude-shared/projects/LanExamMock/backend/cam.js`

## 兩種身分

| | 怎麼登入 | 看得到什麼 |
| --- | --- | --- |
| 老師 | Google 帳號 | 只有自己建立的班級、名冊、作業與成績 |
| 學生 | 班級代碼 ＋ 姓名 ＋ 座號（無密碼） | 只有自己那一班的作業與自己的作答 |

**「班級＋座號」就是學生的帳號**：同一組資料在任何裝置登入都是同一個人，練習紀錄自動同步。
代價是知道班級代碼的人可以用別人的座號登入（Tony 2026-08-26 決定先不管）；班級有「鎖定名冊」
開關，鎖定後只有名冊上既有的座號能登入。

## 開發

純靜態站，沒有 build 步驟。

```bash
node test/test.js          # 純邏輯 + 靜態檔案一致性
python3 -m http.server 8000   # 本機預覽
```

後端測試在 `claude-shared/projects/LanExamMock/backend/test/cam-test.js`（`node test/cam-test.js`）。

改到 `js/` 或 `css/` 的內容後，**push 前要把 `index.html` 裡所有 `?v=` 一起換成新的戳記**
（測試會檢查全站戳記是否一致），否則使用者手機會拿到快取的舊檔。

## 題庫

FCE 題庫不在這個 repo 裡維護 —— 用 `tools/sync-banks.js` 從 LanExamMock 同步過來，
加題一律加在 LanExamMock，避免兩份走鐘。
