# 護理排班系統

28 天（4 週）護理排班、換班與請假管理系統。Google 帳號登入、角色權限、自動排班與即時規則檢查、發布後逐人寄送個人班表、Excel 匯出，部署於 GitHub Pages。

- **前端**：Quasar 2（Vue 3 `<script setup lang="ts">`、TypeScript、SCSS）、Pinia
- **後端**：Firebase Authentication（Google）、Cloud Firestore、（選用）Cloud Functions
- **匯出**：SheetJS（xlsx）
- **部署**：GitHub Pages（hash 路由）＋ GitHub Actions

---

## 功能

| 功能 | 說明 |
| --- | --- |
| 28 天班表矩陣 | 列＝護理師（N0–N3 標章）、欄＝第 1–28 天；週分隔線、週末/國定假日標示；底部即時統計 D/E/N 人數與 N2+ 人數 |
| 即時規則檢查 | 違規格子紅框、警告橘框；規則檢查面板可依類別篩選，點選即捲動到該格 |
| 編輯 | 護理長/管理員點格子選班別，或用鍵盤 `D E N O A L R`、方向鍵、Delete；手動修改自動「鎖定」 |
| 自動排班 | Web Worker 中執行模擬退火求解；保留鎖定格、依優先序套用請假、銜接上一期最後 7 天 |
| 發布並通知 | 狀態改為已發布，逐人寄送個人 28 天班表（節流佇列、自動重試、逐人狀態、手動重試） |
| 換班 | 申請 → Email 徵詢對方 → 對方登入同意 → 規則檢查 → 交易寫入班表；有違規時轉護理長審核 |
| 請假 | 年休 AL > 公假 OL > 預假 REQ；護理長核准後於自動排班時依優先序排入 |
| Excel 匯出 | 班表（含個人統計與每日人數列）、規則檢查、圖例三個工作表 |

## 角色與權限

| 權限 | 系統管理員 `developer` | 護理長 `head_nurse` | 護理師 `nurse` |
| --- | :---: | :---: | :---: |
| 檢視已發布班表 | ✓ | ✓ | ✓ |
| 檢視草稿 | ✓ | ✓ | |
| 建立週期 / 自動排班 / 編輯任一格 | ✓ | ✓ | |
| 發布並通知、匯出 Excel、郵件紀錄 | ✓ | ✓ | |
| 申請換班 / 回覆換班 | ✓（可代他人申請） | ✓（可代他人申請） | ✓（本人） |
| 審核換班 / 請假 | ✓ | ✓ | |
| 人員與角色管理、系統設定 | ✓ | | |

權限同時由前端路由守衛（`src/boot/auth.ts`）與 **Firestore Security Rules**（`firestore.rules`）強制執行。護理師同意換班時，規則會逐格驗證「只交換了申請中的兩格、其餘未變」，且必須與換班申請的狀態變更在同一筆交易中寫入，因此不需要 Cloud Functions 也安全。

## 排班規則

| 規則 | 預設值 | 等級 |
| --- | --- | --- |
| 每日人力 | 平日 D10 / E6 / N5；週末與國定假日 D8 / E6 / N5 | 不足＝錯誤，過多＝警告 |
| N2 以上人力 | 每班至少 1 人、建議 2 人 | 少於 1＝錯誤，少於 2＝警告 |
| 連續上班 | 最多 5 天（含上一期結尾） | 錯誤 |
| 連續休假 | 最多 3 天；連續區段含 AL/OL 時豁免 | 錯誤 |
| 例假 | 固定週（第 1–7、8–14、15–21、22–28 天）每週至少 1 天 OFF/REQ | 錯誤（整週皆請假時為警告） |
| 例假＋休息日 | 28 天內至少 8 天 OFF/REQ | 錯誤 |
| 輪班間隔 | 相鄰兩天班別間隔至少 11 小時（勞基法 §34），依班別時間計算；預設禁止 D→N、E→D、E→N | 錯誤（可設 0 關閉） |
| 可排班別 | 人員可限制只排部分班別 | 錯誤 |
| 工時不足 | 休假多於規定天數 | 提示 |

**假別解讀**：OFF、REQ（預假）算休假日；AL（年休）、OL（公假）取代上班日，不計入例假/休息日。所有數值可在「系統設定」調整。

## 專案結構

