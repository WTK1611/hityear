// Räume + Echtzeit (Socket.IO). Jeder Client bekommt einen auf ihn gefilterten
// Zustand; die verdeckte Karte verlässt den Server erst bei der Auflösung.
import { codeGesperrt } from "./sperrcodes.ts";
import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import { db } from "./db.ts";
import {
  aktiverSpieler, alleGleichzeitig, auswerten, bereit, botHinzufuegen, botsDazu, type BotStufe, botZug, eingeben, ratenAbgeben, grenzen, naechsterZug, revanche, sicht, songTauschen, spielEntschieden, spielerEntfernen, zeitAbgelaufen,
  spielerHinzufuegen, starten, SpielFehler, STANDARD_EINSTELLUNGEN, type Einstellungen, type Karte, type Spiel,
} from "./game.ts";
import { alsGespieltMarkieren, anzahlVerfuegbar, songHolen, stapelZiehen } from "./bibliothek.ts";
import { ausschnittFreigeben, freigabeEntziehen } from "./audio.ts";
import { clientIp } from "./auth.ts";
import { rolleAusAnfrage, rolleAusAppSitzung } from "./app.ts";
import { dienstName } from "./vorschau.ts";
import { beiNeuenSongs, fehlendeNachladen } from "./apple.ts";
import { listenSongIds, listenUebersicht } from "./listen.ts";
import { bestenliste, spielEintragen } from "./bestenliste.ts";
import { diagnose } from "./log.ts";

// nur Admin-Räume dürfen eigene Dateien (Musikordner, Uploads) spielen; alle anderen nur Apple/Deezer zum Streamen
const auswahl = (s: Spiel) => ({ ...s.einstellungen, songIds: s.einstellungen.liste ? listenSongIds(s.einstellungen.liste) : null, nurStreaming: !s.privat });

// ohne Verwechsler: kein O/0, I/1, S/5, Z/2, B/8
const CODE_ZEICHEN = "ACDEFGHJKLMNPQRTUVWXY2345679";
const VERWECHSLER: Record<string, string> = { S: "5", Z: "2", B: "8", O: "0", I: "1" };

/** Sucht einen Raum zum eingegebenen Code – verzeiht S/5, Z/2, B/8. */
/** Raum für Mitspieler (Beitritt, Einladung, Status) – Demo-Räume gibt es für sie nicht */
function raumFinden(code: unknown): Spiel | undefined {
  const c = String(code ?? "").toUpperCase().trim();
  const kandidaten = [c, c.replace(/[SZBOI]/g, (z) => VERWECHSLER[z]), c.replace(/[52801]/g, (z) => Object.keys(VERWECHSLER).find((k) => VERWECHSLER[k] === z)!)];
  for (const k of kandidaten) {
    const s = raeume.get(k);
    if (s) return s.demo ? undefined : s;
  }
  return undefined;
}
const FARBEN = ["#ff5d73", "#ffb347", "#ffe066", "#4cd4a0", "#4db8ff", "#b48cff"];

const raeume = new Map<string, Spiel>();
/** Laufender Ausschnitt pro Raum (Token, nur für den aktuellen Zug gültig). */
const ausschnitte = new Map<string, string>();

let io: Server;

function zufallsCode(): string {
  let c = "";
  do {
    c = Array.from({ length: 4 }, () => CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)]).join("");
  } while (raeume.has(c) || codeGesperrt(c)); // keine anstößigen Codes (sperrcodes.ts)
  return c;
}

const token = () => crypto.randomBytes(18).toString("base64url");
/** Kurzer Einladungsschlüssel (48 Bit) – hält den QR-Code grob; Raten bremst das Login-Limit, der Raum lebt nur kurz. */
const einladungToken = () => crypto.randomBytes(6).toString("base64url");

// ---------- Persistenz (Snapshot in SQLite, überlebt Neustarts) ----------
const speichernStmt = db.prepare(
  "INSERT INTO spiele (code, zustand, geaendert) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET zustand = excluded.zustand, geaendert = excluded.geaendert",
);

function speichern(s: Spiel): void {
  speichernStmt.run(s.code, JSON.stringify(s), s.geaendert);
}

export function raeumeLaden(): void {
  const grenze = Date.now() - 1000 * 60 * 60 * 24 * 2;
  db.prepare("DELETE FROM spiele WHERE geaendert < ?").run(grenze);
  for (const r of db.prepare("SELECT zustand FROM spiele").all() as Array<{ zustand: string }>) {
    const s = JSON.parse(r.zustand) as Spiel;
    for (const p of s.spieler) p.verbunden = Boolean(p.bot); // Bots sind immer „da“
    if (!s.einladung) s.einladung = einladungToken();
    s.einstellungen = grenzen({ ...STANDARD_EINSTELLUNGEN, ...s.einstellungen }); // neue Optionen nachrüsten
    raeume.set(s.code, s);
    zugVorbereiten(s); // Ausschnitt-Token sind nach Neustart weg → neu freigeben
    autoWeiter(s);
  }
}

/** Raum samt Timern, Freigaben und Snapshot entfernen. */
function raumWeg(s: Spiel): void {
  fristStoppen(s);
  const lauf = weiterTimer.get(s.code);
  if (lauf) clearTimeout(lauf.t);
  weiterTimer.delete(s.code);
  warten.delete(s.code);
  freigabeEntziehen(ausschnitte.get(s.code));
  ausschnitte.delete(s.code);
  vorspielWeg(s);
  staende.delete(s.code);
  raeume.delete(s.code);
  db.prepare("DELETE FROM spiele WHERE code = ?").run(s.code);
}

// Aufräumen: verlassene Räume (niemand mehr verbunden) fliegen raus – Lobby und Endseite nach 2 h,
// laufende Spiele nach 2 Tagen (wie beim Laden; so kann man nach einer Pause weiterspielen)
const STUNDE = 60 * 60_000;
setInterval(() => {
  const jetzt = Date.now();
  for (const s of [...raeume.values()]) {
    if (s.spieler.some((p) => !p.bot && p.verbunden)) continue;
    const ruhig = jetzt - s.geaendert;
    if (ruhig > 48 * STUNDE || ((s.phase === "lobby" || s.phase === "ende") && ruhig > 2 * STUNDE)) raumWeg(s);
  }
}, 10 * 60_000).unref();

