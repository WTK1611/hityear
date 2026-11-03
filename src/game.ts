// Spiel-Engine: reine, deterministische Zustandsmaschine ohne I/O.
// Der Server ist autoritativ; Clients schicken nur Absichten (Karte legen, weiter).
//
// Ablauf: lobby → hoeren → aufloesung → hoeren → … → ende
// Jeder Spieler baut seinen eigenen Zeitstrahl. Wer am Zug ist, ordnet den
// gehörten Song nach Erscheinungsjahr ein. Liegt er richtig, bleibt die Karte.
// Gewonnen hat, wer am Ende einer vollen Runde die Zielzahl erreicht; bei
// Gleichstand entscheiden die ⭐-Punkte, sonst gewinnen alle Führenden gemeinsam.
import { geraten, interpretVarianten, titelVarianten } from "./normalisieren.ts";

export type Phase = "lobby" | "hoeren" | "aufloesung" | "ende";
/** host = Fernseher/Laptop, spieler = Handy von dem, der dran ist, alle = jedes Handy */
export type Wiedergabe = "host" | "spieler" | "alle";
/** einzeln = reihum ist einer dran; alle = alle ordnen denselben Song gleichzeitig in ihren Zeitstrahl ein */
export type Modus = "einzeln" | "alle";
/** Musik-Avatare zur Auswahl beim Beitreten (gleiche Liste in public/js/gemeinsam.js). */
export const AVATARE = ["🎸", "🎤", "🎹", "🥁", "🎷", "🎺", "🎻", "🪕", "🎧", "🪩", "📻", "💿", "🦄", "🐸", "🦜", "🤘"];

export const NICHT_ERRATEN = ["verdeckt", "offen", "weg"] as const;
export type NichtErraten = (typeof NICHT_ERRATEN)[number];

export interface Einstellungen {
  zielKarten: number; // 5–20
  ausschnittSek: number; // immer 30 (so lang wie die Vorschauen von Apple und Deezer)
  wiedergabe: Wiedergabe;
  jahrzehnte: number[]; // leer = alle, sonst z. B. [1980, 1990]
  genres: Genre[]; // leer = alle
  nurChartHits: boolean;
  /** Deck aus einer Songliste (ID), null = ganze Bibliothek. */
  liste: string | null;
  /** true = bis zum Ende des Ausschnitts einordnen, sonst zählt die Karte als daneben; false = ohne Zeitlimit, bis alle gewählt haben. */
  zeitlimit: boolean;
  modus: Modus;
  /**
   * Nicht erraten: „verdeckt“ = Lösung verdecken, Song kommt später nochmal;
   * „offen“ = Lösung zeigen, Song kommt später nochmal; „weg“ = Lösung zeigen, Song kommt nicht mehr.
   */
  nichtErraten: NichtErraten;
  /**
   * Modus „alle“: „alle“ = warten, bis alle getippt haben (oder die Zeit um ist), aufgelöst am Song-Ende;
   * „alle5“ = wie „alle“, aber aufgelöst 5 s nach der letzten Eingabe; „erster“ = die erste Eingabe entscheidet die Runde,
   * die anderen dürfen danach noch 5 s lang tippen.
   */
  warten: "alle" | "alle5" | "erster";
  /** Zusatzpunkte: Beim Einordnen dürfen Interpret und/oder Titel geraten werden (je richtig +1 Punkt). */
  raten: boolean;
  /** Was bei „raten“ zusätzlich gefragt wird. */
  ratenWas: RatenWas;
  /** Beim Start mit Bots auf 6 Mitspieler auffüllen (Name und Stufe zufällig) */
  auffuellen: boolean;
}

/** Genre-Gruppen der Lobby → Teilwörter im Genre-Tag (Apple/Deezer/Datei, z. B. „Hip-Hop/Rap“, „Deutsch-Pop“) */
export const GENRES = {
  pop: ["pop"],
  rock: ["rock", "alternative", "metal", "punk", "indie", "new wave", "grunge"],
  dance: ["dance", "electronic", "elektro", "house", "trance", "techno", "disco", "edm"],
  hiphop: ["hip-hop", "hip hop", "rap"],
  rnb: ["r&b", "soul", "funk"],
  schlager: ["schlager", "volksmusik", "deutsch"],
  film: ["soundtrack", "musical"],
} as const;
export type Genre = keyof typeof GENRES;

export const RATEN_WAS = ["beide", "titel", "interpret"] as const;
export type RatenWas = (typeof RATEN_WAS)[number];
const fragtInterpret = (e: Einstellungen) => e.raten && e.ratenWas !== "titel";
const fragtTitel = (e: Einstellungen) => e.raten && e.ratenWas !== "interpret";

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  zielKarten: 10,
  ausschnittSek: 30,
  wiedergabe: "host",
  jahrzehnte: [],
  genres: [],
  nurChartHits: false,
  liste: null,
  zeitlimit: true,
  modus: "alle",
  nichtErraten: "offen",
  warten: "alle",
  raten: false,
  ratenWas: "beide",
  auffuellen: true,
};

export interface Karte {
  songId: string;
  jahr: number;
  titel: string;
  interpret: string;
}

