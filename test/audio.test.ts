// Echte Audio-Freigaben und Vorschau-Auflösung, nur die Musikdienste werden simuliert.
import { after, afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const daten = fs.mkdtempSync(path.join(os.tmpdir(), "hityear-audio-"));
process.env.ZEITSTRAHL_DATEN = daten;
const { db } = await import("../src/db.ts");
const { streamZeileAnlegen, songHolen } = await import("../src/bibliothek.ts");
const { ausschnittFreigeben, ausschnittHolen, freigabeEntziehen } = await import("../src/audio.ts");
const { liveTreffer, dienstName, dienstLink, vorschauPruefen } = await import("../src/vorschau.ts");

after(() => { db.close(); fs.rmSync(daten, { recursive: true, force: true }); });
let nummer = 1000;
let jetzt = Date.now();
beforeEach(() => {
  jetzt += 60_000;
  mock.method(Date, "now", () => jetzt);
  mock.method(console, "warn", () => {});
});
afterEach(() => mock.restoreAll());
const song = (apple = false) => streamZeileAnlegen(`@apple/${apple ? "" : "deezer-"}${++nummer}.m4a`, {
  interpret: "Testband", titel: "Testlied", album: null, genre: null, cover: null,
});
const deezer = (id = nummer, variante = "eins") => ({
  id, title: "Testlied", artist: { name: "Testband" },
  preview: `https://cdn.dzcdn.net/${variante}.mp3?exp=${Math.floor(jetzt / 1000) + 360}`, readable: true,
});
const apple = () => ({ trackId: 42, artistName: "Testband", trackName: "Testlied", previewUrl: "https://audio.mzstatic.com/test.m4a", trackViewUrl: "https://music.apple.com/de/song/42" });

test("Nach einem Dienstausfall lässt sich derselbe Ausschnitt erneut laden", async (t) => {
  const z = song();
  let gestoert = true;
  let abrufe = 0;
  t.mock.method(globalThis, "fetch", async (roh: string) => {
    const url = new URL(roh);
    if (url.pathname.startsWith("/track/")) {
      abrufe++;
      return gestoert ? new Response("", { status: 503 }) : Response.json(deezer());
    }
    return Response.json({ data: [], results: [] });
  });
  const token = ausschnittFreigeben(z.id, 30);
  await assert.rejects(ausschnittHolen(token));
  gestoert = false;
  jetzt += 2000;
  const ziel = await ausschnittHolen(token);
  assert.ok(ziel && "url" in ziel);
  assert.equal(abrufe, 2, "Wiederholen muss den Dienst erneut abfragen, ohne Songwechsel");
  freigabeEntziehen(token);
});

test("Ein laufender Ausschnitt erneuert ablaufende Vorschau-Links", async (t) => {
  const z = song();
  let abrufe = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json(deezer(nummer, String(++abrufe))));
  const token = ausschnittFreigeben(z.id, 30);
  const zuerst = await ausschnittHolen(token);
  jetzt += 61_000; // Der erste Link ist jetzt im Sicherheitspuffer vor seinem Ablauf.
  const danach = await ausschnittHolen(token);
  assert.notDeepEqual(danach, zuerst);
  assert.equal(abrufe, 2);
  freigabeEntziehen(token);
});

test("Erneutes Laden erneuert auch einen scheinbar noch gültigen CDN-Link", async (t) => {
  const z = song();
  let abrufe = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json(deezer(nummer, String(++abrufe))));
  const token = ausschnittFreigeben(z.id, 30);
  const zuerst = await ausschnittHolen(token);
  const danach = await ausschnittHolen(token, true);
  assert.notDeepEqual(danach, zuerst);
  assert.equal(abrufe, 2);
  assert.deepEqual(await ausschnittHolen(token, true), danach, "Range-Anfragen lösen keine Abfrageflut aus");
  assert.equal(abrufe, 2);
  freigabeEntziehen(token);
});

test("Eine gescheiterte Erneuerung liefert nicht wieder den verworfenen Link", async (t) => {
  const z = song();
  let gestoert = false;
  let abrufe = 0;
  t.mock.method(globalThis, "fetch", async (roh: string) => {
    if (new URL(roh).pathname.startsWith("/track/")) {
      abrufe++;
      return gestoert ? new Response("", { status: 503 }) : Response.json(deezer(nummer, String(abrufe)));
    }
    return Response.json({ data: [], results: [] });
  });
  const token = ausschnittFreigeben(z.id, 30);
  const zuerst = await ausschnittHolen(token);
  gestoert = true;
  await assert.rejects(ausschnittHolen(token, true));
  gestoert = false;
  const danach = await ausschnittHolen(token);
  assert.equal(abrufe, 3);
  assert.notDeepEqual(danach, zuerst);
  freigabeEntziehen(token);
});