// ---------- Grenzen je IP (offenes Netz: keine Raumflut, kein Durchprobieren von Codes) ----------
const MAX_RAEUME = 500;
const zaehler = new Map<string, number[]>(); // „art|ip“ → Zeitpunkte im Fenster
/** true = noch erlaubt (und gezählt); false = Grenze erreicht. */
function erlaubt(art: string, ip: string, max: number, fensterMs: number): boolean {
  const k = `${art}|${ip}`;
  const jetzt = Date.now();
  const liste = (zaehler.get(k) ?? []).filter((t) => jetzt - t < fensterMs);
  if (liste.length >= max) {
    zaehler.set(k, liste);
    return false;
  }
  liste.push(jetzt);
  zaehler.set(k, liste);
  return true;
}
setInterval(() => {
  const jetzt = Date.now();
  for (const [k, liste] of zaehler) if (!liste.some((t) => jetzt - t < 60 * 60_000)) zaehler.delete(k);
}, 10 * 60_000).unref();

// ---------- Senden ----------
interface SocketDaten {
  code?: string;
  spielerId?: string;
  hostSitzung?: string;
}

/** Host-Rechte gelten nur mit der bestätigten Sitzung des aktuellen Raums. */
function istHost(s: Spiel, d: SocketDaten): boolean {
  return d.code === s.code && d.hostSitzung === s.hostSitzung;
}

function ausschnittUrlFuer(s: Spiel, d: SocketDaten): string | null {
  if (s.phase !== "hoeren") return null;
  const t = ausschnitte.get(s.code);
  if (!t) return null;
  const w = s.einstellungen.wiedergabe;
  if (w === "host" && istHost(s, d)) return `/api/audio/${t}`;
  if ((w === "alle" || w === "solo") && d.spielerId) return `/api/audio/${t}`;
  // Modus „alle“: „Handy, wer dran ist“ heißt jedes Handy
  if (w === "spieler" && d.spielerId && (alleGleichzeitig(s) || d.spielerId === aktiverSpieler(s)?.id)) return `/api/audio/${t}`;
  return null;
}

/** Nach der Auflösung geht es nach 10 s von selbst weiter (kein Überspringen – alle sehen die Auflösung gleich lang). */
const AUTO_WEITER_MS = Number(process.env.ZEITSTRAHL_WEITER_MS) || 10_000; // Tests: kürzer
const weiterTimer = new Map<string, { zug: unknown; t: ReturnType<typeof setTimeout> }>();

function autoWeiter(s: Spiel): void {
  // Sieg steht fest → gleich Siegerehrung und Bestenliste statt Countdown zum nächsten Song
  if (spielEntschieden(s)) naechsterZug(s);
  const lauf = weiterTimer.get(s.code);
  if (s.phase !== "aufloesung" || !s.zug) {
    if (lauf) clearTimeout(lauf.t);
    weiterTimer.delete(s.code);
    return;
  }
  if (lauf?.zug === s.zug) return;
  if (lauf) clearTimeout(lauf.t);
  s.zug.weiterUm ??= Date.now() + AUTO_WEITER_MS;
  const zug = s.zug;
  const t = setTimeout(async () => {
    const aktuell = () => raeume.get(s.code) === s && s.zug === zug && s.phase === "aufloesung";
    if (!aktuell()) return void weiterTimer.delete(s.code);
    // niemand (außer Bots) mehr da (Handy gesperrt, Safari im Hintergrund): TV zeigt „Warte auf …“ mit Countdown;
    // kommt jemand zurück, geht es sofort weiter, sonst nach OFFLINE_WARTEN_MS trotzdem. Nach OFFLINE_RUNDEN Runden
    // ohne einen echten Spieler pausiert das Spiel ganz; sobald jemand zurückkommt, geht es per senden() weiter.
    // (ein reines Bot-Spiel läuft einfach durch)
    const keinerDa = () => s.spieler.some((p) => !p.bot) && !s.spieler.some((p) => !p.bot && p.verbunden);
    if (keinerDa()) {
      const runden = offlineRunden.get(s.code) ?? 0;
      if (runden >= OFFLINE_RUNDEN) {
        warten.set(s.code, s.spieler.filter((p) => !p.bot).map((p) => `${p.name} (offline)`));
        wartenBis.delete(s.code);
        senden(s);
        return void weiterTimer.delete(s.code);
      }
      const bis = Date.now() + OFFLINE_WARTEN_MS;
      warten.set(s.code, s.spieler.filter((p) => !p.bot).map((p) => `${p.name} (offline)`));
      wartenBis.set(s.code, bis);
      diagnose("bereit", `${s.code} alle offline, wartet ${OFFLINE_WARTEN_MS / 1000} s (Runde ${runden + 1}/${OFFLINE_RUNDEN})`);
      senden(s);
      while (aktuell() && keinerDa() && Date.now() < bis) await new Promise((r) => setTimeout(r, 300));
      wartenBis.delete(s.code);
      warten.delete(s.code);
      if (!aktuell()) return void weiterTimer.delete(s.code);
      offlineRunden.set(s.code, keinerDa() ? runden + 1 : 0);
    } else offlineRunden.delete(s.code);
    // Handshake: Der Eintrag in weiterTimer bleibt währenddessen stehen, damit senden() keinen zweiten Wechsel plant
    await alleBereit(s, aktuell);
    weiterTimer.delete(s.code);
    warten.delete(s.code);
    if (!aktuell()) return;
    naechsterZug(s);
    zugVorbereiten(s);
    senden(s);
  }, Math.max(0, s.zug.weiterUm - Date.now()));
  t.unref();
  weiterTimer.set(s.code, { zug, t });
}

// ---------- Handshake vor dem nächsten Song ----------
// Jedes Handy muss „bereit“ bestätigen, bevor der nächste Song startet. Antwortet ein Handy nicht
// (iOS hält die Seite an, Funkloch), wartet der Raum höchstens BEREIT_MAX_MS und geht dann weiter.
// Nach 1 s Warten zeigen alle Geräte, auf wen gewartet wird.
const BEREIT_MAX_MS = 10_000;
const BEREIT_ANTWORT_MS = 1500;
/** Raum → Namen der Spieler, auf die gerade gewartet wird */
const warten = new Map<string, string[]>();
/** Raum → bis wann auf offline Spieler gewartet wird (Countdown am TV), danach geht es ohne sie weiter */
const wartenBis = new Map<string, number>();
/** Raum → Runden in Folge, die ohne einen verbundenen echten Spieler weitergingen */
const offlineRunden = new Map<string, number>();
const OFFLINE_WARTEN_MS = Number(process.env.ZEITSTRAHL_OFFLINE_MS) || 15_000;
const OFFLINE_RUNDEN = 3;

