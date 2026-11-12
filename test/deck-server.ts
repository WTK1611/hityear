// Nur für Browsertests: vollständiger Server mit künstlichen Songs und simulierten Musikdiensten.
import { db } from "../src/db.ts";
import { streamZeileAnlegen } from "../src/bibliothek.ts";
import { deckAnlegen } from "../src/listen.ts";
import { liveTreffer } from "../src/vorschau.ts";

let ersterAbruf = true;
globalThis.fetch = async (eingabe, optionen) => {
  const url = new URL(String(eingabe));
  if (optionen?.method === "HEAD") {
    const fehlt = url.pathname.includes("alt") || url.pathname.includes("/2.mp3");
    const unklar = url.pathname.includes("/3.mp3");
    if (url.pathname === "/1.mp3") console.log("[deck-test] frischer Link geprüft");
    return new Response(null, { status: fehlt ? 404 : unklar ? 429 : 200, headers: { "content-type": "audio/mpeg" } });
  }
  if (url.hostname === "api.deezer.com" && url.pathname.startsWith("/track/")) {
    const id = Number(url.pathname.split("/").at(-1));
    const alt = id === 1 && ersterAbruf;
    if (id === 1) ersterAbruf = false;
    return Response.json({ id, title: `Testlied ${id}`, artist: { name: `Testband ${id}` },
      preview: `https://cdn.dzcdn.net/${alt ? "alt" : id}.mp3?exp=${Math.floor(Date.now() / 1000) + 3600}`, readable: true });
  }
  return Response.json({ data: [], results: [] });
};

const songs = Array.from({ length: 12 }, (_, i) => streamZeileAnlegen(`@apple/deezer-${i + 1}.m4a`, {
  interpret: `Testband ${i + 1}`, titel: `Testlied ${i + 1}`, album: null, genre: null, cover: null,
}));
db.prepare("UPDATE songs SET jahr = 1990, tag_jahr = 1990, jahr_quelle = 'tag', pruefen = 0").run();
deckAnlegen("Prüfdeck", "eigen", songs.map(z => ({ interpret: z.interpret, titel: z.titel, jahr: 1990, songId: z.id })));
await liveTreffer(songs[0]); // scheinbar gültiger, tatsächlich defekter Link im Cache
await import("../src/server.ts");
