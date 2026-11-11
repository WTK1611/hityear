// App-Webpaket auf einer eigenen Origin: Anmeldung ohne Cookies, Socket.IO, Einladungen und Medien.
// Native Kamera, Audio-Hardware und Betriebssystem-Lebenszyklus brauchen zusätzlich Gerätetests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const wurzel = path.resolve(import.meta.dirname, '..');
const www = path.join(wurzel, 'mobile/www');
const daten = mkdtempSync(path.join(os.tmpdir(), 'hityear-app-'));
const basis = 'http://127.0.0.1:3794';
const app = 'http://127.0.0.1:3795';
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], {
  cwd: wurzel,
  env: { ...process.env, PORT: '3794', HOST: '127.0.0.1', NODE_ENV: 'test', ZEITSTRAHL_ZUGANG: 'passwort',
    ZEITSTRAHL_PASSWORT: '', ZEITSTRAHL_ADMIN_PASSWORT: '', ZEITSTRAHL_DATEN: daten,
    ZEITSTRAHL_MUSIK: path.join(daten, 'musik'), ZEITSTRAHL_APP_ORIGINS: app },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', d => log += d);
server.stderr.on('data', d => log += d);
const dateiserver = createServer((req, res) => {
  const name = new URL(req.url, app).pathname;
  if (name === '/js/app-konfiguration.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(`window.HITYEAR_APP = ${JSON.stringify({ server: basis })};`);
  }
  const pfad = path.resolve(www, '.' + (name === '/' ? '/index.html' : name));
  if (!pfad.startsWith(www + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    let inhalt = readFileSync(pfad);
    if (name.endsWith('.html') || name === '/') {
      // Das Produktionspaket bleibt unverändert. Nur die Backend-Origin der Testauslieferung wechselt.
      inhalt = Buffer.from(inhalt.toString().replaceAll('https://hityear.app', basis).replaceAll('wss://hityear.app', basis.replace('http', 'ws')));
    }
    const typen = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': typen[path.extname(pfad)] ?? 'application/octet-stream' });
    res.end(inhalt);
  } catch { res.writeHead(404); res.end(); }
});
let browser;
const sockets = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
const senden = (s, e, d = {}) => new Promise((resolve, reject) => s.timeout(5000).emit(e, d, (err, a) => err ? reject(err) : a.ok ? resolve(a) : reject(new Error(a.fehler))));
try {
  await new Promise(r => dateiserver.listen(3795, '127.0.0.1', r));
  let bereit = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${basis}/healthz`)).ok) { bereit = true; break; } } catch {}
    await pause(100);
  }
  assert.ok(bereit, `Testserver startet nicht: ${log}`);
  const vorab = await fetch(`${basis}/api/login`, { method: 'OPTIONS', headers: { Origin: app, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-hityear-app' } });
  assert.equal(vorab.status, 204);
  assert.equal(vorab.headers.get('access-control-allow-origin'), app);
  assert.equal(vorab.headers.get('access-control-allow-credentials'), null);
  const fremd = await fetch(`${basis}/api/ich`, { headers: { Origin: 'https://fremd.invalid' } });
  assert.equal(fremd.headers.get('access-control-allow-origin'), null);
  const anmelden = async (passwort, nativ = true) => {
    const res = await fetch(`${basis}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(nativ ? { Origin: app, 'X-Hityear-App': '1' } : {}) }, body: JSON.stringify({ passwort }) });
    assert.equal(res.status, 200);
    const daten = await res.json();
    if (nativ) { assert.equal(res.headers.get('set-cookie'), null); assert.ok(daten.appSitzung); }
    else { assert.equal(daten.appSitzung, undefined); assert.ok(res.headers.get('set-cookie')); }
    return { daten, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const { daten: admin } = await anmelden('admin');
  const { cookie } = await anmelden('zeitstrahl', false);
  const host = io(basis, { transports: ['websocket'], extraHeaders: { Cookie: cookie } });
  sockets.push(host);
  await new Promise((r, j) => { host.once('connect', r); host.once('connect_error', j); });
  const raum = await senden(host, 'host:erstellen');
  const nativ = io(basis, { transports: ['websocket'], auth: { sitzung: admin.appSitzung } });
  sockets.push(nativ);
  await new Promise((r, j) => { nativ.once('connect', r); nativ.once('connect_error', j); });
  assert.ok((await senden(nativ, 'host:erstellen')).code, 'App-Sitzung authentifiziert Socket.IO');
  const falsch = io(basis, { transports: ['websocket'], auth: { sitzung: 'ungueltig' }, reconnection: false });
  sockets.push(falsch);
  await new Promise((r, j) => { falsch.once('connect_error', r); falsch.once('connect', () => j(new Error('Falsche Sitzung akzeptiert'))); });

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true });
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'de-DE' });
  const seite = await kontext.newPage();
  seite.setDefaultTimeout(10000);
  const fehler = [];
  seite.on('pageerror', e => fehler.push(e.message));
  await seite.goto(app);
  await seite.locator('.zugang .app-scannen').waitFor({ state: 'visible' });
  await seite.locator('#zugang-passwort').fill('zeitstrahl');
  await seite.locator('.zugang button[type=submit]').click();
  await seite.locator('.zugang').waitFor({ state: 'detached' });
  assert.deepEqual(await kontext.cookies(), [], 'App-Anmeldung benötigt keine Cookies');
  await seite.goto(`${app}/host.html`);
  await seite.locator('#lobby').waitFor({ state: 'visible' });
  assert.equal(await seite.locator('.zugang').count(), 0, 'Sitzung übersteht den Seitenwechsel');
  assert.equal(await seite.evaluate(async () => (await api('/api/ich')).rolle), 'spieler');
  const qrAdresse = await seite.evaluate(() => medienAdresse('/api/qr'));
  assert.ok(qrAdresse.startsWith(basis + '/api/qr?appFreigabe='));
  assert.equal(new URL(qrAdresse).searchParams.has('sitzung'), false);
  const qr = await fetch(qrAdresse, { headers: { Origin: app } });
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /image\/svg/);
  const fremdeApi = new URL(qrAdresse);
  fremdeApi.pathname = '/api/bibliothek';
  assert.equal((await fetch(fremdeApi)).status, 401, 'Medienfreigabe ist keine API-Sitzung');
  assert.equal((await fetch(qrAdresse, { method: 'POST' })).status, 401);

  // Wiedergabe bekommt die signierte Adresse, Spielregeln behalten den ursprünglichen Ausschnitt-Token.
  const audio = await seite.evaluate(async () => {
    const spieler = audioSpieler();
    spieler.element.load = () => {};
    spieler.element.play = async () => {};
    const pfad = '/api/audio/abcdefghijklmno';
    spieler.laden(pfad);
    const ok = await spieler.abspielen();
    spieler.stop(0);
    return { ok, quelle: spieler.element.src, kanonisch: spieler.url };
  });
  assert.equal(audio.ok, true);
  assert.equal(audio.kanonisch, '/api/audio/abcdefghijklmno');
  assert.ok(audio.quelle.startsWith(basis + '/api/audio/abcdefghijklmno?appFreigabe='));
  let medienVersuche = 0;
  await seite.route(`${basis}/api/app/medien`, async (route) => {
    if (route.request().postDataJSON().pfad === '/api/audio/funkloch12345' && ++medienVersuche === 1) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    await route.continue();
  });
  const wiederholen = await seite.evaluate(async () => {
    const spieler = audioSpieler();
    spieler.element.load = () => {};
    spieler.element.play = async () => {};
    spieler.laden('/api/audio/funkloch12345');
    const erster = await spieler.abspielen();
    const fehler = spieler.fehler;
    const zweiter = await spieler.abspielen(0, true);
    const dritter = await spieler.abspielen();
    spieler.stop(0);
    return { erster, fehler, zweiter, dritter };
  });
  assert.deepEqual(wiederholen, { erster: false, fehler: 'quelle', zweiter: true, dritter: true });
  assert.equal(medienVersuche, 2, 'Wiederholen erneuert auch eine fehlgeschlagene Medienfreigabe');
  await seite.unroute(`${basis}/api/app/medien`);
  const links = await seite.evaluate((basis) => [
    einladungsZiel(`${basis}/s/ABCD.abcdefgh`),
    einladungsZiel('hityear://join?raum=abcd&einladung=abcdefgh'),
    einladungsZiel('https://fremd.invalid/s/ABCD.abcdefgh'),
    einladungsZiel(`${basis}/admin.html`),
  ], basis);
  assert.deepEqual(links, ['/spielen.html?raum=ABCD&einladung=abcdefgh', '/spielen.html?raum=ABCD&einladung=abcdefgh', null, null]);
  await seite.screenshot({ path: path.join(os.tmpdir(), 'hityear-app-host.png'), animations: 'disabled' });

  // QR-Einladung eines Website-Hosts -> neuer App-Gast ohne vorherige Anmeldung.
  const zustand = await new Promise(r => { host.once('zustand', r); host.emit('abgleich', {}); });
  const einladung = zustand.einladung;
  assert.ok(einladung, 'Host erhält Einladung');
  const gastKontext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'de-DE' });
  const gast = await gastKontext.newPage();
  gast.on('pageerror', e => fehler.push(e.message));
  await gast.goto(app);
  await gast.locator('.zugang .app-scannen').waitFor({ state: 'visible' });
  await gast.evaluate((url) => { window.HitYearNative.scannen = async () => url; }, `${basis}/s/${raum.code}.${einladung}`);
  await gast.locator('.zugang .app-scannen').click();
  await gast.locator('#beitreten').waitFor({ state: 'visible' });
  assert.equal(await gast.evaluate(async () => (await api('/api/ich')).rolle), 'gast');
  assert.deepEqual(await gastKontext.cookies(), []);
  await gast.locator('#name').fill('App-Gast');
  await gast.locator('#beitreten-form button[type=submit]').click();
  await gast.locator('#warten').waitFor({ state: 'visible' });
  await gast.reload();
  await gast.locator('#warten').waitFor({ state: 'visible' });
  await gast.screenshot({ path: path.join(os.tmpdir(), 'hityear-app-gast.png'), animations: 'disabled' });
  await gast.evaluate(() => api('/api/logout', {}));
  await gast.goto(app);
  await gast.locator('.zugang').waitFor({ state: 'visible' });
  assert.equal(await gast.evaluate(() => window.HitYearNative.sitzung), null);
  assert.deepEqual(fehler, [], 'Keine unbehandelten Browserfehler');
  console.log('App-Test bestanden: CORS, Cookie-freie Anmeldung, Socket.IO, Medien, Einladungs-Scan, Wiederbeitritt und Abmelden.');
} finally {
  for (const s of sockets) s.disconnect();
  await browser?.close();
  dateiserver.closeAllConnections();
  await new Promise(r => dateiserver.close(r));
  const ende = new Promise(r => server.once('exit', r));
  server.kill('SIGTERM');
  await ende;
  rmSync(daten, { recursive: true, force: true });
}