async function alleBereit(s: Spiel, aktuell: () => boolean): Promise<void> {
  const start = Date.now();
  const bestaetigt = new Set<string>();
  let angezeigt = false;
  while (aktuell() && Date.now() - start < BEREIT_MAX_MS) {
    const offen = s.spieler.filter((p) => !p.bot && p.verbunden && !bestaetigt.has(p.id));
    if (!offen.length) break;
    const ids = new Set(offen.map((p) => p.id));
    const socks = (await io.in(s.code).fetchSockets()).filter((k) => ids.has((k.data as SocketDaten).spielerId ?? ""));
    const runde = Promise.all(
      socks.map((k) =>
        k.timeout(BEREIT_ANTWORT_MS).emitWithAck("bereit").then(
          () => void bestaetigt.add((k.data as SocketDaten).spielerId ?? ""),
          () => undefined,
        ),
      ),
    );
    // ohne Socket (gerade getrennt): kurz warten, ob er zurückkommt
    await (socks.length ? runde : new Promise((r) => setTimeout(r, 500)));
    const nochOffen = offen.filter((p) => !bestaetigt.has(p.id) && p.verbunden);
    if (nochOffen.length && !angezeigt && Date.now() - start >= 1000 && aktuell()) {
      angezeigt = true;
      warten.set(s.code, nochOffen.map((p) => p.name));
      diagnose("bereit", `${s.code} wartet auf ${nochOffen.map((p) => p.name).join(", ")}`);
      senden(s);
    }
  }
  const dauer = Date.now() - start;
  if (angezeigt || dauer > 1000) diagnose("bereit", `${s.code} weiter nach ${dauer} ms${bestaetigt.size ? "" : " (ohne Bestätigung)"}`);
}

/** Spiel starten; freie Plätze übernehmen Bots (Option „auffüllen“) – genau die, die die Lobby angekündigt hat */
function mitBotsStarten(s: Spiel): void {
  const stapel = stapelZiehen(auswahl(s));
  const neueBots: string[] = [];
  for (const b of botsDazu(s)) neueBots.push(botHinzufuegen(s, b.stufe, crypto.randomBytes(6).toString("base64url"), freieFarbe(s), Math.random, b).id);
  try {
    starten(s, stapel);
  } catch (err) {
    for (const id of neueBots) spielerEntfernen(s, id); // Start klappt nicht → Lobby wie vorher
    throw err;
  }
  vorspielPlanen(s);
  zugVorbereiten(s);
  senden(s);
}

// ---------- Demo-Modus ----------
// Zufälliges Deck mit genug spielbaren Songs (oder alle Songs), Bots füllen alle Plätze, Revanche nach dem Ende.
const DEMO_NEUSTART_MS = 25_000;
const demoTimer = new Map<string, ReturnType<typeof setTimeout>>();

function demoStarten(s: Spiel): void {
  const decks = listenUebersicht().filter((l) => l.treffer >= 60);
  const deck = Math.random() < 1 / (decks.length + 1) ? null : decks[Math.floor(Math.random() * decks.length)]?.id ?? null;
  for (const p of s.spieler.filter((q) => q.bot)) spielerEntfernen(s, p.id);
  s.einstellungen = grenzen({
    ...s.einstellungen, liste: deck, jahrzehnte: [], genres: [], nurChartHits: false, modus: "alle", warten: "alle",
    zeitlimit: true, raten: false, auffuellen: true, ohneBots: [], wiedergabe: "host", zielKarten: 10,
  });
  s.botPlan = undefined;
  s.geaendert = Date.now();
  diagnose("demo", `${s.code} startet mit ${deck ?? "allen Songs"}`);
  mitBotsStarten(s);
}

function demoNeustartPlanen(s: Spiel): void {
  if (demoTimer.has(s.code)) return;
  const t = setTimeout(async () => {
    demoTimer.delete(s.code);
    if (raeume.get(s.code) !== s || !s.demo || s.phase !== "ende") return;
    // läuft am TV nichts mehr (Seite zu), endet die Demo
    const socks = await io.in(s.code).fetchSockets();
    if (!socks.some((k) => istHost(s, k.data as SocketDaten))) return void raumWeg(s);
    revanche(s);
    try {
      demoStarten(s);
    } catch (err) {
      diagnose("demo", `${s.code} Neustart fehlgeschlagen: ${(err as Error).message}`, true);
      senden(s);
    }
  }, DEMO_NEUSTART_MS);
  t.unref();
  demoTimer.set(s.code, t);
}

// Laufende Nummer je Raum: jedes Senden zählt hoch – Geräte gleichen sie ab und holen Verpasstes nach
const staende = new Map<string, number>();

function zustandFuer(s: Spiel, d: SocketDaten, basis = { ...sicht(s), bestenliste: s.phase === "ende" ? bestenliste(5) : null }, verfuegbar = s.phase === "lobby" ? anzahlVerfuegbar(auswahl(s)) : null, stand = staende.get(s.code) ?? 0) {
  return {
    ...basis,
    stand,
    wartetAuf: s.phase === "aufloesung" ? warten.get(s.code) ?? null : null,
    wartenBis: s.phase === "aufloesung" ? wartenBis.get(s.code) ?? null : null,
    um: Date.now(), // Sendezeit (Serveruhr): Geräte melden damit zu späte Zustände
    ich: d.spielerId ?? null,
    host: istHost(s, d),
    ausschnitt: ausschnittUrlFuer(s, d),
    // Dienst der laufenden Hörprobe für den Quellenhinweis (Apple/Deezer verlangen ihn auch während des Abspielens)
    quelle: s.phase === "hoeren" && s.zug ? dienstName(songHolen(s.zug.karte.songId)) : null,
    vorspiel: vorspielFuer(s, d),
    // nur die eigene Lücke (bis zur Auflösung sieht niemand die der anderen) – überlebt auch Neuladen
    meinTipp: s.phase === "hoeren" && d.spielerId ? s.zug?.gelegt?.[d.spielerId] ?? null : null,
    einladung: istHost(s, d) ? s.einladung : null,
    verfuegbar,
  };
}

// neue Songs (Streaming-Nachladen) → Lobbys zeigen die neue Songzahl
beiNeuenSongs.add(() => {
  for (const s of raeume.values()) if (s.phase === "lobby") senden(s);
});

