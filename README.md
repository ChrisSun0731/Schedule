# Nursing Scheduling System

A 28-day (four-week) nursing schedule, shift-swap, and leave management system. It supports Google sign-in, role-based access, automatic scheduling with real-time rule checks, individual schedule emails after publication, Excel export, and deployment to GitHub Pages.

- **Frontend:** Quasar 2 (Vue 3 `<script setup lang="ts">`, TypeScript, SCSS), Pinia
- **Backend:** Firebase Authentication (Google), Cloud Firestore, optional Cloud Functions
- **Export:** SheetJS (xlsx)
- **Deployment:** GitHub Pages (hash routing) and GitHub Actions

---

## Features

| Feature | Description |
| --- | --- |
| Multiple wards | A head nurse can manage multiple wards. Switch wards with tabs; each ward has its own staff, staffing needs, schedule, and swap/leave approvals. |
| 28-day schedule grid | Rows are nurses (N0–N3 badges); columns are days 1–28. Includes week separators, weekend/holiday markers, and live daily D/E/N and N2+ counts. |
| Real-time rule checks | Violations are outlined in red and warnings in orange. Filter checks by category and select an item to jump to its cell. |
| Editing | Head nurses and administrators can select a shift by clicking a cell or using `D E N O A L R`, arrow keys, and Delete. Manual changes are automatically locked. |
| Automatic scheduling | A simulated annealing solver runs in a Web Worker. It preserves locked cells, applies leave by priority, and considers the final seven days of the previous period. |
| Publish and notify | Publishes the schedule and emails each nurse their personal 28-day schedule using a throttled queue with automatic and manual retries and per-recipient status. |
| Add to Google Calendar | Schedule and approved-swap emails include an Add / Update Google Calendar button. After signing in, users can add work and leave days to their calendar. Sync updates existing events instead of duplicating them. An `.ics` file is also available for Apple Calendar and Outlook. |
| Shift swaps | Request a swap, email the other nurse, get their approval, validate the rules, then write the change transactionally. Rule violations require head nurse approval. |
| Leave | Supports 12 leave types (see below). Approved leave is scheduled by priority during automatic scheduling; statutory leave is always assigned. |
| Excel export | Three worksheets: schedule (including individual statistics and daily counts), rule checks, and legend. |

## Roles and permissions

| Permission | System administrator `developer` | Head nurse `head_nurse` | Nurse `nurse` |
| --- | :---: | :---: | :---: |
| View published schedules | ✓ | ✓ | ✓ (assigned wards) |
| View drafts | ✓ All wards | ✓ Managed wards | |
| Create periods, run auto-scheduling, edit any cell | ✓ All wards | ✓ Managed wards | |
| Publish, notify, and export Excel | ✓ All wards | ✓ Managed wards | |
| Email logs | ✓ | ✓ | |
| Request/respond to swaps | ✓ (on behalf of others) | ✓ (on behalf of staff in managed wards) | ✓ (self) |
| Approve swaps and leave | ✓ All wards | ✓ Managed wards | |
| Set ward staffing needs and swap approval policy | ✓ All wards | ✓ Managed wards | |
| Add, rename, and delete wards | ✓ | | |
| Manage staff and roles (including ward assignment) and system settings | ✓ | | |

Permissions are enforced by both the frontend route guard (`src/boot/auth.ts`) and **Firestore Security Rules** (`firestore.rules`). When a nurse accepts a swap, the rules verify each cell to ensure only the two requested assignments changed. The schedule change and swap status update must occur in the same transaction, so Cloud Functions are not required for this protection.

## Local development

See the remaining README for setup, deployment, Firestore schema, scheduling rules, email providers, Google Calendar configuration, migration, testing, and troubleshooting.

## Google Calendar setup

The Add / Update Google Calendar button in schedule and approved-swap emails opens `#/calendar?schedule=<schedule id>`. A nurse signs in with their usual Google account and selects **加入 Google 日曆**. The app then asks Google for the `calendar.events` permission and writes to the nurse's primary calendar through the Google Calendar API, directly from the browser. The access token is kept in memory only.

- **Work shifts** become timed events using the shift times in Settings (time zone Asia/Taipei).
- **Leave days** become all-day events. OFF and REQ days are not added.
- **Syncing again**, for example after a swap, updates or removes only the changed shifts. Each event has a fixed ID, so nothing is duplicated, and only events created by this app are touched.

This needs no Cloud Functions or Blaze plan, but the Firebase project needs a one-time setup:

1. In the [Google Cloud console](https://console.cloud.google.com/), select the Firebase project, open **APIs & Services → Library**, and enable the **Google Calendar API**.
2. Open **OAuth consent screen → Data access** and add the scope `https://www.googleapis.com/auth/calendar.events`.
   - **Internal user type:** use this if every nurse signs in with an account on the hospital's Google Workspace domain. Google does not need to verify the app.
   - **External user type:** `calendar.events` is a sensitive scope. Until Google verifies the app, users see a "Google hasn't verified this app" warning (they can continue through **Advanced**), and the app is limited to 100 users. Submit the app for verification before production use.

Until this is done, the button shows "系統尚未啟用 Google Calendar API". Nurses can still use **下載 .ics** to import their shifts manually.

Code: `src/pages/CalendarPage.vue` (landing page), `src/services/googleCalendar.ts` (authorization and sync), and `src/services/calendarExport.ts` (shift → event / `.ics` conversion, unit-tested).

## License

© 2026 Chris Sun. Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): you may share and adapt this project for non-commercial purposes, with attribution, if you distribute your changes under the same license. See [LICENSE](LICENSE).