export interface Spieler {
  id: string;
  name: string;
  farbe: string;
  /** Musik-Avatar (Emoji aus AVATARE), beim Beitreten gewählt. */
  avatar?: string;
  sitzung: string; // geheimer Reconnect-Token, nie an andere senden
  zeitstrahl: Karte[]; // nach Jahr sortiert
  toleranz: number; // ±Jahre (Fairness, z. B. für Kinder)
  verbunden: boolean;
  richtig: number;
  falsch: number;
  /** Zusatzpunkte fürs Raten von Interpret und Titel (Option „raten“). */
  punkte?: number;
  /** KI-Mitspieler (vom Server gesteuert) mit Schwierigkeitsstufe */
  bot?: BotStufe;
  /** Lobby: „Ich bin fertig“ getippt (Hauptbildschirm zeigt grünen Rahmen) */
  bereit?: boolean;
}

// ---------- Bots ----------
export const BOT_STUFEN = ["leicht", "mittel", "profi"] as const;
export type BotStufe = (typeof BOT_STUFEN)[number];
/** Bot-Kandidaten: lustiger Name, passender Avatar und Stufe (je 8 pro Stufe) */
export const BOT_LISTE: { name: string; avatar: string; stufe: BotStufe }[] = [
  { name: "DJ Schnarchnase", avatar: "😴", stufe: "leicht" },
  { name: "Oma Hitparade", avatar: "👵", stufe: "leicht" },
  { name: "Kassetten-Kurt", avatar: "📼", stufe: "leicht" },
  { name: "Blockflöten-Bernd", avatar: "🪈", stufe: "leicht" },
  { name: "Tante Tamburin", avatar: "🪇", stufe: "leicht" },
  { name: "Schlager-Schorsch", avatar: "🕺", stufe: "leicht" },
  { name: "Brummbär Balduin", avatar: "🐻", stufe: "leicht" },
  { name: "Faultier Fritzi", avatar: "🦥", stufe: "leicht" },
  { name: "MC Mixtape", avatar: "🎧", stufe: "mittel" },
  { name: "Disco-Dieter", avatar: "🪩", stufe: "mittel" },
  { name: "Lady Lautstärke", avatar: "🔊", stufe: "mittel" },
  { name: "Radio-Rudi", avatar: "📻", stufe: "mittel" },
  { name: "Bass-Bärbel", avatar: "🎸", stufe: "mittel" },
  { name: "Karaoke-Kalle", avatar: "🎤", stufe: "mittel" },
  { name: "Tröten-Toni", avatar: "🎺", stufe: "mittel" },
  { name: "Pinguin Paula", avatar: "🐧", stufe: "mittel" },
  { name: "Prof. Plattenkiste", avatar: "🎓", stufe: "profi" },
  { name: "Vinyl-Vroni", avatar: "💿", stufe: "profi" },
  { name: "Chart-Checker 3000", avatar: "🤖", stufe: "profi" },
  { name: "Captain Ohrwurm", avatar: "🛸", stufe: "profi" },
  { name: "DJ Allwissend", avatar: "🧠", stufe: "profi" },
  { name: "Die Jukebox", avatar: "🎰", stufe: "profi" },
  { name: "Synthi-Susi", avatar: "🎹", stufe: "profi" },
  { name: "Eule Euphonia", avatar: "🦉", stufe: "profi" },
];
export const BOT_AVATARE = BOT_LISTE.map((b) => b.avatar);
export type BotVorschau = (typeof BOT_LISTE)[number];
/** Wie oft ein Bot die richtige Lücke trifft bzw. Interpret/Titel kennt */
const BOT_TREFFER: Record<BotStufe, { jahr: number; raten: number }> = {
  leicht: { jahr: 0.35, raten: 0.2 },
  mittel: { jahr: 0.6, raten: 0.45 },
  profi: { jahr: 0.85, raten: 0.75 },
};

/** Bot-Mitspieler anlegen: lustiger, noch freier Name und Roboter-Avatar. */
export function botHinzufuegen(s: Spiel, stufe: BotStufe, id: string, farbe: string, zufall = Math.random, wunsch?: BotVorschau): Spieler {
  const vergeben = new Set(s.spieler.map((p) => p.name.toLowerCase()));
  const frei = BOT_LISTE.filter((b) => b.stufe === stufe && !vergeben.has(b.name.toLowerCase()));
  const vorlage = wunsch && !vergeben.has(wunsch.name.toLowerCase()) ? wunsch : frei[Math.floor(zufall() * frei.length)];
  const name = vorlage?.name ?? `Bot ${s.spieler.length + 1}`;
  const avatare = BOT_AVATARE.filter((a) => !s.spieler.some((p) => p.avatar === a));
  // Sitzung ist ein unratbarer Wert: niemand kann sich als Bot anmelden und ihn übernehmen
  const p = spielerHinzufuegen(s, { id, name, farbe, sitzung: `bot-${id}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}` });
  p.avatar = vorlage && avatare.includes(vorlage.avatar) ? vorlage.avatar : avatare[Math.floor(zufall() * avatare.length)] ?? BOT_AVATARE[0];
  p.bot = stufe;
  return p;
}