function senden(s: Spiel): void {
  autoWeiter(s);
  if (!s.demo) spielEintragen(s);
  if (s.demo && s.phase === "ende") demoNeustartPlanen(s);
  speichern(s);
  staende.set(s.code, (staende.get(s.code) ?? 0) + 1);
  const basis = { ...sicht(s), bestenliste: s.phase === "ende" ? bestenliste(5) : null };
  const verfuegbar = s.phase === "lobby" ? anzahlVerfuegbar(auswahl(s)) : null;
  // Stand jetzt festhalten: kommt bis zum Ausliefern schon das nächste senden(), passt die Nummer sonst nicht zum Inhalt
  const stand = staende.get(s.code) ?? 0;
  void io
    .in(s.code)
    .fetchSockets()
    .then((socks) => {
      for (const sock of socks) {
        const d = sock.data as SocketDaten;
        if (d.code === s.code) sock.emit("zustand", zustandFuer(s, d, basis, verfuegbar, stand));
      }
    });
}

// ---------- Zeitplan eines Zugs (alles auf der Serveruhr, Geräte rechnen mit ihrem Uhrversatz) ----------
// Laden → Countdown 3-2-1 (3 s) → Ausschnitt startet überall zu `startUm` → Ende des Ausschnitts.
// Beim ersten Song bekommen alle Geräte 2 s mehr zum Laden (Countdown ab 5), danach reichen 3 s.
// Eingaben werden gemerkt; aufgelöst wird für alle gleichzeitig, wenn der Ausschnitt zu Ende ist.
const VORLAUF_TEST_MS = Number(process.env.ZEITSTRAHL_VORLAUF_MS) || 0; // Tests: kürzer
const VORLAUF_ERSTER_MS = VORLAUF_TEST_MS || 5000;
const VORLAUF_MS = VORLAUF_TEST_MS || 3000;
const schonGespielt = new WeakSet<Spiel>();

// ---------- Startsong: alle haben dieselbe Startkarte, sie wird zu Beginn kurz angespielt ----------
// Laden (0,3 s) → Startsong mit Jahr (7 s) → Countdown 3-2-1 → erster Song.
const VORSPIEL_MS = 7_000;
// Startsong: die Musik setzt fast gleichzeitig mit dem Cover ein; die kurze Spanne reicht zum Laden, Nachzügler springen an die laufende Stelle
const VORSPIEL_VORLAUF_MS = 300;
const vorspiele = new Map<string, { karte: Karte; token: string; ab: number; bis: number }>();

function vorspielWeg(s: Spiel): void {
  freigabeEntziehen(vorspiele.get(s.code)?.token);
  vorspiele.delete(s.code);
}

function vorspielPlanen(s: Spiel): void {
  vorspielWeg(s);
  const karte = s.spieler[0]?.zeitstrahl[0];
  if (!karte) return;
  try {
    const token = ausschnittFreigeben(karte.songId, VORSPIEL_MS / 1000);
    const ab = Date.now() + VORSPIEL_VORLAUF_MS;
    vorspiele.set(s.code, { karte, token, ab, bis: ab + VORSPIEL_MS });
  } catch (err) {
    console.warn(`[raum ${s.code}] Startsong: ${(err as Error).message}`);
  }
}

/** Startsong für dieses Gerät: Karte und Zeitfenster für alle, Ton nur dort, wo auch sonst die Musik läuft. */
function vorspielFuer(s: Spiel, d: SocketDaten) {
  const v = vorspiele.get(s.code);
  if (!v || s.phase !== "hoeren" || Date.now() > v.bis) return null;
  const w = s.einstellungen.wiedergabe;
  const hier = w === "host" ? istHost(s, d) : Boolean(d.spielerId);
  return { karte: v.karte, ab: v.ab, bis: v.bis, url: hier ? `/api/audio/${v.token}` : null };
}

/** Wann der Ausschnitt endet (Apple-Vorschauen sind teils kürzer als die eingestellte Länge). */
const AUSSCHNITT_TEST_MS = Number(process.env.ZEITSTRAHL_AUSSCHNITT_MS) || 0; // Tests: Runde endet früher
function endeUm(s: Spiel): number {
  const z = s.zug;
  if (!z?.startUm) return Date.now();
  const dauer = songHolen(z.karte.songId)?.dauer_ms || Infinity;
  return z.startUm + Math.min(AUSSCHNITT_TEST_MS || s.einstellungen.ausschnittSek * 1000, dauer);
}

/** Zeitlimit und Auflösung je Raum */
const fristen = new Map<string, ReturnType<typeof setTimeout>>();
const aufloesungen = new Map<string, ReturnType<typeof setTimeout>>();

function fristStoppen(s: Spiel): void {
  clearTimeout(fristen.get(s.code));
  fristen.delete(s.code);
  clearTimeout(aufloesungen.get(s.code));
  aufloesungen.delete(s.code);
}

/** Jetzt auflösen: auswerten, Ausschnitt-Freigabe entziehen, an alle senden. */
function jetztAufloesen(s: Spiel): void {
  fristStoppen(s);
  if (s.phase !== "hoeren") return;
  auswerten(s);
  freigabeEntziehen(ausschnitte.get(s.code));
  ausschnitte.delete(s.code);
  senden(s);
}

/** Nach „alle5“ (letzte Eingabe) bzw. „erster“ (erste Eingabe): so lange, bis aufgelöst wird. */
const NACHLAUF_MS = 5000;

/**
 * Runde entschieden: Song noch zu Ende spielen lassen (bei „alle5“/„erster“ höchstens 5 s), dann für alle gleichzeitig auflösen.
 * Bei „erster“ zählt die Frist ab der ersten Eingabe – spätere Eingaben verlängern sie nicht.
 */
function aufloesenNachSong(s: Spiel): void {
  if (!s.zug || s.phase !== "hoeren") return;
  const warten = alleGleichzeitig(s) ? s.einstellungen.warten : "alle";
  if (warten === "erster" && s.zug.aufloesungUm) return;
  const ende = warten === "alle5" || warten === "erster" ? Math.min(endeUm(s), Date.now() + NACHLAUF_MS) : endeUm(s);
  if (ende - Date.now() < 300) return jetztAufloesen(s);
  s.zug.aufloesungUm = ende;
  clearTimeout(fristen.get(s.code)); // Zeitlimit egal, alle haben getippt
  fristen.delete(s.code);
  clearTimeout(aufloesungen.get(s.code));
  const zug = s.zug;
  const t = setTimeout(() => {
    aufloesungen.delete(s.code);
    if (raeume.get(s.code) === s && s.zug === zug) jetztAufloesen(s);
  }, ende - Date.now());
  t.unref();
  aufloesungen.set(s.code, t);
}

