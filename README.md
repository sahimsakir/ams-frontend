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

Attendance now performs **face matching only**, at the user's explicit request. A photographed print or screen image of the enrolled person may also pass. No attendance liveness/PAD check is performed. Exact previously used photo bytes are blocked, but this cannot reject re-photographed or re-encoded copies.

## Use a phone or tablet on the same Wi-Fi

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

The browser checks use a fake webcam and mocked API to verify mandatory enrollment, owner-assisted enrollment, three camera steps, retry behavior, mobile layouts, single-photo attendance and timestamp rendering. They do not measure recognition accuracy or certify real phone cameras. Optional `CHROMIUM_PATH` selects an existing browser executable for CI.

## Update for face-only attendance

Update backend and frontend together. Follow backend update instructions to rebuild api/worker/face and recreate them, preserving the existing `.env`, APP_KEY and data. In this frontend:

```sh
git pull --ff-only
npm ci
npm run dev
```

Refresh the browser and reopen the camera dialog for a fresh session. Enrollment stays forward/left/right. Attendance only captures and matches an image; no movement, blinking or anti-spoof classifier is required. Face mismatches, expired proofs, unavailable verification, duplicate attendance and exact-image reuse remain blocked. A matching photograph of the enrolled person may be accepted.

## Faster enrollment capture

Forward/left/right checks remain required, with four fresh frames verified per pose. The preparation countdown is now one second, and frames are sampled 150 ms apart with no unused delay after the final frame. This reduces the deliberate frontend wait from about four seconds to about 1.45 seconds per pose (roughly eight seconds saved over three poses). Duplicate frames are skipped briefly while awaiting a fresh image, with a five-second stalled-camera timeout. Camera encoding, network and server inference time are additional and depend on the device. Position your head before selecting **I’m ready — capture**.

For this frontend timing update, pull the frontend repository and restart Vite, then refresh the browser. No backend rebuild or migration is needed.