/** Was ein Bot tippt: je nach Stufe die richtige Lücke, sonst eine daneben; bei „raten“ manchmal Interpret/Titel. */
export function botZug(s: Spiel, p: Spieler, zufall = Math.random): { position: number; tipp?: { interpret?: string; titel?: string } } {
  const karte = s.zug!.karte;
  const stufe = BOT_TREFFER[p.bot ?? "mittel"];
  const luecken = Array.from({ length: p.zeitstrahl.length + 1 }, (_, i) => i);
  const richtige = luecken.filter((i) => pruefePosition(p.zeitstrahl, i, karte.jahr));
  const falsche = luecken.filter((i) => !richtige.includes(i));
  // daneben heißt meist „knapp daneben“: die Nachbarlücken der richtigen bevorzugen
  const knapp = falsche.filter((i) => richtige.some((r) => Math.abs(r - i) === 1));
  const wahl = (liste: number[]) => liste[Math.floor(zufall() * liste.length)];
  const position = !falsche.length || zufall() < stufe.jahr ? wahl(richtige) : wahl(knapp.length && zufall() < 0.7 ? knapp : falsche);
  if (!s.einstellungen.raten) return { position };
  const weiss = () => zufall() < stufe.raten;
  return { position, tipp: { interpret: weiss() ? karte.interpret : "", titel: weiss() ? karte.titel : "" } };
}

export interface Ergebnis {
  spielerId: string;
  position: number;
  richtig: boolean;
  karte: Karte;
  /** Wie viele Jahre daneben (0 = richtig). */
  abstand: number;
  /** Zeitlimit abgelaufen, ohne dass eingeordnet wurde. */
  zeitUm?: boolean;
  /** Getippter Zeitraum: Jahre der Nachbarkarten (null = offenes Ende). Verrät nichts über die Lösung. */
  zeitraum?: { von: number | null; bis: number | null };
  /** Option „raten“: was geraten wurde und ob es stimmt (je richtig +1 Punkt). */
  bonus?: { interpret: string; titel: string; interpretRichtig: boolean; titelRichtig: boolean };
}

/** Zeitraum der Lücke `position` im Zeitstrahl (vor dem Einsortieren bestimmen). */
const zeitraumBei = (zeitstrahl: Karte[], position: number) => ({
  von: zeitstrahl[position - 1]?.jahr ?? null,
  bis: zeitstrahl[position]?.jahr ?? null,
});

export interface Zug {
  karte: Karte; // vor der Auflösung NIE an Clients senden
  ergebnis?: Ergebnis;
  /** Bis wann eingeordnet sein muss (ms seit 1970), null = unbegrenzt. */
  frist?: number | null;
  /** Auflösung: Zeitpunkt (ms), zu dem es von selbst weitergeht. */
  weiterUm?: number;
  /** Serveruhr: hier startet der Ausschnitt auf allen Geräten gleichzeitig (davor 3-2-1-Countdown). */
  startUm?: number;
  /** Alle Eingaben da: Auflösung, sobald der Ausschnitt zu Ende gespielt ist. */
  aufloesungUm?: number;
  /** Wer wo gelegt hat (Spieler-ID → Position), Positionen erst bei der Auflösung sichtbar */
  gelegt?: Record<string, number>;
  /** Modus „alle“: ein Ergebnis je Spieler */
  ergebnisse?: Ergebnis[];
  /** Niemand lag richtig: Karte ist zurück im Stapel und bleibt verdeckt (kommt später wieder). */
  zurueck?: boolean;
  /** Option „raten“: geratene Interpreten/Titel je Spieler – erst bei der Auflösung sichtbar */
  tipps?: Record<string, { interpret: string; titel: string }>;
  /** Option „raten“, geführte Eingabe: Jahr liegt schon, Interpret/Titel kommen noch (zählt noch nicht als fertig) */
  ratenOffen?: string[];
}

export interface Spiel {
  code: string;
  hostSitzung: string;
  /** Vom Admin eröffnet (Admin-Passwort): darf gespeicherte Hörproben nutzen, sonst immer Streaming */
  privat?: boolean;
  /** Geheimer Einladungs-Token für QR-Code/Link (ersetzt die Passworteingabe). */
  einladung: string;
  einstellungen: Einstellungen;
  spieler: Spieler[];
  stapel: Karte[];
  ablage: Karte[];
  phase: Phase;
  /** Spieler-IDs, die in dieser Runde (noch) dran sind, in Reihenfolge. */
  reihenfolge: string[];
  zugIndex: number;
  runde: number;
  /** Bei Gleichstand: nur diese Spieler spielen das Stechen. */
  stechen: string[] | null;
  zug: Zug | null;
  gewinner: string[];
  /** Bots, die beim Start freie Plätze übernehmen (schon in der Lobby sichtbar) */
  botPlan?: BotVorschau[];
  /** Spielende schon in die Bestenliste eingetragen (siehe bestenliste.ts) */
  bestenlisteEingetragen?: boolean;
  erstellt: number;
  geaendert: number;
}

export class SpielFehler extends Error {}

/** Sechs Bots für die freien Plätze würfeln – je zwei pro Stufe, gemischt; bleibt bis zum Start gleich. */
export function botPlan(s: Spiel, zufall = Math.random): BotVorschau[] {
  if (s.botPlan?.length === 6) return s.botPlan;
  const mischen = <T>(a: T[]) => a.map((x) => [zufall(), x] as const).sort((x, y) => x[0] - y[0]).map(([, x]) => x);
  s.botPlan = mischen(BOT_STUFEN.flatMap((stufe) => mischen(BOT_LISTE.filter((b) => b.stufe === stufe)).slice(0, 2)));
  return s.botPlan;
}