/**
 * Jemand steigt in eine Runde ein, in der alle anderen schon getippt haben (Modus „alle“/„alle5“):
 * Auflösung zurücknehmen, damit der Neue in dieser Runde noch mitspielen kann. Getippt wird dann wie
 * gewohnt bis zum Ende des Ausschnitts (Zeitlimit) bzw. bis alle fertig sind. Bei „erster“ darf ohnehin
 * jeder noch 5 s nachtippen; bei zu wenig Restzeit bleibt es bei der Auflösung.
 */
function rundeWiederOeffnen(s: Spiel): void {
  if (s.phase !== "hoeren" || !s.zug?.aufloesungUm || !alleGleichzeitig(s)) return;
  if (s.einstellungen.warten === "erster" || bereit(s)) return;
  if (endeUm(s) - Date.now() < 3000) return;
  clearTimeout(aufloesungen.get(s.code));
  aufloesungen.delete(s.code);
  delete s.zug.aufloesungUm;
  fristStarten(s);
}

function fristStarten(s: Spiel): void {
  fristStoppen(s);
  if (!s.zug) return;
  // Zeitlimit: bis der Ausschnitt endet (+1 s Puffer)
  s.zug.frist = s.phase === "hoeren" && s.einstellungen.zeitlimit ? endeUm(s) + 1000 : null;
  if (!s.zug.frist) return;
  const zug = s.zug;
  const t = setTimeout(() => {
    fristen.delete(s.code);
    if (raeume.get(s.code) !== s || s.zug !== zug || !zeitAbgelaufen(s)) return;
    freigabeEntziehen(ausschnitte.get(s.code));
    ausschnitte.delete(s.code);
    senden(s);
  }, s.zug.frist - Date.now());
  t.unref();
  fristen.set(s.code, t);
}

function zugVorbereiten(s: Spiel): void {
  const vorspiel = vorspiele.get(s.code);
  if (vorspiel && vorspiel.bis < Date.now()) vorspielWeg(s);
  if (s.zug && s.phase === "hoeren") {
    // läuft noch der Startsong, startet der erste Song erst danach (mit Countdown)
    s.zug.startUm = vorspiele.has(s.code) ? vorspiel!.bis + VORLAUF_MS : Date.now() + (schonGespielt.has(s) ? VORLAUF_MS : VORLAUF_ERSTER_MS);
    schonGespielt.add(s);
    s.zug.aufloesungUm = undefined;
  }
  fristStarten(s);
  freigabeEntziehen(ausschnitte.get(s.code));
  ausschnitte.delete(s.code);
  if (s.phase === "hoeren" && s.zug) {
    try {
      ausschnitte.set(s.code, ausschnittFreigeben(s.zug.karte.songId, s.einstellungen.ausschnittSek));
      alsGespieltMarkieren(s.zug.karte.songId);
    } catch (err) {
      console.warn(`[raum ${s.code}] Ausschnitt: ${(err as Error).message}`);
    }
    if (bereit(s)) aufloesenNachSong(s); // z. B. nach Neustart des Servers
    botsPlanen(s);
  }
}

// ---------- Bots: tippen nach einer Bedenkzeit, die zur Stufe passt ----------
const BEDENKZEIT: Record<BotStufe, [number, number]> = { leicht: [8, 22], mittel: [6, 18], profi: [4, 13] };

function botsPlanen(s: Spiel): void {
  const zug = s.zug;
  if (!zug?.startUm || s.phase !== "hoeren") return;
  const dran = alleGleichzeitig(s) ? s.reihenfolge : [aktiverSpieler(s)?.id];
  const spaetestens = endeUm(s) - 2000;
  for (const p of s.spieler.filter((q) => q.bot && dran.includes(q.id))) {
    const [von, bis] = BEDENKZEIT[p.bot!];
    const um = Math.min(spaetestens, zug.startUm + (von + Math.random() * (bis - von)) * 1000);
    const t = setTimeout(() => {
      if (raeume.get(s.code) !== s || s.zug !== zug || s.phase !== "hoeren" || p.id in (zug.gelegt ?? {})) return;
      try {
        const { position, tipp } = botZug(s, p);
        if (eingeben(s, p.id, position, tipp)) aufloesenNachSong(s);
        senden(s);
      } catch {
        /* Runde schon entschieden (z. B. „erster“) */
      }
    }, Math.max(0, um - Date.now()));
    t.unref();
  }
}

/** Freie Farbe für neue Mitspieler */
const freieFarbe = (s: Spiel) => {
  const benutzt = new Set(s.spieler.map((q) => q.farbe));
  return FARBEN.find((f) => !benutzt.has(f)) ?? FARBEN[0];
};

// ---------- Handler ----------
type Antwort = (r: { ok: true; [k: string]: unknown } | { ok: false; fehler: string }) => void;

function sicher<T>(fn: (daten: T) => Record<string, unknown> | void) {
  return (daten: T, antwort?: unknown) => {
    // Antwort nur aufrufen, wenn der Client wirklich eine Rückruf-Funktion geschickt hat (sonst TypeError → Absturz)
    const antworten: Antwort = (x) => typeof antwort === "function" && (antwort as Antwort)(x);
    try {
      const r = fn(daten ?? ({} as T));
      antworten({ ok: true, ...(r ?? {}) });
    } catch (err) {
      const fehler = err instanceof SpielFehler ? err.message : "Unerwarteter Fehler.";
      if (!(err instanceof SpielFehler)) console.error(err);
      antworten({ ok: false, fehler });
    }
  };
}

function raum(code: unknown): Spiel {
  const s = raumFinden(code);
  if (!s) throw new SpielFehler("Raum nicht gefunden. Code prüfen.");
  return s;
}

const verbindungenJeIp = new Map<string, number>();

/** Nach Trennung oder Raumwechsel zählt ein Spieler nur mit einem verbleibenden Socket als verbunden. */
async function spielerVerbindungPruefen(code: string, spielerId: string): Promise<void> {
  const s = raeume.get(code);
  const p = s?.spieler.find((q) => q.id === spielerId);
  if (!s || !p) return;
  const socks = await io.in(code).fetchSockets();
  if (!socks.some((k) => k.data.code === code && k.data.spielerId === p.id)) {
    p.verbunden = false;
    if (alleGleichzeitig(s) && bereit(s) && !s.zug?.aufloesungUm) aufloesenNachSong(s);
    senden(s);
  }
}

