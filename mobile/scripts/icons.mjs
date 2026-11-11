// Bestehendes HitYear-SVG in die Größen der nativen Projekte rendern.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const mobile = path.resolve(import.meta.dirname, '..');
const svg = path.resolve(mobile, '../public/icon-maskable.svg');
const android = path.join(mobile, 'android/app/src/main/res');
for (const [dichte, faktor] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  for (const [name, dp] of [['ic_launcher', 48], ['ic_launcher_round', 48], ['ic_launcher_foreground', 108]]) {
    await sharp(svg, { density: 600 }).resize(Math.round(dp * faktor)).png().toFile(path.join(android, `mipmap-${dichte}`, `${name}.png`));
  }
}
await sharp(svg, { density: 1200 }).resize(1024).flatten({ background: '#160c26' }).png().toFile(path.join(mobile, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
const symbol = await sharp(svg, { density: 600 }).resize(320).png().toBuffer();
const splash = await sharp({ create: { width: 1366, height: 1366, channels: 3, background: '#160c26' } }).composite([{ input: symbol, gravity: 'centre' }]).png().toBuffer();
const ios = path.join(mobile, 'ios/App/App/Assets.xcassets/Splash.imageset');
for (const name of await fs.readdir(ios)) if (name.endsWith('.png')) await fs.writeFile(path.join(ios, name), splash);
for (const ordner of await fs.readdir(android)) {
  if (ordner.startsWith('drawable')) {
    const ziel = path.join(android, ordner, 'splash.png');
    try { await fs.access(ziel); await fs.writeFile(ziel, splash); } catch { /* nicht jede Dichte hat ein Startbild */ }
  }
}
console.log('Native Icons und Startbilder aus dem vorhandenen HitYear-Logo erstellt.');
