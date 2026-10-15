import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // On phones, use a certificate trusted by that phone (see README).
  const cert = env.AMS_HTTPS_CERT;
  const key = env.AMS_HTTPS_KEY;
  if (mode === "lan" && (!cert || !key)) throw new Error("LAN camera access needs HTTPS. Set AMS_HTTPS_CERT and AMS_HTTPS_KEY in .env.lan (see LAN.md).");
  if (!!cert !== !!key) throw new Error("Set both AMS_HTTPS_CERT and AMS_HTTPS_KEY.");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      https: cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined,
      proxy: { "/api": { target: env.API_PROXY_TARGET || "http://127.0.0.1:8000", changeOrigin: true, timeout: 120000, proxyTimeout: 120000 } },
    },
  };
});