export function socketsEinrichten(server: Server): void {
  io = server;

  io.on("connection", (socket: Socket) => {
    const d = socket.data as SocketDaten;
    const verbundenSeit = Date.now();
    /** Für das Log: Raum und Spielername (Host = „Host“) */
    const wer = () => `${d.code ?? "-"} ${d.hostSitzung ? "Host" : (raumFinden(d.code)?.spieler.find((p) => p.id === d.spielerId)?.name ?? "?")}`;
    const transport = () => socket.conn.transport.name;
    const ip = clientIp(socket.request);
    // höchstens 30 gleichzeitige Verbindungen je IP (eine Party im selben WLAN braucht weit weniger)
    const offen = (verbindungenJeIp.get(ip) ?? 0) + 1;
    verbindungenJeIp.set(ip, offen);
    socket.on("disconnect", () => {
      const rest = (verbindungenJeIp.get(ip) ?? 1) - 1;
      if (rest > 0) verbindungenJeIp.set(ip, rest);
      else verbindungenJeIp.delete(ip);
    });
    if (offen > 30) return void socket.disconnect(true);
    // Drosselung je Socket (Token-Eimer): 40 Ereignisse auf einmal, dann 10 pro Sekunde; wer weit drüber liegt, fliegt raus
    let marken = 40;
    let zuletzt = Date.now();
    let verworfen = 0;
    socket.use((_, weiter) => {
      const jetzt = Date.now();
      marken = Math.min(40, marken + ((jetzt - zuletzt) / 1000) * 10);
      zuletzt = jetzt;
      if (marken >= 1) {
        marken -= 1;
        return weiter();
      }
      if (++verworfen > 200) socket.disconnect(true);
      weiter(new Error("Zu viele Anfragen."));
    });

    // Uhrabgleich: Geräte messen ihren Versatz zur Serveruhr (synchroner Start und Countdown)
    socket.on("zeit", (_: unknown, antwort?: unknown) => typeof antwort === "function" && antwort(Date.now()));

    // Abgleich: Gerät meldet seinen Stand – ist er veraltet (verpasste Nachricht, Handy war im Schlaf), kommt der aktuelle sofort
    socket.on("abgleich", (x: { stand?: unknown } | null, antwort?: unknown) => {
      // Antwort = Lebenszeichen: bleibt sie aus, baut das Gerät die Verbindung neu auf
      if (typeof antwort === "function") antwort(true);
      if (!d.code) return;
      const s = raumFinden(d.code);
      if (s && Number(x?.stand) !== (staende.get(s.code) ?? 0)) {
        if (Number(x?.stand) >= 0) diagnose("abgleich", `${wer()} hatte Stand ${Number(x?.stand)}, aktuell ${staende.get(s.code) ?? 0} → nachgeschickt`);
        socket.emit("zustand", zustandFuer(s, d));
      }
    });

    // Gerät meldet Hänger, Trennungen und ausbleibende Antworten (Fehlersuche Handy-Verzögerung)
    socket.on("diagnose", (x: Record<string, unknown> | null) => {
      if (!d.code || !x || typeof x !== "object") return;
      diagnose("geraet-meldung", `${wer()} ${JSON.stringify(x).slice(0, 200)}`);
    });

    // Gerät meldet: ein Zustand kam deutlich zu spät an (Fehlersuche Handy-Verzögerung)
    socket.on("verzug", (x: { ms?: unknown; transport?: unknown; sichtbar?: unknown } | null) => {
      const ms = Math.round(Number(x?.ms));
      if (!d.code || !Number.isFinite(ms)) return;
      diagnose("verzug", `${wer()} ${ms} ms (${String(x?.transport ?? transport()).slice(0, 12)}, ${x?.sichtbar ? "sichtbar" : "verborgen"})`, ms >= 5000);
    });

    const raumVerbinden = (s: Spiel): void => {
      if (d.code !== s.code) {
        const vorher = d.code;
        const spielerId = d.spielerId;
        if (vorher) void socket.leave(vorher);
        d.hostSitzung = undefined;
        d.spielerId = undefined;
        if (vorher && spielerId) void spielerVerbindungPruefen(vorher, spielerId);
      }
      d.code = s.code;
      void socket.join(s.code);
    };

    const hostRaum = (): Spiel => {
      if (!d.hostSitzung || !d.code) throw new SpielFehler("Nur der Host darf das.");
      // direkt, nicht über raumFinden: das blendet Demo-Räume aus, der TV muss seine Demo aber beenden können
      const s = raeume.get(d.code);
      if (!s) throw new SpielFehler("Raum nicht gefunden. Code prüfen.");
      if (!istHost(s, d)) throw new SpielFehler("Nur der Host darf das.");
      return s;
    };

    socket.on(
      "host:erstellen",
      sicher<{ einstellungen?: Partial<Einstellungen> }>((x) => {
        if (raeume.size >= MAX_RAEUME) throw new SpielFehler("Gerade sind zu viele Spiele offen. Bitte gleich nochmal versuchen.");
        if (!erlaubt("raum-erstellen", ip, 10, 10 * 60_000)) throw new SpielFehler("Zu viele neue Spiele. Bitte in ein paar Minuten nochmal.");
        const code = zufallsCode();
        const s: Spiel = {
          code,
          hostSitzung: token(),
          privat: (rolleAusAppSitzung(socket.handshake.auth.sitzung) ?? rolleAusAnfrage(socket.request)) === "admin",
          einladung: einladungToken(),
          einstellungen: grenzen({ ...STANDARD_EINSTELLUNGEN, ...(x.einstellungen ?? {}) }),
          spieler: [],
          stapel: [],
          ablage: [],
          phase: "lobby",
          reihenfolge: [],
          zugIndex: 0,
          runde: 0,
          stechen: null,
          zug: null,
          gewinner: [],
          erstellt: Date.now(),
          geaendert: Date.now(),
        };
        raeume.set(code, s);
        raumVerbinden(s);
        d.hostSitzung = s.hostSitzung;
        senden(s);
        return { code, hostSitzung: s.hostSitzung };
      }),
    );

    socket.on(
      "host:verbinden",
      sicher<{ code: string; hostSitzung: string }>((x) => {
        const s = raum(x.code);
        if (typeof x.hostSitzung !== "string" || x.hostSitzung !== s.hostSitzung) throw new SpielFehler("Kein Host-Zugang für diesen Raum.");
        raumVerbinden(s);
        d.hostSitzung = s.hostSitzung;
        senden(s);
        return { code: s.code };
      }),
    );

    socket.on(
      "host:einstellungen",
      sicher<Partial<Einstellungen>>((x) => {
        const s = hostRaum();
        if (s.phase !== "lobby") throw new SpielFehler("Nur in der Lobby änderbar.");
        const vorher = s.einstellungen.liste;
        s.einstellungen = grenzen({ ...s.einstellungen, ...x });
        s.geaendert = Date.now();
        // gewähltes Deck zuerst vervollständigen
        if (s.einstellungen.liste && s.einstellungen.liste !== vorher) fehlendeNachladen([s.einstellungen.liste], true);
        senden(s);
      }),
    );

    socket.on(
      "host:toleranz",
      sicher<{ spielerId: string; toleranz: number }>((x) => {
        const s = hostRaum();
        const p = s.spieler.find((q) => q.id === x.spielerId);
        if (!p) throw new SpielFehler("Spieler nicht gefunden.");
        if (p.bot) throw new SpielFehler("Bots lassen sich nicht ändern.");
        p.toleranz = Math.max(0, Math.min(10, Math.round(Number(x.toleranz) || 0)));
        senden(s);
      }),
    );

    socket.on(
      "host:entfernen",
      sicher<{ spielerId: string }>((x) => {
        const s = hostRaum();
        const war = s.zug?.karte.songId;
        spielerEntfernen(s, String(x.spielerId));
        if (s.zug?.karte.songId !== war) zugVorbereiten(s);
        else if (alleGleichzeitig(s) && bereit(s) && !s.zug?.aufloesungUm) aufloesenNachSong(s);
        io.in(s.code).fetchSockets().then((socks) => {
          for (const k of socks) if ((k.data as SocketDaten).spielerId === x.spielerId) {
            k.emit("entfernt");
            k.leave(s.code);
          }
        });
        senden(s);
      }),
    );

    socket.on(
      "host:starten",
      sicher(() => {
        const s = hostRaum();
        if (s.demo) throw new SpielFehler("Die Demo startet von selbst.");
        mitBotsStarten(s);
      }),
    );

    // Demo-Modus: Der TV stand 5 min unberührt in der Lobby – Bots spielen ein zufälliges Deck
    socket.on(
      "host:demo",
      sicher(() => {
        const s = hostRaum();
        // … oder 5 min in der Pause, weil kein echter Spieler mehr da ist (siehe autoWeiter): Das Spiel ist dann
        // verwaist, die Demo ersetzt es (sonst stünde der TV endlos auf „Warte auf …“)
        const menschen = s.spieler.filter((p) => !p.bot);
        const pausiert = !s.demo && s.phase === "aufloesung" && menschen.length > 0 && !menschen.some((p) => p.verbunden)
          && (offlineRunden.get(s.code) ?? 0) >= OFFLINE_RUNDEN;
        if (pausiert) {
          diagnose("demo", `${s.code} ersetzt pausiertes Spiel (Runde ${s.runde})`);
          fristStoppen(s);
          const lauf = weiterTimer.get(s.code);
          if (lauf) clearTimeout(lauf.t);
          weiterTimer.delete(s.code);
          warten.delete(s.code);
          wartenBis.delete(s.code);
          offlineRunden.delete(s.code);
          freigabeEntziehen(ausschnitte.get(s.code));
          ausschnitte.delete(s.code);
          revanche(s);
          for (const p of menschen) spielerEntfernen(s, p.id);
        } else if (s.phase !== "lobby" || menschen.length) throw new SpielFehler("Demo nur in einer leeren Lobby.");
        s.demo = true;
        demoStarten(s);
      }),
    );

    socket.on(
      "host:tauschen",
      sicher<{ ausschnitt?: string }>((x) => {
        const s = hostRaum();
        if (x.ausschnitt !== undefined && x.ausschnitt !== `/api/audio/${ausschnitte.get(s.code)}`) {
          throw new SpielFehler("Die Runde ist schon vorbei.");
        }
        songTauschen(s);
        zugVorbereiten(s);
        senden(s);
      }),
    );

    socket.on(
      "host:revanche",
      sicher(() => {
        const s = hostRaum();
        if (s.phase !== "ende") throw new SpielFehler("Das Spiel läuft noch.");
        revanche(s);
        senden(s);
      }),
    );

    socket.on(
      "host:beenden",
      sicher(() => {
        const s = hostRaum();
        raumWeg(s);
        io.in(s.code).emit("beendet");
        io.in(s.code).socketsLeave(s.code);
      }),
    );

    socket.on(
      "spieler:beitreten",
      sicher<{ code: string; name?: string; sitzung?: string; avatar?: string }>((x) => {
        // falsche Codes zählen: so lassen sich fremde Räume nicht durchprobieren
        const s = raumFinden(x.code);
        if (!s) {
          if (!erlaubt("code", ip, 20, 10 * 60_000)) throw new SpielFehler("Zu viele falsche Codes. Bitte in 10 Minuten nochmal.");
          throw new SpielFehler("Raum nicht gefunden. Code prüfen.");
        }
        let p = typeof x.sitzung === "string" ? s.spieler.find((q) => q.sitzung === x.sitzung && !q.bot) : undefined;
        if (!p) {
          if (!erlaubt("beitritt", ip, 30, 10 * 60_000)) throw new SpielFehler("Zu viele Beitritte. Bitte in ein paar Minuten nochmal.");
          const benutzt = new Set(s.spieler.map((q) => q.farbe));
          const war = s.zug?.karte.songId;
          p = spielerHinzufuegen(s, {
            id: crypto.randomBytes(6).toString("base64url"),
            name: String(x.name ?? ""),
            avatar: typeof x.avatar === "string" ? x.avatar : undefined,
            farbe: FARBEN.find((f) => !benutzt.has(f)) ?? FARBEN[0],
            sitzung: token(),
          });
          // hat der neue Mitspieler einen Bot ersetzt, läuft die Runde ohne ihn weiter
          if (s.phase === "hoeren" && s.zug?.karte.songId !== war) zugVorbereiten(s);
          else if (s.phase === "hoeren" && alleGleichzeitig(s) && bereit(s) && !s.zug?.aufloesungUm) aufloesenNachSong(s);
          // alle anderen haben schon getippt: der Neue darf in dieser Runde noch mitspielen
          else rundeWiederOeffnen(s);
        }
        p.verbunden = true;
        raumVerbinden(s);
        d.spielerId = p.id;
        senden(s);
        return { code: s.code, spielerId: p.id, sitzung: p.sitzung };
      }),
    );

    socket.on(
      "spieler:legen",
      sicher<{ position: number; tipp?: { interpret?: unknown; titel?: unknown }; weiterRaten?: boolean }>((x) => {
        if (!d.code || !d.spielerId) throw new SpielFehler("Nicht im Raum.");
        const s = raum(d.code);
        // merken (mit geratenem Interpret/Titel, falls die Option an ist); aufgelöst wird, wenn alle getippt haben
        const tipp = x.tipp && typeof x.tipp === "object" ? x.tipp : undefined;
        if (eingeben(s, d.spielerId, Number(x.position), tipp, x.weiterRaten === true)) aufloesenNachSong(s);
        senden(s);
      }),
    );

    // geführte Eingabe: Interpret, dann Titel – je ein Schritt
    socket.on(
      "spieler:raten",
      sicher<{ tipp?: { interpret?: unknown; titel?: unknown }; fertig?: boolean }>((x) => {
        if (!d.code || !d.spielerId) throw new SpielFehler("Nicht im Raum.");
        const s = raum(d.code);
        const tipp = x.tipp && typeof x.tipp === "object" ? x.tipp : {};
        if (ratenAbgeben(s, d.spielerId, tipp, x.fertig === true)) aufloesenNachSong(s);
        senden(s);
      }),
    );

    // Lobby: „Ich bin fertig“ (an/aus) – der Hauptbildschirm rahmt den Platz grün ein
    socket.on(
      "spieler:bereit",
      sicher((daten: unknown) => {
        if (!d.code || !d.spielerId) throw new SpielFehler("Nicht im Raum.");
        const s = raum(d.code);
        if (s.phase !== "lobby") throw new SpielFehler("Das Spiel läuft schon.");
        const p = s.spieler.find((q) => q.id === d.spielerId);
        if (!p) throw new SpielFehler("Nicht im Raum.");
        p.bereit = Boolean((daten as { bereit?: unknown } | null)?.bereit);
        senden(s);
      }),
    );

    // nach dem Spiel vom Handy aus: „Noch mal spielen“ holt alle mit denselben Spielern zurück in die Lobby
    socket.on(
      "spieler:revanche",
      sicher(() => {
        if (!d.code || !d.spielerId) throw new SpielFehler("Nicht im Raum.");
        const s = raum(d.code);
        if (s.phase === "ende") revanche(s);
        else if (s.phase !== "lobby") throw new SpielFehler("Das Spiel läuft noch.");
        senden(s);
      }),
    );

    // „Spiel verlassen“: Platz im Raum freigeben (wie Entfernen durch den Host)
    socket.on(
      "spieler:verlassen",
      sicher(() => {
        if (!d.code || !d.spielerId) throw new SpielFehler("Nicht im Raum.");
        const s = raum(d.code);
        const war = s.zug?.karte.songId;
        spielerEntfernen(s, d.spielerId);
        if (s.zug?.karte.songId !== war) zugVorbereiten(s);
        else if (alleGleichzeitig(s) && bereit(s) && !s.zug?.aufloesungUm) aufloesenNachSong(s);
        void socket.leave(s.code);
        d.spielerId = undefined;
        d.hostSitzung = undefined;
        d.code = undefined;
        senden(s);
      }),
    );

    socket.on("disconnect", (grund) => {
      if (d.code) diagnose("verbindung", `${wer()} getrennt: ${grund} (${transport()}, nach ${Math.round((Date.now() - verbundenSeit) / 1000)} s)`);
      if (!d.code || !d.spielerId) return;
      void spielerVerbindungPruefen(d.code, d.spielerId);
    });
  });
}