/** Die Bots, die beim Start dazukämen (Option „auffüllen“), in Sitzreihenfolge. */
export function botsDazu(s: Spiel): BotVorschau[] {
  if (!s.einstellungen.auffuellen) return [];
  const namen = new Set(s.spieler.map((p) => p.name.toLowerCase()));
  const plan = botPlan(s).filter((b) => !namen.has(b.name.toLowerCase())).slice(0, Math.max(0, 6 - s.spieler.length));
  // hat ein Mitspieler das Avatar eines geplanten Bots, zeigt schon die Vorschau ein freies – so wie es der Bot beim Start bekommt
  const belegt = new Set([...s.spieler.map((p) => p.avatar), ...plan.map((b) => b.avatar)]);
  return plan.map((b) => {
    if (!s.spieler.some((p) => p.avatar === b.avatar)) return b;
    const avatar = BOT_AVATARE.find((a) => !belegt.has(a)) ?? b.avatar;
    belegt.add(avatar);
    return { ...b, avatar };
  });
}

export function grenzen(e: Partial<Einstellungen>): Einstellungen {
  const z = { ...STANDARD_EINSTELLUNGEN, ...e };
  return {
    zielKarten: [10, 15, 20].includes(Math.round(z.zielKarten)) ? Math.round(z.zielKarten) : 10,
    ausschnittSek: 30,
    // nur noch „vor Ort“ (host) oder „online“ (alle Handys); altes „spieler“ wird zu „alle“
    wiedergabe: z.wiedergabe === "spieler" || z.wiedergabe === "alle" ? "alle" : "host",
    jahrzehnte: Array.isArray(z.jahrzehnte)
      ? [...new Set(z.jahrzehnte.map(Number).filter((j) => Number.isInteger(j) && j >= 1900 && j <= 2100 && j % 10 === 0))].sort()
      : [],
    genres: Array.isArray(z.genres) ? [...new Set(z.genres.filter((g): g is Genre => Object.hasOwn(GENRES, g)))] : [],
    // Option ist aus der Lobby entfernt und bleibt immer aus
    nurChartHits: false,
    liste: typeof z.liste === "string" && /^[a-z0-9-]{1,60}$/.test(z.liste) ? z.liste : null,
    zeitlimit: true, // nach spätestens 30 s (Ende der Vorschau) ist Schluss – keine Wahl mehr
    modus: z.modus === "alle" ? "alle" : "einzeln",
    nichtErraten: NICHT_ERRATEN.includes(z.nichtErraten) ? z.nichtErraten : "offen",
    warten: z.warten === "erster" || z.warten === "alle5" ? z.warten : "alle",
    raten: Boolean(z.raten),
    ratenWas: RATEN_WAS.includes(z.ratenWas) ? z.ratenWas : "beide",
    auffuellen: Boolean(z.auffuellen),
  };
}

