// Der iOS-Kamerahinweis verwendet dieselben Übersetzungen wie der Datenschutztext der App.
import fs from 'node:fs/promises';
import path from 'node:path';
const mobile = path.resolve(import.meta.dirname, '..');
const ordner = path.resolve(mobile, '../public/js/sprachen');
const hinweis = 'Die App nutzt die Kamera nur mit deiner Erlaubnis zum QR-Scannen. Kamerabilder werden nicht gespeichert oder übertragen. Das Mikrofon wird nicht verwendet.';
const texte = new Map([['de', hinweis]]);
for (const name of await fs.readdir(ordner)) {
  if (!name.endsWith('.js')) continue;
  let tabelle;
  new Function('uebersetzungLaden', await fs.readFile(path.join(ordner, name), 'utf8'))((t) => { tabelle = t; });
  const text = tabelle[hinweis];
  if (!text) throw new Error(`Kamerahinweis fehlt: ${name}`);
  texte.set(name.slice(0, -3), text);
}
for (const [code, text] of texte) {
  const ziel = path.join(mobile, 'ios/App/App', `${code}.lproj`);
  await fs.mkdir(ziel, { recursive: true });
  await fs.writeFile(path.join(ziel, 'InfoPlist.strings'), `"NSCameraUsageDescription" = ${JSON.stringify(text)};\n`);
}
