// Ende-zu-Ende: echter Server, Testmusik, Host + 2 Spieler über Socket.IO.
// Aufruf: npm run test:e2e (erzeugt die Testmusik bei Bedarf, braucht ffmpeg)
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { io as ioClient, type Socket } from "socket.io-client";

const PORT = 3791;
const BASIS = `http://127.0.0.1:${PORT}`;
const wurzel = path.resolve(import.meta.dirname, "..");
const daten = fs.mkdtempSync(path.join(os.tmpdir(), "zs-e2e-"));
// Testmusik (Sinustöne) außerhalb des Repos, einmal erzeugt und dann wiederverwendet
const musik = path.resolve(process.env.E2E_MUSIK ?? path.join(os.tmpdir(), "zs-testmusik"));
execFileSync("sh", [path.join(wurzel, "test", "testmusik.sh"), musik], { stdio: "inherit" });

const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.ts"], {
  cwd: wurzel,
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", ZEITSTRAHL_DATEN: daten, ZEITSTRAHL_MUSIK: musik, NODE_ENV: "test",
    // mit Passwortpflicht (prüft auch die Zugangssperre); Runden stark verkürzt
    ZEITSTRAHL_ZUGANG: "passwort", ZEITSTRAHL_PASSWORT: "", ZEITSTRAHL_ADMIN_PASSWORT: "",
    ZEITSTRAHL_WEITER_MS: "300", ZEITSTRAHL_VORLAUF_MS: "300", ZEITSTRAHL_AUSSCHNITT_MS: "1500", ZEITSTRAHL_OFFLINE_MS: "300" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function warten(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASIS}/healthz`);
      const j = (await r.json()) as { songs: number };
      if (j.songs >= 20) return;
    } catch {
      /* noch nicht da */
    }
    await pause(200);
  }
  throw new Error("Server nicht bereit:\n" + log);
}

async function login(passwort: string): Promise<string> {
  const r = await fetch(`${BASIS}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwort }) });
  assert.equal(r.status, 200, `Login ${passwort}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

function client(cookie: string): Socket & { frag: (e: string, d?: unknown) => Promise<any>; letzter: any } {
  const s = ioClient(BASIS, { transports: ["websocket"], extraHeaders: { Cookie: cookie } }) as any;
  s.letzter = null;
  s.on("zustand", (z: unknown) => (s.letzter = z));
  s.on("bereit", (antwort: unknown) => typeof antwort === "function" && antwort(true)); // Handshake vor dem nächsten Song
  s.frag = (e: string, d?: unknown) =>
    new Promise((res, rej) => s.timeout(5000).emit(e, d ?? {}, (err: Error, a: any) => (err ? rej(err) : a.ok ? res(a) : rej(new Error(a.fehler)))));
  return s;
}

async function bis<T>(fn: () => T | undefined | null | false, ms = 5000): Promise<T> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    const v = fn();
    if (v) return v;
    await pause(30);
  }
  throw new Error("Zeitüberschreitung");
}

try {
  await warten();

  // Mit Passwortpflicht: ohne Login keine API; Startseite indexierbar, Spielräume und API nicht
  assert.equal((await fetch(`${BASIS}/api/bibliothek`)).status, 401);
  assert.equal((await fetch(`${BASIS}/api/login`, { method: "POST", body: '{"passwort":"falsch"}' })).status, 401);
  const robots = await fetch(`${BASIS}/robots.txt`);
  assert.match(await robots.text(), /Disallow: \/api\//);
  assert.equal(robots.headers.get("x-robots-tag"), null);
  assert.equal((await fetch(`${BASIS}/host.html`)).headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await fetch(`${BASIS}/api/bibliothek`)).headers.get("x-robots-tag"), "noindex, nofollow");

  const cookie = await login("zeitstrahl");
  const bib = (await (await fetch(`${BASIS}/api/bibliothek`, { headers: { Cookie: cookie } })).json()) as { mitJahr: number };
  assert.ok(bib.mitJahr >= 20, "Testmusik eingelesen");

  // eigene Musikdateien spielt nur ein Admin-Raum (sonst nur Apple-/Deezer-Vorschauen)
  const admin = await login("admin");
  const host = client(admin);
  const anna = client(cookie);
  const ben = client(cookie);
  await bis(() => host.connected && anna.connected && ben.connected);

  const { code, hostSitzung } = await host.frag("host:erstellen", { einstellungen: { zielKarten: 10, auffuellen: false, nichtErraten: "weg" } });
  assert.match(code, /^[A-Z0-9]{4}$/);
  const a = await anna.frag("spieler:beitreten", { code, name: "Anna" });
  await ben.frag("spieler:beitreten", { code, name: "Ben" });
  await assert.rejects(ben.frag("spieler:beitreten", { code, name: "anna" }), /gibt es schon/);
  await assert.rejects(anna.frag("host:starten"), /Nur der Host/);
  assert.equal((await fetch(`${BASIS}/api/raum?code=${code}`, { headers: { Cookie: cookie } })).status, 200);

  // Lobby: „Ich bin fertig“ kommt beim Hauptbildschirm an
  await anna.frag("spieler:bereit", { bereit: true });
  await bis(() => host.letzter?.spieler?.find((p: { id: string }) => p.id === a.spielerId)?.bereit === true);
  await anna.frag("spieler:bereit", { bereit: false });
  await bis(() => host.letzter?.spieler?.find((p: { id: string }) => p.id === a.spielerId)?.bereit === false);

  const qr = await fetch(`${BASIS}/api/qr?raum=${code}`, { headers: { Cookie: cookie } });
  assert.match(await qr.text(), /<svg/);

  // Einladungslink (QR): nur der Host sieht den Token; ohne Passwort gültig, falscher Token 403
  const einladung = (await bis(() => host.letzter?.einladung && host.letzter)).einladung as string;
  assert.equal((await bis(() => anna.letzter)).einladung, null, "Spieler sehen den Einladungs-Token nicht");
  const falsch = await fetch(`${BASIS}/api/einladung`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raum: code, einladung: "x".repeat(einladung.length) }) });
  assert.equal(falsch.status, 403);
  const richtig = await fetch(`${BASIS}/api/einladung`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raum: code, einladung }) });
  assert.equal(richtig.status, 200);
  const gastCookie = (richtig.headers.get("set-cookie") ?? "").split(";")[0];
  assert.equal((await fetch(`${BASIS}/api/bibliothek`, { headers: { Cookie: gastCookie } })).status, 200, "Einladung meldet an");
  assert.equal((await fetch(`${BASIS}/api/admin/status`, { headers: { Cookie: gastCookie } })).status, 403, "Einladung gibt keine Admin-Rechte");

  await host.frag("host:starten");
  const z1 = await bis(() => host.letzter?.phase === "hoeren" && host.letzter, 15_000);
  assert.ok(z1.ausschnitt, "Host bekommt Ausschnitt-URL");
  const annaSicht = await bis(() => anna.letzter?.phase === "hoeren" && anna.letzter);
  assert.equal(annaSicht.ausschnitt, null, "Spieler bekommt im Host-Modus keine URL");
  assert.ok(!JSON.stringify(annaSicht).includes("sitzung"), "keine Sitzungstoken an Clients");

  // Audio: echtes MP3 ohne ID3-Tag, Range funktioniert, ohne Cookie verboten
  const audio = await fetch(`${BASIS}${z1.ausschnitt}`, { headers: { Cookie: cookie } });
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  const bytes = Buffer.from(await audio.arrayBuffer());
  assert.ok(bytes.length > 20_000, `Ausschnitt groß genug (${bytes.length})`);
  assert.notEqual(bytes.subarray(0, 3).toString(), "ID3", "keine Metadaten im Ausschnitt");
  assert.ok(!bytes.includes(Buffer.from("Testsong")), "Titel nicht im Ausschnitt");
  const teil = await fetch(`${BASIS}${z1.ausschnitt}`, { headers: { Cookie: cookie, Range: "bytes=0-99" } });
  assert.equal(teil.status, 206);
  assert.equal((await teil.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${BASIS}${z1.ausschnitt}`)).status, 401);

  // Spiel durchspielen (Modus „alle“): beide legen jede Karte an Position 0; falsche Karten gehen weg, also endet es spätestens mit leerem Stapel
  let runden = 0;
  while (host.letzter.phase !== "ende" && runden < 60) {
    const z = await bis(() => (host.letzter.phase === "hoeren" || host.letzter.phase === "ende") && host.letzter, 15_000);
    if (z.phase === "ende") break;
    for (const s of [anna, ben]) await s.frag("spieler:legen", { position: 0 });
    await assert.rejects(anna.frag("spieler:legen", { position: 0 }), /schon/);
    const r = await bis(() => (host.letzter.phase === "aufloesung" || host.letzter.phase === "ende") && host.letzter, 15_000);
    if (r.phase === "aufloesung") {
      assert.ok(r.ergebnis && typeof r.ergebnis.karte.jahr === "number");
      assert.equal(r.ergebnisse?.length, 2, "ein Ergebnis je Spieler");
    }
    if (runden === 0) {
      // erste Auflösung: alter Ausschnitt ist verbrannt
      assert.equal((await fetch(`${BASIS}${z1.ausschnitt}`, { headers: { Cookie: cookie } })).status, 404);
    }
    await bis(() => host.letzter.phase !== "aufloesung", 15_000);
    runden++;
  }
  assert.equal(host.letzter.phase, "ende", "Spiel endet");
  assert.ok(host.letzter.gewinner.length >= 1);
  console.log(`  Spiel nach ${runden} Runden beendet, Gewinner: ${host.letzter.gewinner.length}`);

  // Details/Cover/Quelle nur für aufgedeckte Songs (im Zeitstrahl), nicht für die übrige Bibliothek
  const offenIds = new Set<string>(host.letzter.spieler.flatMap((p: { zeitstrahl: Array<{ songId: string }> }) => p.zeitstrahl.map((k) => k.songId)));
  const offenId = [...offenIds][0];
  assert.equal((await fetch(`${BASIS}/api/details/${offenId}`, { headers: { Cookie: cookie } })).status, 200, "aufgedeckter Song: Details");
  const alleSongs = (await (await fetch(`${BASIS}/api/admin/songs?filter=alle`, { headers: { Cookie: admin } })).json()) as Array<{ id: string }>;
  const verdeckt = alleSongs.find((x) => !offenIds.has(x.id))!;
  for (const pfad of ["details", "quelle", "cover"]) {
    assert.equal((await fetch(`${BASIS}/api/${pfad}/${verdeckt.id}`, { headers: { Cookie: cookie } })).status, 404, `nicht aufgedeckter Song: /api/${pfad}`);
  }
  console.log("  Details/Cover/Quelle nur für aufgedeckte Songs");

  // Reconnect: neuer Socket mit Sitzungstoken landet beim selben Spieler
  const anna2 = client(cookie);
  await bis(() => anna2.connected);
  const r2 = await anna2.frag("spieler:beitreten", { code, sitzung: a.sitzung });
  assert.equal(r2.spielerId, a.spielerId);
  // Host-Reconnect
  const host2 = client(admin);
  await bis(() => host2.connected);
  await host2.frag("host:verbinden", { code, hostSitzung });
  await assert.rejects(host2.frag("host:verbinden", { code, hostSitzung: "falsch" }));

  await host.frag("host:revanche");
  await bis(() => host.letzter.phase === "lobby");

  // Bibliothekspflege nur mit Admin-Passwort
  assert.equal((await fetch(`${BASIS}/api/admin/status`, { headers: { Cookie: cookie } })).status, 403, "Spieler-Passwort reicht nicht");
  assert.equal((await fetch(`${BASIS}/api/admin/status`, { headers: { Cookie: admin } })).status, 200);

  // Decks: eigenes Deck anlegen, Songs hinzufügen/entfernen, erscheint in der Übersicht, Gast darf nicht
  const post = (c: string, pfad: string, daten: unknown) =>
    fetch(`${BASIS}${pfad}`, { method: "POST", headers: { Cookie: c, "Content-Type": "application/json" }, body: JSON.stringify(daten) });
  assert.equal((await post(gastCookie, "/api/admin/decks", { name: "Gast" })).status, 403, "Gast legt keine Decks an");
  const neu = (await (await post(admin, "/api/admin/decks", { name: "Test-Deck" })).json()) as { id: string };
  assert.match(neu.id, /^deck-[a-f0-9]{12}$/);
  // Testmusik liegt als Dateien vor; neue Decks spielen sonst über Streaming
  assert.equal((await post(admin, `/api/admin/listen/${neu.id}/audio`, { audio: "dateien" })).status, 200);
  const songs = ((await (await fetch(`${BASIS}/api/admin/songs?filter=alle`, { headers: { Cookie: admin } })).json()) as Array<{ id: string; pfad: string }>)
    .filter((s) => !s.pfad.startsWith("@apple/"));
  assert.ok(songs.length >= 20);
  assert.equal((await post(admin, `/api/admin/decks/${neu.id}/songs`, { hinzu: songs.slice(0, 5).map((s) => s.id) })).status, 200);
  await post(admin, `/api/admin/decks/${neu.id}/songs`, { weg: [songs[0].id] });
  const deckDaten = (await (await fetch(`${BASIS}/api/admin/decks/${neu.id}`, { headers: { Cookie: admin } })).json()) as { eintraege: unknown[] };
  assert.equal(deckDaten.eintraege.length, 4, "4 Songs im Deck");
  const uebersicht = (await (await fetch(`${BASIS}/api/bibliothek`, { headers: { Cookie: cookie } })).json()) as { listen: Array<{ id: string; treffer: number }> };
  assert.equal(uebersicht.listen.find((l) => l.id === neu.id)?.treffer, 4, "Deck steht zur Auswahl");
  assert.equal((await post(admin, `/api/admin/decks/${neu.id}/loeschen`, {})).status, 200);
  console.log("  Decks: anlegen, bearbeiten, Auswahl, löschen ok");

  const kor = await post(admin, `/api/admin/songs/${songs[0].id}`, { manuellJahr: 1999 });
  assert.equal(((await kor.json()) as { jahr: number }).jahr, 1999);

  // Pfad-Traversal im statischen Teil
  assert.equal((await fetch(`${BASIS}/..%2f..%2fpackage.json`)).status, 404);

  // Pause → Demo: Ist der einzige echte Spieler weg, hält der Raum nach 3 Runden an; der TV darf ihn dann zur Demo machen
  const host3 = client(admin);
  const cleo = client(cookie);
  await bis(() => host3.connected && cleo.connected);
  const r3 = await host3.frag("host:erstellen", { einstellungen: { zielKarten: 10, auffuellen: true } });
  await cleo.frag("spieler:beitreten", { code: r3.code, name: "Cleo" });
  await host3.frag("host:starten");
  await bis(() => host3.letzter?.phase === "hoeren", 15_000);
  await assert.rejects(host3.frag("host:demo"), /leeren Lobby/, "laufendes Spiel mit Spieler: keine Demo");
  cleo.close();
  const pausiert = await bis(() => host3.letzter?.phase === "aufloesung" && host3.letzter.wartetAuf && !host3.letzter.wartenBis && host3.letzter, 40_000);
  assert.deepEqual(pausiert.wartetAuf, ["Cleo (offline)"]);
  await host3.frag("host:demo");
  const demo = await bis(() => host3.letzter?.demo && host3.letzter.phase !== "lobby" && host3.letzter, 15_000);
  assert.ok(demo.spieler.every((p: { bot?: string }) => p.bot), "Demo nur mit Bots");
  assert.equal(demo.wartetAuf, null);
  console.log(`  Pause nach ${pausiert.runde} Runden → Demo (${demo.spieler.length} Bots)`);
  await host3.frag("host:beenden");

  // Grenzen je IP: falsche Codes und Code-Prüfung über HTTP werden gebremst
  const rater = client(cookie);
  await bis(() => rater.connected);
  let gesperrt = false;
  for (let i = 0; i < 25 && !gesperrt; i++) {
    await rater.frag("spieler:beitreten", { code: "ZZZZ", name: `R${i}` }).catch((e: Error) => (gesperrt = /Zu viele/.test(e.message)));
  }
  assert.ok(gesperrt, "zu viele falsche Codes werden gesperrt");
  let status = 0;
  for (let i = 0; i < 35 && status !== 429; i++) status = (await fetch(`${BASIS}/api/raum?code=ZZZZ`, { headers: { Cookie: cookie } })).status;
  assert.equal(status, 429, "Code-Prüfung über HTTP gebremst");
  console.log("  Grenzen: falsche Codes und /api/raum gebremst");

  await host.frag("host:beenden");
  for (const s of [host, anna, ben, anna2, host2, rater, host3, cleo]) s.close();
  console.log("E2E: alles grün");
} catch (err) {
  console.error("E2E FEHLER:", err, "\n--- Server-Log ---\n" + log.slice(-6000));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  fs.rmSync(daten, { recursive: true, force: true });
  // offene Sockets nach einem Fehler sollen den Lauf nicht festhalten
  process.exit();
}
