# AMS Frontend

React 19 + TypeScript + Vite attendance workspace. Companion API: [ams-backend](https://github.com/sahimsakir/ams-backend). The frontend is not Dockerized.

## Run on your computer

Install Node.js 22+ and start the backend using its README. From this repository:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The default API URL is `/api`; Vite forwards requests to `http://127.0.0.1:8000`. If you already have `.env` with `VITE_API_URL=http://localhost:8000/api`, change it to `VITE_API_URL=/api` and restart Vite before using a phone. `API_PROXY_TARGET` can override the backend address in the shell that starts Vite. A separate browser API origin requires matching backend `FRONTEND_URL` and HTTPS.

Use the owner credentials generated in the backend `.env`. Create people and teams and assign TL/PM responsibilities. Each person signs in with their own account and selects **Enroll my face**. All roles, including owners, follow the same enrollment flow. Owners can reset a template, but cannot enroll someone else's face.

## Enroll and give attendance

1. Select **Enroll my face**, read the consent and enable it, then select **Start camera**.
2. Allow camera permission. Look straight ahead, then follow each randomized left/right/up/down prompt. Select **Verify this step** and hold the pose through the countdown.
3. For the blink step, start with eyes open. When prompted, close your eyes for about one second, then reopen. Finish with a front view.
4. After every step passes, enrollment is saved. Select **Capture & check in** to complete the shorter attendance challenge. Checkout uses its own new challenge.
5. The dashboard and attendance table show the full check-in/out date and time, including seconds, in **Asia/Dhaka**. An open shift remains available for checkout after midnight.

There is no file/photo upload option. Camera permission failures show retry instructions, and switching away from the page stops the camera and requires a fresh session. Old single-photo enrollments must complete the new guided flow before attendance is enabled; the old face must match during that upgrade. Ask an owner to reset a profile if it must be replaced.

Motion checks help reject a static photo. They are not certified anti-spoofing and cannot guarantee protection against replayed videos, manipulated frames or virtual cameras. Real-camera accuracy needs testing in your environment.

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

The browser checks use a fake webcam and mocked API to verify enrollment steps, retry behavior, mobile layouts, attendance and timestamp rendering. They do not measure recognition accuracy or certify real phone cameras. Optional `CHROMIUM_PATH` selects an existing browser executable for CI.