function klemme(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export const alleGleichzeitig = (s: Spiel): boolean => s.einstellungen.modus === "alle";

/** Modus „einzeln“: wer gerade dran ist. Im Modus „alle“ ist niemand allein dran (null). */
export function aktiverSpieler(s: Spiel): Spieler | null {
  if (s.phase !== "hoeren" && s.phase !== "aufloesung") return null;
  if (alleGleichzeitig(s)) return null;
  const id = s.reihenfolge[s.zugIndex];
  return s.spieler.find((p) => p.id === id) ?? null;
}

/** Ist das Einordnen an `position` korrekt? Gleiches Jahr wie ein Nachbar zählt immer. */
export function pruefePosition(zeitstrahl: Karte[], position: number, jahr: number, toleranz = 0): boolean {
  const links = position > 0 ? zeitstrahl[position - 1].jahr : -Infinity;
  const rechts = position < zeitstrahl.length ? zeitstrahl[position].jahr : Infinity;
  return jahr >= links - toleranz && jahr <= rechts + toleranz;
}

function abstandZu(zeitstrahl: Karte[], position: number, jahr: number): number {
  const links = position > 0 ? zeitstrahl[position - 1].jahr : -Infinity;
  const rechts = position < zeitstrahl.length ? zeitstrahl[position].jahr : Infinity;
  if (jahr < links) return links - jahr;
  if (jahr > rechts) return jahr - rechts;
  return 0;
}

/**
 * Falsch oder nicht eingeordnet (Einstellung „nichtErraten“): ganz unten in den Stapel
 * (gezogen wird oben = Ende, kommt also zuletzt wieder), bei „verdeckt“ ohne Lösung; bei „weg“ auf die Ablage.
 */
function zurueckInStapel(s: Spiel, karte: Karte): void {
  const art = s.einstellungen.nichtErraten;
  if (art === "weg") return void s.ablage.push(karte);
  s.stapel.unshift(karte);
  if (s.zug && art === "verdeckt") s.zug.zurueck = true;
}

function einsortieren(zeitstrahl: Karte[], karte: Karte): void {
  let i = zeitstrahl.findIndex((k) => k.jahr > karte.jahr);
  if (i === -1) i = zeitstrahl.length;
  zeitstrahl.splice(i, 0, karte);
}

export function spielerHinzufuegen(s: Spiel, p: Omit<Spieler, "zeitstrahl" | "richtig" | "falsch" | "verbunden" | "toleranz">): Spieler {
  // Später einsteigen geht, solange kein Stechen läuft und das Spiel nicht vorbei ist
  const spaeter = s.phase === "hoeren" || s.phase === "aufloesung";
  if (s.phase !== "lobby" && !(spaeter && !s.stechen)) throw new SpielFehler("Gerade kann niemand mehr einsteigen.");
  if (spaeter && !s.stapel.length) throw new SpielFehler("Keine Karten mehr im Stapel.");
  if (s.spieler.length >= 6) throw new SpielFehler("Der Raum ist voll (max. 6).");
  const name = p.name.trim().slice(0, 20);
  if (!name) throw new SpielFehler("Bitte einen Namen eingeben.");
  if (s.spieler.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
    throw new SpielFehler("Den Namen gibt es schon.");
  }
  const avatar = p.avatar && AVATARE.includes(p.avatar) ? p.avatar : AVATARE[s.spieler.length % AVATARE.length];
  const neu: Spieler = { ...p, name, avatar, zeitstrahl: [], toleranz: 0, verbunden: true, richtig: 0, falsch: 0, punkte: 0 };
  s.spieler.push(neu);
  if (spaeter) {
    // Startkarte wie alle anderen, dann hinten in die Reihenfolge der laufenden Runde
    neu.zeitstrahl = [s.stapel.pop()!];
    s.reihenfolge.push(neu.id);
  }
  s.geaendert = Date.now();
  return neu;
}

export function spielerEntfernen(s: Spiel, id: string): void {
  const i = s.spieler.findIndex((p) => p.id === id);
  if (i === -1) return;
  const warAktiv = aktiverSpieler(s)?.id === id;
  s.spieler.splice(i, 1);
  const ri = s.reihenfolge.indexOf(id);
  if (ri !== -1) {
    s.reihenfolge.splice(ri, 1);
    if (ri < s.zugIndex) s.zugIndex--;
  }
  if (s.stechen) s.stechen = s.stechen.filter((x) => x !== id);
  if (s.phase === "lobby") return;
  if (s.spieler.length === 0) {
    s.phase = "ende";
    s.zug = null;
    return;
  }
  if (alleGleichzeitig(s)) return; // der Raum prüft mit bereit(), ob jetzt ausgewertet werden kann
  if (warAktiv) {
    // Karte des laufenden Zugs zurück unter den Stapel, Zug geht weiter.
    if (s.zug && s.phase === "hoeren") s.stapel.unshift(s.zug.karte);
    s.zug = null;
    s.zugIndex--; // naechsterZug erhöht wieder
    naechsterZug(s);
  }
}

/** Startet das Spiel: alle bekommen dieselbe aufgedeckte Startkarte (sie wird zu Beginn kurz angespielt). */
export function starten(s: Spiel, stapel: Karte[]): void {
  if (s.phase !== "lobby") throw new SpielFehler("Das Spiel läuft schon.");
  // auch ein reines Bot-Spiel ist erlaubt (zum Zuschauen und Ausprobieren)
  if (!s.spieler.length) throw new SpielFehler("Mindestens ein Mitspieler muss beitreten – oder Bots auffüllen.");
  const noetig = s.spieler.length * (s.einstellungen.zielKarten + 1);
  if (stapel.length < Math.min(noetig, s.spieler.length + 5)) {
    throw new SpielFehler(`Zu wenige Songs für diese Auswahl (${stapel.length}).`);
  }
  s.stapel = [...stapel];
  s.ablage = [];
  const startkarte = s.stapel.pop()!;
  for (const p of s.spieler) {
    p.zeitstrahl = [{ ...startkarte }];
    p.richtig = 0;
    p.falsch = 0;
    p.punkte = 0;
  }
  s.runde = 1;
  s.stechen = null;
  s.gewinner = [];
  s.reihenfolge = s.spieler.map((p) => p.id);
  s.zugIndex = 0;
  zugBeginnen(s);
}

function zugBeginnen(s: Spiel): void {
  const karte = s.stapel.pop();
  if (!karte) {
    beenden(s);
    return;
  }
  s.zug = { karte };
  s.phase = "hoeren";
  s.geaendert = Date.now();
}

/**
 * Eingabe merken (beide Modi). Ausgewertet wird erst mit `auswerten` – der Server wartet damit,
 * bis der Ausschnitt zu Ende gespielt ist. true = alle nötigen Eingaben sind da.
 */
const tippText = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, 120) : "");

/**
 * Karte legen. Mit `weiterRaten` (Option „raten“) ist das nur der erste Schritt der geführten Eingabe:
 * die Position ist sicher gemerkt, fertig ist der Spieler aber erst nach ratenAbgeben(…, fertig = true).
 */
