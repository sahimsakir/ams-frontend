# Run AMS on your office Wi-Fi / LAN

Use one always-on computer as the host. Other devices open the frontend HTTPS address; all API traffic is proxied to Docker on that host. The frontend is not Dockerized. This uses Vite's development server on your trusted LAN; use a production HTTPS reverse proxy and built frontend for permanent office deployment. Do not forward port 5173 on your router.

## 1. Find and reserve the host IP

On the Fedora host:

```sh
ip -4 addr
```

Use the Wi-Fi/Ethernet address (for example `192.168.1.20`), not a Docker bridge or `127.0.0.1`. Reserve it in the router DHCP settings so certificates and bookmarks continue working. Replace the example below with your actual address.

## 2. Create trusted HTTPS certificates

Install [mkcert](https://github.com/FiloSottile/mkcert#installation) and NSS tools. On Fedora install NSS with `sudo dnf install nss-tools`; mkcert's upstream README provides Linux binary installation instructions. Then, in `ams-frontend`:

```sh
mkdir -p .certs
mkcert -install
mkcert -cert-file .certs/ams.pem -key-file .certs/ams-key.pem localhost 127.0.0.1 192.168.1.20
```

Create `.env.lan` in `ams-frontend`:

```dotenv
VITE_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:8000
AMS_HTTPS_CERT=.certs/ams.pem
AMS_HTTPS_KEY=.certs/ams-key.pem
```

Do not put `localhost:8000` in `VITE_API_URL`; on a phone that would refer to the phone itself. `.env.lan` and `.certs` are ignored by Git. Environment variables set in your terminal override dotenv files.

## 3. Configure and start the existing backend

Keep existing APP_KEY, database passwords, Passport keys and volumes. In `ams-backend/.env`, set:

```dotenv
FRONTEND_URL=https://192.168.1.20:5173
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

Leave `SESSION_DOMAIN` unset/null for host-only cookies. `APP_URL` can remain the backend's existing local URL because the browser uses the frontend `/api` proxy. Keep API bound to `127.0.0.1:8000`; do not publish PostgreSQL, the face service or Mailpit to the LAN. Normal application authentication and permissions still apply; Wi-Fi access does not create accounts or grant attendance access.

From `ams-backend`:

```sh
git pull --ff-only
docker compose up -d --build
docker compose exec api php artisan migrate --force
docker compose exec api php artisan optimize:clear
```

If this is the first installation, complete the backend README setup first, including `.env` secrets, APP_KEY, owner setup and `php artisan ams:auth-setup`. Do not rerun initial seeders on an existing database. Configure real SMTP for approval emails; the default Mailpit captures mail locally without delivering to users' inboxes.

## 4. Allow the frontend through Fedora's firewall

Inspect the active zone and find the one used by your Wi-Fi/Ethernet interface:

```sh
sudo firewall-cmd --get-active-zones
```

If that interface is in `FedoraWorkstation` (replace this zone name if different):

```sh
sudo firewall-cmd --zone=FedoraWorkstation --add-port=5173/tcp
sudo firewall-cmd --permanent --zone=FedoraWorkstation --add-port=5173/tcp
```

Only do this on your trusted office network. Router guest/client/AP isolation must permit devices to reach the host. No router port forwarding is needed.

## 5. Run frontend

From `ams-frontend`:

```sh
git pull --ff-only
npm ci
npm run dev:lan
```

LAN mode requires the HTTPS certificate/key and listens on all host interfaces, TCP 5173. Keep the terminal running; disable host sleep while colleagues use AMS. The computer must stay powered on and connected.

## 6. Trust the certificate on each client

On the host, find the CA certificate:

```sh
mkcert -CAROOT
```

Transfer only `rootCA.pem` from that directory to each client through a trusted channel. Never transfer `rootCA-key.pem` or `ams-key.pem` and do not put them in the frontend public directory.

- Android: install the CA certificate through Settings → Security / Encryption & credentials → Install a certificate → CA certificate (labels vary); restart Chrome.
- iPhone/iPad: install the certificate profile, then enable full trust under Settings → General → About → Certificate Trust Settings.
- Computers: install the CA in the trusted root store; Firefox may need its own Authorities import or enterprise certificate settings.

Open **https://192.168.1.20:5173** and sign in. `/attendance`, `/requests` and other page URLs work directly. Allow camera permission. Merely bypassing a certificate warning is not a replacement for trusting the CA; plain HTTP LAN URLs cannot provide normal mobile camera access.

## Troubleshooting

- Cannot connect: verify host IP, frontend process, firewall zone and Wi-Fi client isolation. VPNs can change routing.
- Camera unavailable: confirm trusted HTTPS, browser camera permission and no other app holding the camera.
- Login does not stick / 419: use the same HTTPS IP consistently; check `/api` proxy, secure cookies and `.env.lan`, recreate API/worker after backend `.env` changes, clear config and clear this site's cookies.
- Proxy error: confirm `docker compose ps`, backend at `127.0.0.1:8000`, and face service startup logs.
- IP changed: reserve the new IP, generate a new leaf certificate for it, update FRONTEND_URL and restart services. The CA need not be replaced if it is unchanged.

Restart API/worker after changing backend environment:

```sh
docker compose up -d --force-recreate api worker
docker compose exec api php artisan optimize:clear
```
