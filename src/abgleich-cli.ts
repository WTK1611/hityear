// Abgleich ohne Server: liest einen Musikordner ein (z. B. die gemountete
// Synology-Freigabe) und prüft alle Songlisten dagegen.
//
//   npm run abgleich -- /Volumes/audio            (alben/, sampler/ … werden rekursiv gelesen)
//   npm run abgleich -- /Volumes/audio /Volumes/charts
//
// Ergebnis: Übersicht im Terminal + CSV je Liste (gefunden/fehlend) im Ordner ./abgleich/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [musik, charts] = process.argv.slice(2);
if (!musik || !fs.existsSync(musik)) {
  console.error("Aufruf: npm run abgleich -- <Musikordner> [Charts-/Listen-Ordner]");
  process.exit(1);
}
process.env.ZEITSTRAHL_MUSIK = path.resolve(musik);
process.env.ZEITSTRAHL_DATEN ??= path.join(os.homedir(), ".zeitstrahl-abgleich"); // Scan-Cache für schnelle Wiederholung
if (charts) {
  process.env.ZEITSTRAHL_CHARTS = path.resolve(charts);
  process.env.ZEITSTRAHL_LISTEN = path.resolve(charts);
}

const { chartsLaden, scannen, scanStatus, songHolen } = await import("./bibliothek.ts");
const { abgleichen, listenLaden, listenUebersicht } = await import("./listen.ts");

chartsLaden();
listenLaden();
const fortschritt = setInterval(() => process.stdout.write(`\r  Lese ${scanStatus.verarbeitet}/${scanStatus.gefunden} Dateien …`), 1000);
await scannen();
clearInterval(fortschritt);
console.log(`\r  ${scanStatus.gefunden} Dateien gelesen (${scanStatus.neu} neu, ${scanStatus.fehler} Fehler).        `);

const ausgabe = path.resolve("abgleich");
fs.mkdirSync(ausgabe, { recursive: true });
const csv = (felder: Array<string | number | null>) => felder.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(",");

for (const l of listenUebersicht()) {
  const a = abgleichen(l.id)!;
  const zeilen = [csv(["nr", "interpret", "titel", "jahr", "gefunden", "datei", "jahr_in_bibliothek"])];
  a.liste.eintraege.forEach((e, i) => {
    const sid = a.treffer.get(i);
    const s = sid ? songHolen(sid) : null;
    zeilen.push(csv([i + 1, e.interpret, e.titel, e.jahr, s ? "ja" : "nein", s?.pfad ?? "", s?.jahr ?? ""]));
  });
  const datei = path.join(ausgabe, `${l.id}.csv`);
  fs.writeFileSync(datei, zeilen.join("\n") + "\n");
  console.log(`\n${l.name}: ${a.treffer.size} von ${l.gesamt} gefunden → ${datei}`);
  const fehlend = a.liste.eintraege.filter((_, i) => !a.treffer.has(i));
  for (const e of fehlend.slice(0, 40)) console.log(`  ✗ ${e.interpret} – ${e.titel} (${e.jahr ?? "?"})`);
  if (fehlend.length > 40) console.log(`  … und ${fehlend.length - 40} weitere (siehe CSV)`);
}