export function eingeben(s: Spiel, spielerId: string, position: number, tipp?: { interpret?: unknown; titel?: unknown }, weiterRaten = false): boolean {
  if (s.phase !== "hoeren" || !s.zug) throw new SpielFehler("Gerade kann keine Karte gelegt werden.");
  const gelegt = (s.zug.gelegt ??= {});
  if (alleGleichzeitig(s)) {
    if (!s.reihenfolge.includes(spielerId)) throw new SpielFehler("Du spielst diese Runde nicht mit.");
    // bei „erster“ dürfen die anderen nach der ersten Eingabe noch tippen (der Raum löst nach 5 s auf)
    if (bereit(s) && s.einstellungen.warten !== "erster") throw new SpielFehler("Die Runde ist schon entschieden.");
  } else if (aktiverSpieler(s)?.id !== spielerId) throw new SpielFehler("Du bist nicht dran.");
  if (spielerId in gelegt) throw new SpielFehler("Du hast schon gelegt.");
  const p = s.spieler.find((x) => x.id === spielerId);
  if (!p) throw new SpielFehler("Nicht im Spiel.");
  if (!Number.isInteger(position) || position < 0 || position > p.zeitstrahl.length) throw new SpielFehler("Ungültige Position.");
  gelegt[spielerId] = position;
  if (s.einstellungen.raten && tipp) {
    const e = s.einstellungen;
    const t = { interpret: fragtInterpret(e) ? tippText(tipp.interpret) : "", titel: fragtTitel(e) ? tippText(tipp.titel) : "" };
    if (t.interpret || t.titel) (s.zug.tipps ??= {})[spielerId] = t;
  }
  if (s.einstellungen.raten && weiterRaten) (s.zug.ratenOffen ??= []).push(spielerId);
  s.geaendert = Date.now();
  return bereit(s);
}

/** Geführte Eingabe: Interpret bzw. Titel nachreichen; `fertig` schließt die Eingabe ab. */
export function ratenAbgeben(s: Spiel, spielerId: string, tipp: { interpret?: unknown; titel?: unknown }, fertig: boolean): boolean {
  if (s.phase !== "hoeren" || !s.zug) throw new SpielFehler("Die Runde ist schon vorbei.");
  if (!s.einstellungen.raten) throw new SpielFehler("Raten ist in diesem Spiel aus.");
  if (!(spielerId in (s.zug.gelegt ?? {}))) throw new SpielFehler("Erst das Jahr einordnen.");
  const offen = s.zug.ratenOffen ?? [];
  if (!offen.includes(spielerId)) throw new SpielFehler("Du hast schon alles eingegeben.");
  const t = (s.zug.tipps ??= {})[spielerId] ?? { interpret: "", titel: "" };
  if (tipp.interpret !== undefined && fragtInterpret(s.einstellungen)) t.interpret = tippText(tipp.interpret);
  if (tipp.titel !== undefined && fragtTitel(s.einstellungen)) t.titel = tippText(tipp.titel);
  s.zug.tipps[spielerId] = t;
  if (fertig) s.zug.ratenOffen = offen.filter((id) => id !== spielerId);
  s.geaendert = Date.now();
  return bereit(s);
}

/** Sind alle nötigen Eingaben da? Einzeln: wer dran ist; alle: alle Verbundenen (oder der Erste, je nach Einstellung). */
export function bereit(s: Spiel): boolean {
  if (s.phase !== "hoeren" || !s.zug) return false;
  const gelegt = s.zug.gelegt ?? {};
  // fertig = Jahr gelegt und (bei geführter Eingabe) auch Interpret/Titel abgeschlossen
  const fertig = (id: string) => id in gelegt && !(s.zug?.ratenOffen ?? []).includes(id);
  if (!alleGleichzeitig(s)) {
    const p = aktiverSpieler(s);
    return Boolean(p && fertig(p.id));
  }
  const anzahl = Object.keys(gelegt).filter(fertig).length;
  if (s.einstellungen.warten === "erster") return anzahl > 0;
  const offen = s.reihenfolge.filter((id) => !fertig(id) && s.spieler.find((p) => p.id === id)?.verbunden);
  return offen.length === 0 && anzahl > 0;
}

/** Gemerkte Eingaben auswerten (auch bei abgelaufener Zeit: wer nichts gelegt hat, liegt daneben). */
export function auswerten(s: Spiel): void {
  if (s.phase !== "hoeren" || !s.zug) return;
  if (alleGleichzeitig(s)) return auswertenAlle(s);
  const p = aktiverSpieler(s);
  if (!p) return;
  const { karte } = s.zug;
  const position = s.zug.gelegt?.[p.id];
  let ergebnis: Ergebnis;
  if (position === undefined) {
    zurueckInStapel(s, karte);
    p.falsch++;
    ergebnis = { spielerId: p.id, position: -1, richtig: false, karte, abstand: 0, zeitUm: true };
  } else {
    const richtig = pruefePosition(p.zeitstrahl, position, karte.jahr, p.toleranz);
    const abstand = richtig ? 0 : abstandZu(p.zeitstrahl, position, karte.jahr);
    const zeitraum = zeitraumBei(p.zeitstrahl, position);
    if (richtig) {
      einsortieren(p.zeitstrahl, karte);
      p.richtig++;
    } else {
      zurueckInStapel(s, karte);
      p.falsch++;
    }
    ergebnis = { spielerId: p.id, position, richtig, karte, abstand, zeitraum };
    bonusWerten(s, p, ergebnis);
  }
  s.zug.ergebnis = ergebnis;
  s.phase = "aufloesung";
  s.geaendert = Date.now();
}

