# AMS Frontend

React 19 + TypeScript + Vite attendance workspace. Companion API: [ams-backend](https://github.com/sahimsakir/ams-backend). The frontend is not Dockerized.

## Run on your computer

Install Node.js 22+ and start the backend using its README. From this repository:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The default API URL is `/api`; Vite forwards requests to `http://127.0.0.1:8000`. If you already have `.env` with `VITE_API_URL=http://localhost:8000/api`, change it to `VITE_API_URL=/api` and restart Vite before using a phone. `API_PROXY_TARGET` can override the backend address in the shell that starts Vite. A separate browser API origin requires matching backend `FRONTEND_URL` and HTTPS.

Use the owner credentials generated in the backend `.env`. Create people and teams and assign TL/PM responsibilities. On first login, everyone—including owners—sees a required enrollment popup. Complete its three camera checks to unlock the workspace. An enrolled owner can open **People → Enroll face** to enroll a selected user in person. Owners can reset an existing template before replacing it.

## Enroll and give attendance

1. Sign in. If you have no verified face profile, the enrollment popup appears automatically. Read the consent, enable it, then select **Start camera**. Other workspace features stay locked until enrollment succeeds; you can still sign out.
2. **Look forward:** keep your face inside the oval with your eyes open. Press **I’m ready — capture** and hold still through the countdown.
3. **Look left:** follow the visual example and turn your head a little to your left, about 20°. Keep your face visible, then press **I’m ready — capture**.
4. **Look right:** turn your head slightly to your right, keep your eyes open, and press **I’m ready — capture**. The result saves automatically after this third check passes. Enrollment has no eye close/open step.
5. Enrollment unlocks the workspace. For check-in or checkout, start the camera and select **Capture & check in/out**. One image is matched against your enrolled face; attendance is recorded immediately after a successful match. There is no head turn or eye-closing check. The dashboard and attendance table show full dates and seconds in **Asia/Dhaka**, including overnight checkout.

For owner-assisted enrollment: finish your own enrollment, open **People**, select **Enroll face** beside the target user, confirm their identity and consent, and capture that person through the same three steps. Their account then opens normally. Already enrolled profiles must be reset before replacement.

There is no file/photo upload option. Camera permission failures show retry instructions, and switching away from the page stops the camera and requires a fresh session. Old single-photo enrollments must complete the new guided flow before attendance is enabled; the old face must match during that upgrade. Ask an owner to reset or help enroll a profile if needed.

Attendance now requires **face matching plus MiniVision passive liveness**. One tap collects four fresh frames without head-turn prompts. Passive PAD can still falsely reject genuine users or accept attacks and needs actual-device validation. Exact previously used photo bytes are blocked, but this cannot reject re-photographed or re-encoded copies.

## Use a phone or tablet on the same Wi-Fi

For the full Fedora LAN setup, certificate trust, backend cookies and firewall steps, see [LAN.md](LAN.md). Start with `npm run dev:lan` after configuring `.env.lan`.

Mobile browsers require a **trusted HTTPS address** for camera access. `http://192.168.…:5173` does not meet that requirement, and `localhost` on a phone points to the phone itself.

One development option is [mkcert](https://github.com/FiloSottile/mkcert). Install it on your computer, install its development CA, then create a certificate with your computer's LAN IP (replace the example):

```sh
mkdir -p .certs
mkcert -install
mkcert -cert-file .certs/ams.pem -key-file .certs/ams-key.pem localhost 127.0.0.1 192.168.1.20
AMS_HTTPS_CERT=.certs/ams.pem AMS_HTTPS_KEY=.certs/ams-key.pem npm run dev -- --host 0.0.0.0
```

On PowerShell, set `$env:AMS_HTTPS_CERT=".certs/ams.pem"` and `$env:AMS_HTTPS_KEY=".certs/ams-key.pem"` before running `npm run dev -- --host 0.0.0.0`.

Install and trust mkcert's **rootCA.pem** certificate on the test phone using your device's certificate settings (iOS also needs full trust enabled under Certificate Trust Settings). Find it with `mkcert -CAROOT`. Never share `rootCA-key.pem` or certificate private keys. Open `https://192.168.1.20:5173` on the phone, accept camera permission, and use the front-facing camera. Allow inbound TCP 5173 through your computer's firewall on the trusted local network if needed. The phone and computer must be able to reach each other. For shared/production access use your organization's trusted HTTPS domain instead of a development CA.

The frontend proxies the API, so Docker's backend port can remain restricted to the computer. Vite's development server is for local development, not public production hosting.

## Update and build

Update the backend and apply its new migration first, then:

```sh
git pull --ff-only
npm ci
npm run build
npm run dev
```

For production, serve `dist/` over HTTPS and route `/api` to Laravel behind the same origin. The production gateway needs a 12 MB request body limit and 120-second API timeout for frame bursts. `vite preview` alone does not configure the production API gateway.

## Automated checks

```sh
npm run build
npx playwright install chromium
npm test
```

The browser checks use a fake webcam and mocked API to verify mandatory enrollment, owner-assisted enrollment, three camera steps, retry behavior, mobile layouts, one-tap four-frame attendance and timestamp rendering. They do not measure recognition accuracy or certify real phone cameras. Optional `CHROMIUM_PATH` selects an existing browser executable for CI.

## Update for face-only attendance

Update backend and frontend together. Follow backend update instructions to rebuild api/worker/face and recreate them, preserving the existing `.env`, APP_KEY and data. In this frontend:

```sh
git pull --ff-only
npm ci
npm run dev
```

Refresh the browser and reopen the camera dialog for a fresh session. Enrollment stays forward/left/right. Attendance automatically captures four frames and requires both matching and passive liveness; no movement or blinking instruction is required. Face mismatches, expired proofs, unavailable verification, duplicate attendance and exact-image reuse remain blocked. Passive liveness is not guaranteed to reject every photo/video attack.

## Faster enrollment capture

Forward/left/right checks remain required, with four fresh frames verified per pose. The preparation countdown is now one second, and frames are sampled 150 ms apart with no unused delay after the final frame. This reduces the deliberate frontend wait from about four seconds to about 1.45 seconds per pose (roughly eight seconds saved over three poses). Duplicate frames are skipped briefly while awaiting a fresh image, with a five-second stalled-camera timeout. Camera encoding, network and server inference time are additional and depend on the device. Position your head before selecting **I’m ready — capture**.

For this frontend timing update, pull the frontend repository and restart Vite, then refresh the browser. No backend rebuild or migration is needed.

### Application forms and owner administration

Leave and overtime use numbered sections, date summaries, private document uploads and applicant/review cards without a Slack field. Owners manage leave types in Settings and users/CSV imports in People. Download the CSV template from the import dialog. Deletions retain historical records; user self-deletion and deletion with pending work are blocked.

Pull both repositories for this release. Run the backend migration and rebuild api/worker as documented in the backend README, then run `npm ci` and `npm run dev` here.

### Monthly attendance and work slots

Attendance has current-month date filters, office/home/leave details and eight summary cards. Owners can select an employee or view everyone. All other roles see only themselves. Missing exits appear after local midnight and do not block the next day's check-in. Hour averages exclude unfinished shifts; actual hours count only the assigned slot (default 09:00–18:00), with no break deduction.

Owners edit individual slots in People → Work slot and team slots in Teams → Edit work slot. Individual times override inherited teams; choose a member team explicitly or use the first configured team. Changes apply to future check-ins. Pull both repos and run the backend migration for this release.

### Roles and permissions

Owner → Roles creates/edits custom roles; Owner → Permissions manages permission definitions. People → Role & permissions assigns one account role plus additive direct user grants. Initial display roles: Owner, Management, Project Manager, Team Lead, Members. Menus/actions use effective permissions; APIs enforce grants and data scope. Custom permission keys are reusable by new features, but their routes must explicitly use the backend middleware. Initial role/permission keys and Owner access are protected. Existing account assignments migrate automatically; pull both repositories, run the backend migration and restart the frontend.

### Passport cookie login

The backend now uses Spatie Laravel Permission and Passport. Keep `VITE_API_URL=/api` and use the existing Vite proxy; production should serve frontend and `/api` on one origin. Fetches include browser credentials and CSRF headers. Login does not return an access token to JavaScript, and no local/session storage token is used. Document downloads also authenticate via the HttpOnly cookie. Roles and Permissions are separate menus. API user data exposes `effective_permissions`; definition labels use `display_name`.

Pull both repositories, run backend migrations and `php artisan ams:auth-setup` as documented in the backend README, restart API/worker and frontend, then sign in again. Use HTTPS with `SESSION_SECURE_COOKIE=true` in production (false for local HTTP development). Preserve APP_KEY and Passport keys; no reseeding is needed.

The real cookie login test in `tests/cookie-login.spec.ts` runs only with `RUN_REAL_AUTH=1` against a prepared development backend with the integration fixture; normal `npm test` uses API mocks and skips it. It verifies real CSRF rejection, Passport HttpOnly flags, persistence across reload, logout, and absence of bearer headers/storage tokens.

### Compact permissions and spreadsheet-style tables

Permissions uses a compact table with separate label, key, type and action columns. Attendance, People, Audit, Permissions and Team home office share column menus with ascending/descending sort, Contains text, search/select values and clear/reset controls. Attendance and audit filter/sort across the full scoped dataset before pagination; other lists filter locally over all loaded records. Action columns do not offer meaningless record filters. Menus stay within the mobile viewport. Summary cards follow date/employee filters; column filters affect table rows. New request appears only on Overview and Requests for users with application-create permission.

### Team home-office assignments

Owner and users granted `home_office.manage` get Team home office → Assign home office. Choose one team or All teams, first/last dates and a reason. One-day or longer inclusive ranges are supported, without the personal application's one-year cap. All teams excludes users without a team. Current team membership applies at check-in. Assignment directly authorizes home office; members still perform face check-in/out. Cancel assignment retains historical attendance; overlapping assignments remain effective until individually cancelled. Grant this permission through Roles or People → Role & permissions.

### Page URLs

Pages use `/overview`, `/attendance`, `/requests`, `/teams`, `/people`, `/settings`, `/roles`, `/permissions`, `/team-home-office`, and `/profile`. Refresh and browser back/forward preserve the selected page. A signed-out direct link stays at its destination through login and enrollment. Legacy `/#requests` links redirect to `/requests`. Unknown paths show a page-not-found message; restricted pages show access unavailable.

Vite development/preview handles SPA deep links. In production, configure the frontend web server to serve `index.html` for app paths (Nginx: `location / { try_files $uri $uri/ /index.html; }`). Keep your `/api` proxy separate.

For this update, rebuild backend face/api/worker as documented in ams-backend. Frontend and backend must be updated together; old single-frame attendance submissions are rejected.

### Refreshed workspace and analytics

Shared layout/style rules are in `src/workspace.css`; `src/Analytics.tsx` owns daily/monthly reporting at `/analytics`. A mobile/tablet navigation drawer replaces the long menu grid below 1024px, with Escape, focus containment and return focus. Dialogs also support keyboard focus containment and Escape. Responsive cards, forms, local table scrolling and clearer page titles apply across the workspace; logos are preserved.

Analytics appears only with `analytics.view_daily` and/or `analytics.view_monthly`. Owner can assign `analytics.view_team` or `analytics.view_all` through Roles/People; without a scope grant, reports cover self only. Today’s no-check-in is provisional. New joiners are account creation dates; monthly counts are employee-days. Server-side scopes are separate from attendance/photo grants. Apply backend migration `000012` before using this page.
