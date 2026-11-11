// Zentrale Konfiguration. Alle Werte kommen aus der Umgebung (.env auf dem Server),
// nie aus dem Code. Fehlende Pflichtwerte brechen den Start in Produktion ab.
import path from "node:path";
import crypto from "node:crypto";

const produktion = process.env.NODE_ENV === "production";

function zahl(name: string, standard: number): number {
  const roh = process.env[name];
  if (!roh) return standard;
  const n = Number(roh);
  return Number.isFinite(n) ? n : standard;
}

function geheim(name: string, mindestens = 12): string {
  const wert = process.env[name] ?? "";
  if (produktion && wert.length < mindestens) {
    throw new Error(`${name} fehlt oder ist kürzer als ${mindestens} Zeichen (siehe deploy/.env.example)`);
  }
  return wert;
}

const wurzel = path.resolve(import.meta.dirname, "..");

export const config = {
  produktion,
  port: zahl("PORT", 3700),
  host: process.env.HOST ?? "0.0.0.0",
  musikOrdner: path.resolve(process.env.ZEITSTRAHL_MUSIK ?? path.join(wurzel, "musik")),
  datenOrdner: path.resolve(process.env.ZEITSTRAHL_DATEN ?? path.join(wurzel, ".daten")),
  /** Hochgeladene Songs (Admin, Drag & Drop) – beschreibbar, im Daten-Volume. */
  /** Apple-Music-Vorschauen (30 s, mit Tags und Cover) – beschreibbar, im Daten-Volume. */
  appleOrdner: path.join(path.resolve(process.env.ZEITSTRAHL_DATEN ?? path.join(wurzel, ".daten")), "apple"),
  /** Land für die iTunes-Suche (Katalog und Vorschauen). */
  appleLand: (process.env.ZEITSTRAHL_APPLE_LAND ?? "DE").slice(0, 2).toUpperCase(),
  /** Höchstgröße je hochgeladener Datei in MB. */
  publicOrdner: path.join(wurzel, "public"),
  chartsDatei: path.join(wurzel, "data", "jahrescharts.csv"),
  /** „passwort“: App erst nach Eingabe des Passworts nutzbar (QR-Einladungen gelten weiter); sonst offen für alle. */
  zugangMitPasswort: (process.env.ZEITSTRAHL_ZUGANG ?? "offen") === "passwort",
  /** Passwort für Mitspieler (privater Kreis). */
  // gemeinsames Passwort für alle Gäste: 8 Zeichen reichen, Fehlversuche sperrt das Rate-Limit (10 je 10 min)
  passwort: geheim("ZEITSTRAHL_PASSWORT", 8) || "zeitstrahl",
  /** Passwort für Bibliothekspflege (Jahre korrigieren, Scan starten). */
  adminPasswort: geheim("ZEITSTRAHL_ADMIN_PASSWORT", 8) || "admin",
  /** Schlüssel für die Sitzungs-Cookies. */
  sitzungsSchluessel: geheim("ZEITSTRAHL_SECRET") || crypto.randomBytes(32).toString("hex"),
  /** Öffentliche Basis-URL (für QR-Codes), z. B. https://spiel.example.de */
  basisUrl: (process.env.ZEITSTRAHL_BASIS_URL ?? "").replace(/\/$/, ""),
  /** Lokale WebView-Ursprünge der installierten Apps; weitere nur ausdrücklich konfigurieren. */
  appUrspruenge: (process.env.ZEITSTRAHL_APP_ORIGINS ?? "capacitor://localhost,https://localhost").split(",").map((s) => s.trim()).filter(Boolean),
  /** Matomo (Statistik, nur nach Einwilligung im Banner): Adresse der Matomo-Instanz und Website-ID; leer = aus. */
  matomoUrl: /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(process.env.ZEITSTRAHL_MATOMO_URL ?? "") ? process.env.ZEITSTRAHL_MATOMO_URL!.replace(/\/$/, "") : "",
  matomoId: /^\d{1,6}$/.test(process.env.ZEITSTRAHL_MATOMO_ID ?? "") ? process.env.ZEITSTRAHL_MATOMO_ID! : "",
  ffmpeg: process.env.FFMPEG ?? "ffmpeg",
  /** Lautstärke angleichen (ffmpeg loudnorm). */
  lautheitAngleichen: (process.env.ZEITSTRAHL_LOUDNORM ?? "1") !== "0",
  /** Hinter Caddy/nginx: X-Forwarded-* vertrauen. */
  hinterProxy: (process.env.ZEITSTRAHL_PROXY ?? (produktion ? "1" : "0")) === "1",
};