/** Option „raten“: Interpret und/oder Titel prüfen (je nach „ratenWas“), je richtig +1 Punkt (unabhängig davon, ob das Jahr stimmt). */
function bonusWerten(s: Spiel, p: Spieler, e: Ergebnis): void {
  const t = s.zug?.tipps?.[p.id];
  if (!s.einstellungen.raten || !t) return;
  const interpretRichtig = fragtInterpret(s.einstellungen) && Boolean(t.interpret) && geraten(t.interpret, interpretVarianten(e.karte.interpret));
  const titelRichtig = fragtTitel(s.einstellungen) && Boolean(t.titel) && geraten(t.titel, titelVarianten(e.karte.titel));
  p.punkte = (p.punkte ?? 0) + Number(interpretRichtig) + Number(titelRichtig);
  e.bonus = { ...t, interpretRichtig, titelRichtig };
}

/** Legen und sofort auswerten (Tests, Einzelmodus ohne Warten). */
export function karteLegen(s: Spiel, spielerId: string, position: number): Ergebnis {
  if (alleGleichzeitig(s)) throw new SpielFehler("Im Modus „alle“ wird gemeinsam ausgewertet.");
  eingeben(s, spielerId, position);
  auswerten(s);
  return s.zug!.ergebnis!;
}

// ---------- Modus „alle gleichzeitig“ ----------

/**
 * Jede richtige Einordnung bekommt die Karte; wer nicht gelegt hat, liegt daneben (Zeit um).
 * Bei „erster“ (Runde endet 5 s nach der ersten Eingabe) zählt Nicht-Legen nicht als Fehler.
 */
function auswertenAlle(s: Spiel): void {
  if (!s.zug) return;
  const { karte } = s.zug;
  const gelegt = s.zug.gelegt ?? {};
  const ergebnisse: Ergebnis[] = [];
  for (const id of s.reihenfolge) {
    const p = s.spieler.find((x) => x.id === id);
    if (!p) continue;
    const position = gelegt[id];
    if (position === undefined) {
      if (s.einstellungen.warten !== "erster") p.falsch++;
      ergebnisse.push({ spielerId: id, position: -1, richtig: false, karte, abstand: 0, zeitUm: true });
      continue;
    }
    const richtig = pruefePosition(p.zeitstrahl, position, karte.jahr, p.toleranz);
    const abstand = richtig ? 0 : abstandZu(p.zeitstrahl, position, karte.jahr);
    const zeitraum = zeitraumBei(p.zeitstrahl, position);
    if (richtig) {
      einsortieren(p.zeitstrahl, { ...karte });
      p.richtig++;
    } else p.falsch++;
    const e: Ergebnis = { spielerId: id, position, richtig, karte, abstand, zeitraum };
    bonusWerten(s, p, e);
    ergebnisse.push(e);
  }
  if (!ergebnisse.some((e) => e.richtig)) zurueckInStapel(s, karte);
  s.zug.ergebnisse = ergebnisse;
  // Sammel-Ergebnis für die Anzeige der Karte (Host, Zuschauer)
  s.zug.ergebnis = { spielerId: "", position: -1, richtig: ergebnisse.some((e) => e.richtig), karte, abstand: 0 };
  s.phase = "aufloesung";
  s.geaendert = Date.now();
}

/** Zeitlimit abgelaufen: werten, was gelegt wurde; wer nichts gelegt hat, liegt daneben. */
export function zeitAbgelaufen(s: Spiel): boolean {
  if (s.phase !== "hoeren" || !s.zug) return false;
  auswerten(s);
  return true;
}

/** Song tauschen (z. B. Datei kaputt oder schon bekannt) – ohne Wertung. */
export function songTauschen(s: Spiel): void {
  if (s.phase !== "hoeren" || !s.zug) throw new SpielFehler("Gerade läuft kein Song.");
  s.ablage.push(s.zug.karte);
  zugBeginnen(s);
}

/** Auflösung am Rundenende, und jemand hat das Ziel erreicht (oder das Stechen ist durch) → es kommt kein Song mehr. */
export function spielEntschieden(s: Spiel): boolean {
  if (s.phase !== "aufloesung") return false;
  const rundenende = alleGleichzeitig(s) || s.zugIndex + 1 >= s.reihenfolge.length;
  if (!rundenende) return false;
  if (s.stechen) return true;
  return Math.max(0, ...s.spieler.map((p) => p.zeitstrahl.length)) >= s.einstellungen.zielKarten;
}

export function naechsterZug(s: Spiel): void {
  if (s.phase === "lobby" || s.phase === "ende") throw new SpielFehler("Kein laufendes Spiel.");
  // Modus „alle“: jeder Song ist eine eigene Runde (alle waren schon dran)
  if (alleGleichzeitig(s)) s.zugIndex = s.reihenfolge.length - 1;
  s.zugIndex++;
  if (s.zugIndex >= s.reihenfolge.length) {
    // Runde vorbei → Sieg prüfen
    const kandidaten = s.spieler.filter((p) => !s.stechen || s.stechen.includes(p.id));
    const ziel = s.einstellungen.zielKarten;
    const max = Math.max(0, ...kandidaten.map((p) => p.zeitstrahl.length));
    if (max >= ziel || s.stechen) {
      // kein Stechen mehr: Ziel erreicht = Spiel vorbei
      beenden(s);
      return;
    }
    s.runde++;
    s.reihenfolge = s.stechen ?? s.spieler.map((p) => p.id);
    s.zugIndex = 0;
  }
  zugBeginnen(s);
}

