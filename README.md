# AMS Frontend

React 19 + TypeScript + Vite attendance workspace. Companion API: `ams-backend` repository. This frontend is not Dockerized.

## Run

Install Node.js 22+ and start the backend using its README. From this repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The API defaults to http://localhost:8000/api. To override, copy `.env.example` to `.env` and change VITE_API_URL, then restart Vite. Configure the backend FRONTEND_URL for your deployed frontend origin. Backend local-mode CORS also permits http://127.0.0.1:5173.

Use owner credentials generated in the backend `.env`. Create employees and teams, assign TL/PM responsibilities, configure leave policies, and enroll employee faces before recording attendance. Browser camera access requires localhost or HTTPS.

```sh
npm run build
npm run preview
```

Includes dashboard, photo attendance, leave/home-office/overtime requests, approval history, team management, owner people management, calendar and leave policies. It connects to the real backend; no fabricated demo data is shipped. Face verification is not liveness detection. See the backend README for deployment and biometric limitations.