```
.
├── .github/workflows/deploy.yml   # 測試 → 建置 → 部署 GitHub Pages
├── firebase.json / .firebaserc    # Firebase CLI 與 Emulator 設定
├── firestore.rules                # 角色權限與換班逐格驗證
├── firestore.indexes.json
├── functions/                     # （選用）Cloud Function sendEmail：Resend 或 AWS SES
│   └── src/index.ts
├── quasar.config.ts               # hash 路由、PUBLIC_PATH、VITE_ 環境變數
├── src/
│   ├── boot/auth.ts               # Firebase Auth 初始化與路由守衛
│   ├── components/
│   │   ├── ScheduleGrid.vue       # 28 天矩陣（固定表頭/欄、即時統計、鍵盤編輯）
│   │   ├── ViolationPanel.vue     # 規則檢查清單
│   │   ├── GenerateDialog.vue     # 自動排班
│   │   ├── PublishDialog.vue      # 發布並通知（寄送進度）
│   │   ├── NewScheduleDialog.vue
│   │   ├── SwapRequestDialog.vue  # 申請換班（含換班前後預覽與規則檢查）
│   │   ├── SwapApprovalList.vue   # 同意 / 拒絕 / 審核
│   │   └── DeliveryList.vue, MailQueueIndicator.vue, ShiftPill.vue, LevelBadge.vue
│   ├── constants/labels.ts        # 繁體中文標籤與班別顏色
│   ├── layouts/MainLayout.vue
│   ├── pages/                     # LoginPage, SchedulePage, SwapsPage, LeavePage,
│   │                              # EmailLogPage, StaffPage, SettingsPage
│   ├── router/
│   ├── services/
│   │   ├── firebase.ts            # Firebase 初始化、Emulator 連線
│   │   ├── emailService.ts        # 寄送方式抽象 + 節流/重試佇列 + 寄送紀錄
│   │   ├── emailTemplates.ts      # 個人班表、換班徵詢、換班結果信件
│   │   ├── excelExport.ts         # SheetJS 匯出
│   │   ├── solverClient.ts        # Web Worker 包裝
│   │   └── demoData.ts            # 示範人員
│   ├── stores/                    # auth, users, settings, schedules, swaps, leaves, mailQueue
│   ├── types/schedule.ts          # 核心型別
│   ├── utils/
│   │   ├── scheduler.ts           # 規則驗證 + 請假優先序 + 自動排班（同一套成本模型）
│   │   ├── scheduleHelpers.ts     # 班表文件 ↔ 求解器、換班檢查
│   │   └── dates.ts
│   └── workers/scheduler.worker.ts
└── tests/
    ├── unit/                      # 排班規則、求解器、郵件佇列、範本、Excel
    └── rules/                     # Firestore 安全規則（Emulator）
```

## Firestore 資料結構

| 集合 / 文件 | 主要欄位 |
| --- | --- |
| `users/{email}` | `email`, `displayName`, `employeeId`, `role`, `level` (N0–N3), `allowedShifts`, `schedulable`, `active`, `uid`, `lastLoginAt` |
| `settings/app` | 每日人力、N2+ 規則、連續上班/休假、例假、輪班間隔、班別時間、`holidays`、`wardName`, `portalUrl`, `requireHeadApproval` |
| `schedules/{startDate}` | `startDate`, `endDate`, `status` (draft/published), `nurseOrder`, `nurses`（人員快照）, `assignments`（email → 28 個班別代碼）, `locks`, `holidays`（日索引）, `lastSwapId`, `publishedAt` |
| `swap_requests/{id}` | 申請人/對象（id、姓名、員工編號、email）、`requesterDay/Shift`, `targetDay/Shift`, `note`, `status` (pending_target → pending_head → approved / rejected / cancelled), `warnings`, `emailStatus` |
| `leave_requests/{id}` | `nurseId`, `type` (AL/OL/REQ), `startDate`, `endDate`, `status` |
| `email_logs/{id}` | `type`, `to`, `subject`, `status` (queued/sending/sent/failed/retrying), `attempts`, `error`, `provider`, `sentBy` |
| `mail/{id}` | Trigger Email 擴充功能的寄信佇列（provider = `firestore` 時） |

使用者文件以 **小寫 Google Email** 為文件 ID，讓安全規則可直接由登入權杖查出角色。

---

## 本機開發（Firebase Emulator，免建立 Firebase 專案）

需求：Node 22.12+ / 24、Java 21（Emulator）、Firebase CLI（`npm i -g firebase-tools`）。

```bash
npm install
npm run emulators                                   # 終端機 1：Auth + Firestore Emulator
VITE_USE_EMULATORS=true npm run dev                 # 終端機 2：開啟終端機顯示的網址
```