test("Parallele Geräte teilen eine Abfrage; entzogene Freigaben liefern nichts mehr", async (t) => {
  const z = song();
  let antworten!: (r: Response) => void;
  const antwort = new Promise<Response>((resolve) => { antworten = resolve; });
  let abrufe = 0;
  t.mock.method(globalThis, "fetch", () => { abrufe++; return antwort; });
  const token = ausschnittFreigeben(z.id, 30);
  const anfragen = [ausschnittHolen(token), ausschnittHolen(token, true)];
  freigabeEntziehen(token);
  antworten(Response.json(deezer()));
  assert.deepEqual(await Promise.all(anfragen), [null, null]);
  assert.equal(abrufe, 1);
  assert.equal(await ausschnittHolen(token), null);
});

test("Ungültige oder abgelaufene Ausschnitt-Token bleiben gesperrt", async (t) => {
  const z = song();
  t.mock.method(globalThis, "fetch", async () => Response.json(deezer()));
  const token = ausschnittFreigeben(z.id, 30);
  assert.ok(await ausschnittHolen(token));
  jetzt += 30 * 60_000;
  assert.equal(await ausschnittHolen(token, true), null);
  assert.equal(await ausschnittHolen("unbekannt", true), null);
});

test("Entfernte Deezer-Songs bekommen eine passende Apple-Ausweichquelle", async (t) => {
  const z = song();
  const pfade: string[] = [];
  t.mock.method(globalThis, "fetch", async (roh: string) => {
    const url = new URL(roh);
    pfade.push(`${url.hostname}${url.pathname}`);
    if (url.pathname.startsWith("/track/")) return Response.json({ error: { code: 800, message: "no data" } });
    if (url.hostname === "api.deezer.com") return Response.json({ data: [] });
    return Response.json({ results: [apple()] });
  });
  const treffer = await liveTreffer(z);
  assert.equal(treffer.trackId, 42);
  assert.equal(treffer.quelle, undefined);
  assert.ok(pfade.includes("itunes.apple.com/search"));
  assert.equal(songHolen(z.id)?.jahr, z.jahr, "Das Jahr der Spielkarte bleibt unverändert");
  assert.equal(songHolen(z.id)?.pfad, z.pfad, "Die ursprüngliche Quelle bleibt erhalten");
  assert.equal(dienstName(z), "Apple Music", "Quellenhinweis nennt den tatsächlich verwendeten Dienst");
  assert.equal(dienstLink(z), apple().trackViewUrl);
});

test("Eine Ersatzsuche akzeptiert keinen anderen Interpreten", async (t) => {
  const z = song();
  t.mock.method(globalThis, "fetch", async (roh: string) => {
    const url = new URL(roh);
    if (url.pathname.startsWith("/track/")) return Response.json({ id: nummer, preview: "" });
    if (url.hostname === "api.deezer.com") return Response.json({ data: [{ ...deezer(), artist: { name: "Falsche Band" } }] });
    return Response.json({ results: [{ ...apple(), artistName: "Falsche Band" }] });
  });
  await assert.rejects(liveTreffer(z));
});

test("Eine entfernte Apple-ID kann durch denselben Song bei Deezer ersetzt werden", async (t) => {
  const z = song(true);
  t.mock.method(globalThis, "fetch", async (roh: string) => {
    const url = new URL(roh);
    if (url.pathname === "/lookup") return Response.json({ results: [] });
    if (url.hostname === "api.deezer.com") return Response.json({ data: [deezer(99)] });
    throw new Error("Unnötige Abfrage");
  });
  assert.equal((await liveTreffer(z)).trackId, 99);
});

test("Deckprüfung erkennt einen defekten Cache-Link und erneuert ihn vor der Wiedergabe", async (t) => {
  const z = song();
  let abrufe = 0;
  const methoden: string[] = [];
  t.mock.method(globalThis, "fetch", async (roh: string, optionen?: RequestInit) => {
    methoden.push(optionen?.method ?? "GET");
    if (new URL(roh).hostname === "api.deezer.com") return Response.json(deezer(nummer, String(++abrufe)));
    assert.equal(optionen?.method, "HEAD", "Musik wird weder heruntergeladen noch gespeichert");
    return new Response(null, { status: roh.includes("/1.mp3") ? 403 : 200, headers: { "content-type": "audio/mpeg" } });
  });
  const alt = await liveTreffer(z);
  const ergebnis = await vorschauPruefen(z);
  assert.equal(ergebnis.art, "bereit");
  const neu = await liveTreffer(z);
  assert.notEqual(neu.vorschau, alt.vorschau);
  assert.equal(abrufe, 2);
  assert.deepEqual(methoden, ["GET", "HEAD", "GET", "HEAD"]);
  await vorschauPruefen(z);
  assert.equal(methoden.length, 4, "frische Prüfung wird wiederverwendet");
});

