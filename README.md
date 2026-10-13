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
3. **Turn slightly:** follow the visual example and turn your head a little left or right, about 20°. Keep your face visible, then press **I’m ready — capture**.
4. **Close and open eyes:** face the camera and press **Start eye check**. Start with your eyes open. When **CLOSE** appears, close both eyes for about one second, then reopen. The result saves automatically after this third check passes.
5. Enrollment unlocks the workspace. Check-in and checkout use the same three simple live-camera checks. The dashboard and attendance table show full dates and seconds in **Asia/Dhaka**, including overnight checkout.

For owner-assisted enrollment: finish your own enrollment, open **People**, select **Enroll face** beside the target user, confirm their identity and consent, and capture that person through the same three steps. Their account then opens normally. Already enrolled profiles must be reset before replacement.

There is no file/photo upload option. Camera permission failures show retry instructions, and switching away from the page stops the camera and requires a fresh session. Old single-photo enrollments must complete the new guided flow before attendance is enabled; the old face must match during that upgrade. Ask an owner to reset or help enroll a profile if needed.

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

The browser checks use a fake webcam and mocked API to verify mandatory enrollment, owner-assisted enrollment, three camera steps, retry behavior, mobile layouts, attendance and timestamp rendering. They do not measure recognition accuracy or certify real phone cameras. Optional `CHROMIUM_PATH` selects an existing browser executable for CI.
