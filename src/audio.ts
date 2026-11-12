// Audio-Ausschnitte (PRD F-PLY-3/6): Der Server liefert nie die ganze Datei,
// sondern einen per ffmpeg geschnittenen Ausschnitt ohne Metadaten (Anti-Cheat),
// mit Ein-/Ausblenden und optional angeglichener Lautstärke.
// Apple-/Deezer-Vorschauen: kein Schnitt, das Token führt per Weiterleitung direkt zur Hörprobe
// beim Dienst (der Server speichert und liefert nichts davon aus).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "./config.ts";
import { istApple, songHolen, vollerPfad } from "./bibliothek.ts";
import { liveTreffer } from "./vorschau.ts";

const cacheOrdner = path.join(config.datenOrdner, "ausschnitte");
fs.mkdirSync(cacheOrdner, { recursive: true });

/** Fertiger Ausschnitt: eigene Datei oder Link zur Hörprobe beim Dienst */
export type Ausschnitt = { datei: string } | { url: string };

interface Freigabe {
  holen: (erneuern: boolean) => Promise<Ausschnitt>;
  ablauf: number;
}

/** Opake Token → fertiger Ausschnitt. Gilt nur für den laufenden Zug. */
const freigaben = new Map<string, Freigabe>();
/** Ausschnitte, die gerade geschnitten werden (Ziel-Datei → Promise). */
const inArbeit = new Map<string, Promise<string>>();

function ausschnittErzeugen(quelle: string, startMs: number, sek: number, ziel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fade = Math.min(1.5, sek / 6);
    const filter = [`afade=t=in:st=0:d=${fade}`, `afade=t=out:st=${Math.max(0, sek - fade)}:d=${fade}`];
    if (config.lautheitAngleichen) filter.unshift("loudnorm=I=-16:TP=-1.5:LRA=11");
    const tmp = `${ziel}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp.mp3`; // eindeutig, auch bei parallelen Räumen
    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", (startMs / 1000).toFixed(2),
      "-t", String(sek),
      "-i", quelle,
      "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-map_metadata", "-1", "-map_chapters", "-1",
      "-af", filter.join(","),
      "-ac", "2", "-ar", "44100",
      "-c:a", "libmp3lame", "-b:a", "160k",
      "-id3v2_version", "0", "-write_xing", "1",
      "-f", "mp3", tmp,
    ];
    const p = spawn(config.ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let fehler = "";
    p.stderr.on("data", (d) => (fehler += d));
    p.on("error", reject);
    p.on("close", async (code) => {
      try {
        if (code !== 0) {
          await fsp.rm(tmp, { force: true });
          throw new Error(`ffmpeg ${code}: ${fehler.slice(0, 300)}`);
        }
        await fsp.rename(tmp, ziel);
        resolve(ziel);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Startpunkt zufällig zwischen 20 % und 60 % der Songlänge. */
export function startpunkt(dauerMs: number, sek: number): number {
  if (!dauerMs || dauerMs < sek * 1000 + 5000) return 0;
  const min = dauerMs * 0.2;
  const max = Math.min(dauerMs * 0.6, dauerMs - sek * 1000 - 2000);
  if (max <= min) return Math.max(0, Math.floor(min));
  return Math.floor(min + Math.random() * (max - min));
}

/** Bereitet den Ausschnitt für einen Zug vor und gibt ein opakes Token zurück. */
export function ausschnittFreigeben(songId: string, sek: number): string {
  const z = songHolen(songId);
  if (!z) throw new Error("Song nicht gefunden");
  let holen: Freigabe["holen"];
  if (istApple(z)) {
    // Keine Promise für die ganze Runde festhalten: Fehler müssen erneut versucht
    // und ablaufende Links beim nächsten Abruf durch den Vorschau-Cache ersetzt werden.
    holen = (erneuern) => liveTreffer(z, erneuern).then((t) => ({ url: t.vorschau }));
  } else {
    const start = startpunkt(z.dauer_ms, sek);
    const schluessel = crypto.createHash("sha256").update(`${z.id}|${z.mtime}|${start}|${sek}|${config.lautheitAngleichen}`).digest("hex").slice(0, 32);
    const datei = path.join(cacheOrdner, `${schluessel}.mp3`);
    holen = () => {
      // Gleicher Ausschnitt in zwei Räumen gleichzeitig → nur einmal schneiden.
      // Nach einem ffmpeg-Fehler darf derselbe Ausschnitt neu vorbereitet werden.
      let fertig = fs.existsSync(datei) ? Promise.resolve(datei) : inArbeit.get(datei);
      if (!fertig) {
        fertig = ausschnittErzeugen(vollerPfad(z), start, sek, datei).finally(() => inArbeit.delete(datei));
        inArbeit.set(datei, fertig);
      }
      return fertig.then((d) => ({ datei: d }));
    };
  }
  void holen(false).catch((err) => console.warn(`[audio] ${z.pfad}: ${err.message}`));
  const token = crypto.randomBytes(18).toString("base64url");
  freigaben.set(token, { holen, ablauf: Date.now() + 30 * 60_000 });
  return token;
}

export function freigabeEntziehen(token: string | undefined): void {
  if (token) freigaben.delete(token);
}

export async function ausschnittHolen(token: string, erneuern = false): Promise<Ausschnitt | null> {
  const f = freigaben.get(token);
  if (!f || f.ablauf <= Date.now()) return null;
  const ziel = await f.holen(erneuern);
  // Während einer langsamen Dienstabfrage kann die Runde bereits beendet worden sein.
  return freigaben.get(token) === f && f.ablauf > Date.now() ? ziel : null;
}

// Aufräumen: abgelaufene Token, Cache auf ~2 GB begrenzen
setInterval(async () => {
  const jetzt = Date.now();
  for (const [t, f] of freigaben) if (f.ablauf < jetzt) freigaben.delete(t);
  try {
    const dateien = await Promise.all(
      (await fsp.readdir(cacheOrdner)).map(async (n) => {
        const p = path.join(cacheOrdner, n);
        const st = await fsp.stat(p);
        return { p, groesse: st.size, zeit: st.atimeMs };
      }),
    );
    let summe = dateien.reduce((s, d) => s + d.groesse, 0);
    for (const d of dateien.sort((a, b) => a.zeit - b.zeit)) {
      if (summe < 2e9) break;
      await fsp.rm(d.p, { force: true });
      summe -= d.groesse;
    }
  } catch {
    /* egal */
  }
}, 10 * 60_000).unref();
