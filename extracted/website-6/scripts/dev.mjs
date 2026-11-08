/**
 * اجرای همزمان Vite و درگاه احراز هویت محلی.
 * کلید service_role فقط از .env.local (بدون پیشوند VITE_) خوانده می‌شود.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startAuthGateway } from "./auth-gateway.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] == null) process.env[k] = v;
  }
}

loadEnv(".env.local");
loadEnv(".env");
if (!process.env.APP_ENV) process.env.APP_ENV = "development";
if (!process.env.OTP_PROVIDER) process.env.OTP_PROVIDER = "console";

const port = Number(process.env.AUTH_GATEWAY_PORT || 8788);
await startAuthGateway({ port });

const vite = spawn("npx", ["vite", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_AUTH_GATEWAY_URL: `http://127.0.0.1:${port}` },
});
vite.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    vite.kill(sig);
    process.exit();
  });
}