test("Defekte Deezer-Hörprobe wird durch eine erreichbare Apple-Hörprobe ersetzt", async (t) => {
  const z = song();
  t.mock.method(globalThis, "fetch", async (roh: string, optionen?: RequestInit) => {
    const url = new URL(roh);
    if (optionen?.method === "HEAD") return new Response(null, { status: url.hostname.endsWith("dzcdn.net") ? 404 : 200, headers: { "content-type": "audio/mp4" } });
    if (url.pathname.startsWith("/track/")) return Response.json(deezer());
    if (url.hostname === "api.deezer.com") return Response.json({ data: [deezer()] });
    return Response.json({ results: [apple()] });
  });
  assert.equal((await vorschauPruefen(z)).art, "bereit");
  assert.equal(dienstName(z), "Apple Music");
  assert.equal((await liveTreffer(z)).vorschau, apple().previewUrl);
});

test("Bestätigt fehlende Songs und vorübergehende Prüffehler bleiben unterscheidbar", async (t) => {
  let kopfStatus = 404;
  t.mock.method(globalThis, "fetch", async (roh: string, optionen?: RequestInit) => {
    if (optionen?.method === "HEAD") return new Response(null, { status: kopfStatus });
    if (new URL(roh).pathname.startsWith("/track/")) return Response.json(deezer());
    return Response.json({ data: [], results: [] });
  });
  assert.equal((await vorschauPruefen(song())).art, "fehlt");
  for (const status of [403, 429, 503, 405]) {
    jetzt += 60_000;
    kopfStatus = status;
    assert.equal((await vorschauPruefen(song())).art, "unklar", `HTTP ${status} sperrt keinen Song`);
  }
});

test("Deckprüfung folgt keinen Weiterleitungen zu fremden Servern", async (t) => {
  const hosts: string[] = [];
  t.mock.method(globalThis, "fetch", async (roh: string, optionen?: RequestInit) => {
    const url = new URL(roh);
    hosts.push(url.hostname);
    if (optionen?.method === "HEAD") return new Response(null, { status: 302, headers: { location: "https://fremd.invalid/audio" } });
    if (url.pathname.startsWith("/track/")) return Response.json(deezer());
    return Response.json({ data: [], results: [] });
  });
  assert.equal((await vorschauPruefen(song())).art, "unklar");
  assert.ok(!hosts.includes("fremd.invalid"));
});

test("Die Wiedergabe wartet nicht auf eine langsame oder nicht unterstützte HEAD-Prüfung", { timeout: 5000 }, async (t) => {
  const z = song();
  let antworten!: (r: Response) => void;
  let gestartet!: () => void;
  const kopf = new Promise<Response>(r => { antworten = r; });
  const anfrage = new Promise<void>(r => { gestartet = r; });
  t.mock.method(globalThis, "fetch", async (roh: string, optionen?: RequestInit) => {
    if (optionen?.method === "HEAD") { gestartet(); return kopf; }
    if (new URL(roh).pathname.startsWith("/track/")) return Response.json(deezer());
    return Response.json({ data: [], results: [] });
  });
  const vorher = await liveTreffer(z);
  const pruefung = vorschauPruefen(z);
  await anfrage;
  assert.deepEqual(await liveTreffer(z), vorher, "Wiedergabe muss vor der HEAD-Antwort weitergehen");
  antworten(new Response(null, { status: 405 }));
  assert.equal((await pruefung).art, "unklar");
  assert.deepEqual(await liveTreffer(z), vorher, "HEAD-Fehler sperrt keinen nutzbaren Link");
});

test("Eine verspätete Deckprüfung überschreibt keinen inzwischen erneuerten Link", async (t) => {
  const z = song();
  let antworten!: (r: Response) => void;
  let gestartet!: () => void;
  let abrufe = 0;
  const kopf = new Promise<Response>(r => { antworten = r; });
  const anfrage = new Promise<void>(r => { gestartet = r; });
  t.mock.method(globalThis, "fetch", async (_roh: string, optionen?: RequestInit) => {
    if (optionen?.method === "HEAD") { gestartet(); return kopf; }
    return Response.json(deezer(nummer, String(++abrufe)));
  });
  const alt = await liveTreffer(z);
  const pruefung = vorschauPruefen(z);
  await anfrage;
  const neu = await liveTreffer(z, true);
  assert.notEqual(neu.vorschau, alt.vorschau);
  antworten(new Response(null, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  await pruefung;
  assert.equal((await liveTreffer(z)).vorschau, neu.vorschau);
});