/** Anzahl laufender Spiele (gerade ein Song oder eine Auflösung, nicht Lobby, Endseite oder Demo) – für /healthz */
export function laufendeSpiele(): number {
  let n = 0;
  for (const s of raeume.values()) if (!s.demo && (s.phase === "hoeren" || s.phase === "aufloesung")) n++;
  return n;
}

/**
 * Cover, Details und Quelle (/api/cover, /api/details, /api/quelle) nur für Songs, die in einem offenen Spiel
 * aufgedeckt sind: in einem Zeitstrahl oder gerade in der Auflösung. Sonst ließe sich die ganze Bibliothek abfragen –
 * die Song-ID folgt aus der Deezer-/Apple-ID (Schlüssel steht im öffentlichen Repo).
 */

export function songIstAufgedeckt(songId: string): boolean {
  let offen = false;
  for (const s of raeume.values()) {
    if (s.phase === "hoeren" && s.zug?.karte.songId === songId) return false;
    if (s.phase === "aufloesung" && s.zug?.karte.songId === songId) {
      // falsch eingeordnet → zurück im Stapel: kommt wieder, also nichts verraten
      if (s.zug.zurueck) return false;
      offen = true;
    }
    if (!offen && s.spieler.some((p) => p.zeitstrahl.some((k) => k.songId === songId))) offen = true;
  }
  return offen;
}

/** Einladungs-Token eines Raums (für QR-Code und Link). */
/** Für die Code-Eingabe auf der Startseite: gibt es den Raum, und kann man noch hinein? */
/** Code-Prüfung über HTTP (/api/raum): auch Treffer zählen, sonst ließen sich Codes ungebremst durchprobieren. */
export function raumPruefenErlaubt(ip: string): boolean {
  return erlaubt("raum-pruefen", ip, 30, 10 * 60_000);
}

export function raumStatus(code: string): { code: string; phase: Spiel["phase"]; voll: boolean } | null {
  const s = raumFinden(code);
  return s ? { code: s.code, phase: s.phase, voll: s.spieler.length >= 6 } : null;
}

export function einladungFuer(code: string): string | null {
  return raumFinden(code)?.einladung ?? null;
}

/** Prüft einen Einladungslink in konstanter Zeit. */
export function einladungGueltig(code: string, einladung: string): boolean {
  const echt = einladungFuer(code);
  if (!echt || typeof einladung !== "string") return false;
  const a = Buffer.from(einladung);
  const b = Buffer.from(echt);
  // Byte-Länge prüfen: Umlaute o. Ä. hätten bei gleicher Zeichenzahl mehr Bytes → timingSafeEqual würfe
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