（也可以把 `VITE_USE_EMULATORS=true` 寫進 `.env.local`，見 `.env.example`。）

1. 登入頁展開「測試帳號（Emulator）」→ 點「系統管理員」（`admin@example.com`，為 `firestore.rules` 中的初始管理員）。
2. 「人員管理」→「載入示範人員」：建立 30 位護理師（`nurse01`–`nurse30@example.com`）與護理長 `head@example.com`。
3. 「班表」→「建立排班週期」→「自動排班」→「發布並通知」。
4. 以「護理師 01」登入申請換班，再以「護理師 02」登入同意。

預設 `VITE_EMAIL_PROVIDER=mock`：模擬寄送（約 10% 首次失敗以展示重試），不會真的寄信。

## 部署

### 1. Firebase 專案

1. 建立 Firebase 專案，新增 Web App，取得設定值。
2. **Authentication** → 登入方式 → 啟用 **Google**。
3. **Authentication** → 設定 → 授權網域：加入 `<GitHub 帳號>.github.io`。
4. 建立 **Firestore**（建議區域 `asia-east1`）。
5. 編輯 `firestore.rules` 的 `bootstrapDevelopers()`，改成您的 Google 帳號 Email（第一位管理員首次登入時自動建立）：
   ```
   function bootstrapDevelopers() { return ['you@gmail.com']; }
   ```
6. 部署規則：
   ```bash
   firebase use --add          # 選擇您的專案
   firebase deploy --only firestore
   ```

### 2. GitHub Pages

1. Repository → Settings → Pages → Source 選 **GitHub Actions**。
2. Settings → Secrets and variables → Actions：
   - **Secrets**（或 **Variables**，兩者皆可）：`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`（使用 EmailJS 時再加 `VITE_EMAILJS_*`）
   - **Variables**（選用）：`VITE_EMAIL_PROVIDER`、`VITE_FIREBASE_FUNCTIONS_REGION`
3. 推送到 `main`：Actions 會執行型別檢查、單元測試、安全規則測試，再建置並部署到 `https://<帳號>.github.io/<repo>/`。

> Firebase Web 設定值是公開識別碼，不是密碼；資料安全由 Firestore Security Rules 保護。

### 3. 寄信方式（`VITE_EMAIL_PROVIDER`）

| 值 | 說明 | 設定 |
| --- | --- | --- |
| `mock` | 模擬寄送（預設） | 無 |
| `firestore` | 寫入 `mail` 集合，由 Firebase **Trigger Email** 擴充功能透過 SMTP 寄出（AWS SES SMTP、Resend SMTP 皆可）；系統會等待 `delivery.state` 回報成功/失敗 | 安裝擴充功能，集合名稱設為 `mail` |
| `function` | 呼叫 Cloud Function `sendEmail`（`functions/`），支援 Resend API 或 AWS SES v2；伺服器端再次驗證角色與收件人 | 見下方（需 Blaze 方案） |
| `emailjs` | 由瀏覽器直接呼叫 EmailJS | EmailJS 範本使用 `{{to_email}}`、`{{to_name}}`、`{{subject}}`、`{{{html_body}}}` |

Cloud Function 部署：

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set MAIL_API_KEY   # Resend API key；SES 則輸入 ACCESS_KEY_ID:SECRET_ACCESS_KEY
firebase deploy --only functions              # 會詢問 MAIL_PROVIDER（resend|ses）、MAIL_FROM、SES_REGION
```

所有方式都經過同一個佇列（`EmailDispatcher`）：同時 2 封、間隔 350 ms、失敗自動重試 3 次（指數退避），每封的狀態寫入 `email_logs`，可在「郵件紀錄」查看。

## 測試

```bash
npm run typecheck     # vue-tsc
npm test              # 排班規則、求解器（含獨立暴力驗證）、郵件佇列、郵件範本、Excel
npm run test:rules    # 啟動 Firestore Emulator 測試安全規則（需 Java 21）
```

## 常見問題

- **登入後顯示「帳號尚未註冊」**：請系統管理員在「人員管理」以該 Google Email 新增人員。
- **自動排班仍有錯誤**：通常是人力不足（例如 28 天需求 572 人次，每人最多上班 20 天，至少需約 29 位可排班人員，再加上請假）。結果視窗會列出原因，未能排入的請假也會列出原因。
- **換班「需護理長審核」**：換班後會違反規則（例如班距不足 11 小時），或設定了「換班一律需護理長核准」。
