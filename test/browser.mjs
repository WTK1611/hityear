// Echte Browserprüfung: kleine Touchscreens im Querformat und gezielt ausgelöste Audiofehler.
// Einmalig: npx playwright install chromium
// Alternativ: CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const wurzel = path.resolve(import.meta.dirname, "..");
const daten = mkdtempSync(path.join(os.tmpdir(), "hityear-browser-"));
const basis = "http://127.0.0.1:3793";
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.ts"], {
  cwd: wurzel,
  env: { ...process.env, PORT: "3793", HOST: "127.0.0.1", NODE_ENV: "test", ZEITSTRAHL_ZUGANG: "offen",
    ZEITSTRAHL_DATEN: daten, ZEITSTRAHL_MUSIK: path.join(daten, "musik") },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => log += d);
server.stderr.on("data", (d) => log += d);
let browser;
let aktuelleSeite;
try {
  let bereit = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${basis}/healthz`)).ok) { bereit = true; break; } } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(bereit, `Testserver nicht bereit: ${log}`);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true });
  for (const [width, height, hasTouch] of [[960, 400, true], [800, 360, true], [390, 844, true], [844, 390, true], [1280, 720, false]]) {
    const kontext = await browser.newContext({ viewport: { width, height }, screen: { width, height }, hasTouch, locale: "de-DE", reducedMotion: "reduce" });
    const seite = await kontext.newPage();
    aktuelleSeite = seite;
    seite.setDefaultTimeout(10_000);
    await seite.goto(basis);
    assert.equal(await seite.locator(".drehen-hinweis").count(), 0, "Startseite bleibt in jeder Ausrichtung frei");
    await seite.goto(`${basis}/host.html`);
    await seite.locator("#lobby").waitFor({ state: "visible" });
    assert.equal(await seite.evaluate(() => matchMedia("(pointer: coarse)").matches), hasTouch);
    assert.equal(await seite.locator(".drehen-hinweis").count(), 0, "Hochkant-Hinweis darf Setup nicht verdecken");
    for (let schritt = 0; schritt < 3; schritt++) {
      const vorher = await seite.locator("#schritt-inhalt .assistent-frage").textContent();
      await seite.locator("#schritt-inhalt button[aria-pressed]").first().click();
      await seite.waitForFunction((vorher) => {
        const frage = document.querySelector("#schritt-inhalt .assistent-frage");
        return frage && frage.textContent !== vorher;
      }, vorher);
    }
    assert.equal(await seite.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "kein horizontaler Überlauf");
    if (width === 960) await seite.screenshot({ path: path.join(os.tmpdir(), "hityear-querformat.png") });
    await kontext.close();
    console.log(`  Einrichtung bedienbar: ${width}×${height}, Touch ${hasTouch}`);
  }

  const kontext = await browser.newContext({ viewport: { width: 960, height: 400 }, screen: { width: 960, height: 400 }, hasTouch: true, locale: "de-DE", reducedMotion: "reduce" });
  const seite = await kontext.newPage();
  aktuelleSeite = seite;
  seite.setDefaultTimeout(10_000);
  await seite.goto(`${basis}/spielen.html?raum=TEST`);
  await seite.getByRole("button", { name: "Im Querformat fortfahren" }).click();
  assert.equal(await seite.locator(".drehen-hinweis").isVisible(), false);
  assert.notEqual(await seite.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
  await seite.reload();
  assert.equal(await seite.locator(".drehen-hinweis").isVisible(), false, "Querformat-Auswahl bleibt erhalten");
  await seite.goto(`${basis}/host.html`);
  await seite.locator("#lobby").waitFor({ state: "visible" });
  const browserFehler = [];
  seite.on("pageerror", (err) => browserFehler.push(err.message));
  await seite.evaluate(async () => {
    window.tonTest = { audio: audioSpieler(), host: true, aktiv: true, wechsel: 0, geladen: 0 };
    const t = window.tonTest;
    // 30 Sekunden gültige Stille: kurze Autoplay-Testdateien würden die Position auf 0,1 s begrenzen.
    const wav = new Uint8Array(44 + 30 * 8000 * 2);
    const kopf = new DataView(wav.buffer);
    for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]]) {
      for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
    }
    kopf.setUint32(4, wav.length - 8, true);
    kopf.setUint32(16, 16, true);
    kopf.setUint16(20, 1, true);
    kopf.setUint16(22, 1, true);
    kopf.setUint32(24, 8000, true);
    kopf.setUint32(28, 16000, true);
    kopf.setUint16(32, 2, true);
    kopf.setUint16(34, 16, true);
    kopf.setUint32(40, wav.length - 44, true);
    t.url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    audioFehlerBinden(t.audio, {
      aktiv: () => t.aktiv,
      position: () => 7,
      darfWechseln: () => t.host,
      wechseln: async () => { t.wechsel++; t.audio.laden(null); },
    });
    t.audio.element.load = () => t.geladen++;
    t.audio.laden(t.url);
    t.audio.element.play = async () => { throw new DOMException("Geste nötig", "NotAllowedError"); };
  });
  assert.equal(await seite.evaluate(() => window.tonTest.audio.abspielen()), false);
  assert.equal(await seite.locator(".audio-hilfe").getByRole("button", { name: "Song wechseln" }).count(), 0, "Autoplay-Sperre ist kein kaputter Song");
  await seite.evaluate(() => { window.tonTest.audio.element.play = async () => window.tonTest.audio.element.dispatchEvent(new Event("playing")); });
  await seite.locator(".audio-hilfe").getByRole("button", { name: "▶ Tippen zum Abspielen" }).click();
  await seite.locator(".audio-hilfe").waitFor({ state: "detached" });
  assert.equal(await seite.evaluate(() => window.tonTest.audio.element.currentTime), 7, "Wiedergabe holt zur aktuellen Rundenposition auf");

  await seite.evaluate(async () => {
    const t = window.tonTest;
    t.audio.element.play = async () => { throw new DOMException("Quelle fehlt", "NotSupportedError"); };
    await t.audio.abspielen();
  });
  await seite.locator(".audio-hilfe").getByText("Hörprobe konnte nicht geladen werden.").waitFor();
  assert.equal(await seite.locator(".audio-hilfe").getByRole("button", { name: "Song wechseln" }).isVisible(), true);
  const geladen = await seite.evaluate(() => window.tonTest.geladen);
  await seite.evaluate(() => { window.tonTest.audio.element.play = async () => window.tonTest.audio.element.dispatchEvent(new Event("playing")); });
  await seite.getByRole("button", { name: "Erneut versuchen" }).click();
  await seite.locator(".audio-hilfe").waitFor({ state: "detached" });
  assert.equal(await seite.evaluate(() => window.tonTest.geladen), geladen + 1, "defekte Quelle wird beim Wiederholen neu geladen");

  await seite.evaluate(() => window.tonTest.audio.element.dispatchEvent(new Event("error")));
  await seite.getByRole("button", { name: "Song wechseln" }).click();
  assert.equal(await seite.evaluate(() => window.tonTest.wechsel), 1);
  await seite.evaluate(async () => {
    const t = window.tonTest;
    t.host = false;
    t.audio.laden(t.url);
    t.audio.element.play = async () => { throw new Error("Netzwerkfehler"); };
    await t.audio.abspielen();
  });
  assert.equal(await seite.locator(".audio-hilfe").getByRole("button", { name: "Song wechseln" }).count(), 0, "Mitspieler erhalten keinen Songwechsel-Knopf");
  await seite.evaluate(() => { window.tonTest.aktiv = false; });
  await seite.locator(".audio-hilfe").waitFor({ state: "detached" });

  await seite.evaluate(async () => {
    const t = window.tonTest;
    t.aktiv = true;
    let ablehnen;
    t.audio.element.play = () => new Promise((_, r) => { ablehnen = r; });
    const alt = t.audio.abspielen();
    t.audio.laden(null);
    t.audio.laden(t.url);
    ablehnen(new DOMException("Alter Song abgebrochen", "AbortError"));
    await alt;
  });
  assert.equal(await seite.locator(".audio-hilfe").count(), 0, "keine veraltete Fehlermeldung nach Songwechsel");
  await seite.evaluate(async () => {
    const t = window.tonTest;
    t.audio.element.play = () => new Promise(() => {});
    await t.audio.abspielen();
  });
  await seite.getByText("Hörprobe konnte nicht geladen werden.").waitFor();
  assert.equal(await seite.evaluate(() => window.tonTest.audio.fehler), "quelle", "Zeitüberschreitung wird als Ladefehler angezeigt");
  await seite.screenshot({ path: path.join(os.tmpdir(), "hityear-audiofehler.png") });
  assert.deepEqual(browserFehler, [], "keine unbehandelten Browserfehler");
  console.log("  Audio: Autoplay, Laden, Wiederholen, Host-Songwechsel, Rundenwechsel und Zeitüberschreitung geprüft");
  console.log("Browser: alles grün");
} catch (err) {
  if (aktuelleSeite && !aktuelleSeite.isClosed()) {
    await aktuelleSeite.screenshot({ path: path.join(os.tmpdir(), "hityear-browser-fehler.png") });
  }
  throw err;
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const beendet = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await beendet;
  }
  rmSync(daten, { recursive: true, force: true });
}