/** Spiel beenden: meiste Karten gewinnt, bei Gleichstand mehr ⭐, sonst gemeinsamer Sieg. */
function beenden(s: Spiel): void {
  const kandidaten = s.spieler.filter((p) => !s.stechen || s.stechen.includes(p.id));
  const max = Math.max(0, ...kandidaten.map((p) => p.zeitstrahl.length));
  const fuehrende = kandidaten.filter((p) => p.zeitstrahl.length === max);
  const sterne = Math.max(0, ...fuehrende.map((p) => p.punkte ?? 0));
  s.gewinner = fuehrende.filter((p) => (p.punkte ?? 0) === sterne).map((p) => p.id);
  s.stechen = null;
  s.phase = "ende";
  s.zug = null;
  s.geaendert = Date.now();
}

/** Revanche: gleiche Spieler, zurück in die Lobby. */
export function revanche(s: Spiel): void {
  s.phase = "lobby";
  s.zug = null;
  s.stapel = [];
  s.ablage = [];
  s.gewinner = [];
  s.stechen = null;
  s.runde = 0;
  s.reihenfolge = [];
  s.zugIndex = 0;
  for (const p of s.spieler) {
    p.zeitstrahl = [];
    p.richtig = 0;
    p.falsch = 0;
    p.punkte = 0;
    p.bereit = false;
  }
  s.geaendert = Date.now();
}

/** Öffentliche Sicht auf den Zustand – ohne Geheimnisse, ohne verdeckte Karte. */
export interface Sicht {
  code: string;
  phase: Phase;
  einstellungen: Einstellungen;
  runde: number;
  stechen: string[] | null;
  aktiv: string | null;
  stapelRest: number;
  spieler: Array<Omit<Spieler, "sitzung">>;
  ergebnis: Ergebnis | null;
  gewinner: string[];
  /** Frist für den laufenden Zug und Serverzeit (Uhren der Geräte gehen unterschiedlich). */
  frist: number | null;
  serverZeit: number;
  /** Modus „alle“: wer schon gelegt hat (ohne Positionen) und die Ergebnisse je Spieler */
  gelegt: string[];
  /** Geführte Eingabe: wer das Jahr gelegt hat und noch Interpret/Titel rät */
  raten: string[];
  ergebnisse: Ergebnis[] | null;
  /** Karte kommt zurück in den Stapel: Titel, Jahr, Cover und Abstand werden nicht verraten. */
  verdeckt: boolean;
  /** Auflösung: Zeitpunkt (Serveruhr), zu dem es automatisch weitergeht. */
  weiterUm: number | null;
  /** Hören: Start des Ausschnitts auf allen Geräten (Serveruhr). */
  startUm: number | null;
  /** Hören: alle Eingaben da, Auflösung kommt zu diesem Zeitpunkt (Ende des Ausschnitts). */
  aufloesungUm: number | null;
  /** Lobby: Bots, die beim Start freie Plätze übernehmen */
  botsDazu: BotVorschau[];
}

const VERDECKT: Karte = { songId: "", jahr: 0, titel: "", interpret: "" };
const verdecken = (e: Ergebnis): Ergebnis => ({ ...e, karte: VERDECKT, abstand: 0 });

export function sicht(s: Spiel): Sicht {
  return {
    code: s.code,
    phase: s.phase,
    einstellungen: s.einstellungen,
    runde: s.runde,
    stechen: s.stechen,
    aktiv: aktiverSpieler(s)?.id ?? null,
    stapelRest: s.stapel.length,
    spieler: s.spieler.map(({ sitzung: _sitzung, ...rest }) => rest),
    botsDazu: s.phase === "lobby" ? botsDazu(s) : [],
    ergebnis: s.phase === "aufloesung" && s.zug?.ergebnis ? (s.zug.zurueck ? verdecken(s.zug.ergebnis) : s.zug.ergebnis) : null,
    gewinner: s.gewinner,
    // alle haben getippt → keine Uhr mehr, nur noch Song zu Ende hören
    frist: s.phase === "hoeren" && !s.zug?.aufloesungUm ? s.zug?.frist ?? null : null,
    serverZeit: Date.now(),
    gelegt: s.phase === "hoeren" ? Object.keys(s.zug?.gelegt ?? {}) : [],
    raten: s.phase === "hoeren" ? [...(s.zug?.ratenOffen ?? [])] : [],
    ergebnisse: s.phase === "aufloesung" && s.zug?.ergebnisse ? (s.zug.zurueck ? s.zug.ergebnisse.map(verdecken) : s.zug.ergebnisse) : null,
    verdeckt: s.phase === "aufloesung" && Boolean(s.zug?.zurueck),
    weiterUm: s.phase === "aufloesung" ? s.zug?.weiterUm ?? null : null,
    startUm: s.phase === "hoeren" ? s.zug?.startUm ?? null : null,
    aufloesungUm: s.phase === "hoeren" ? s.zug?.aufloesungUm ?? null : null,
  };
}
