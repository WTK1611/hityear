// Verpackt die vorhandenen Vanilla-JS-Seiten. Die Website selbst benötigt weiterhin keinen Build.
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const mobile = path.resolve(import.meta.dirname, "..");
const wurzel = path.resolve(mobile, "..");
const www = path.join(mobile, "www");
const server = new URL(process.env.HITYEAR_API_URL ?? "https://hityear.app");
const lokal = ["localhost", "127.0.0.1", "10.0.2.2"].includes(server.hostname);
if (server.username || server.password || server.pathname !== "/" || server.search || server.hash || (server.protocol !== "https:" && !(lokal && server.protocol === "http:"))) {
  throw new Error("HITYEAR_API_URL muss eine HTTPS-Origin sein (HTTP nur für lokale Entwicklung).");
}
await fs.rm(www, { recursive: true, force: true });
await fs.cp(path.join(wurzel, "public"), www, { recursive: true });
await fs.mkdir(path.join(www, "socket.io"), { recursive: true });
await fs.copyFile(path.join(wurzel, "node_modules/socket.io/client-dist/socket.io.js"), path.join(www, "socket.io/socket.io.js"));
await fs.writeFile(path.join(www, "js/app-konfiguration.js"), `window.HITYEAR_APP = ${JSON.stringify({ server: server.origin })};\n`);
await build({ entryPoints: [path.join(mobile, "src/bruecke.js")], outfile: path.join(www, "js/native.js"), bundle: true, format: "iife", target: ["chrome109", "safari15"], minify: true });
for (const datei of await fs.readdir(www)) {
  if (!datei.endsWith(".html")) continue;
  const pfad = path.join(www, datei);
  let html = await fs.readFile(pfad, "utf8");
  html = html.replace('<script src="/js/plattform.js"></script>', '<script src="/js/app-konfiguration.js"></script>\n<script src="/js/native.js"></script>\n<script src="/js/plattform.js"></script>');
  // Native App-Webviews erhalten dieselben Herkunftsgrenzen wie die Website, erweitert um den Spielserver.
  const ws = server.origin.replace(/^http/, "ws");
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${server.origin} https://*.mzstatic.com https://*.dzcdn.net; media-src 'self' blob: ${server.origin} https://*.apple.com https://*.dzcdn.net; connect-src 'self' ${server.origin} ${ws};`;
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="referrer" content="no-referrer">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);
  await fs.writeFile(pfad, html);
}
console.log("App-Webdateien vorbereitet (Oberfläche und Socket.IO lokal, Hörproben direkt gestreamt).");
