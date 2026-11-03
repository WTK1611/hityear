// Diagnose-Meldungen (Verbindungen, Abgleich, Verzug …): einzeln nur mit ZEITSTRAHL_DIAGNOSE=1,
// sonst alle 30 Minuten eine Zeile mit den Zählern. Auffälliges (z. B. Verzug ab 5 s) steht immer im Log.
const laut = process.env.ZEITSTRAHL_DIAGNOSE === "1";
const zaehler = new Map<string, number>();

/** Steuerzeichen raus (keine gefälschten Logzeilen über Namen oder Gerätedaten), Länge begrenzen. */
export const sauber = (x: unknown, max = 300): string => String(x ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max);

export function diagnose(art: string, text: string, auffaellig = false): void {
  if (laut || auffaellig) return void console.log(`[${art}] ${sauber(text)}`);
  zaehler.set(art, (zaehler.get(art) ?? 0) + 1);
}

setInterval(() => {
  if (!zaehler.size) return;
  console.log(`[diagnose] letzte 30 min: ${[...zaehler].map(([art, n]) => `${art} ${n}`).join(", ")} (Einzelheiten mit ZEITSTRAHL_DIAGNOSE=1)`);
  zaehler.clear();
}, 30 * 60_000).unref();
