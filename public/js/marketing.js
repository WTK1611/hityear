"use strict";
// Marketing-Seite: fertige Posttexte (Deutsch/Englisch) zum Kopieren und Bilder zum Herunterladen.

const LINK = "https://hityear.app";
const REPO = "https://github.com/WTK1611/hityear";

const BILDER = [
  { titel: "Quadrat 1080 × 1080", wo: "Instagram- und Facebook-Feed, Mastodon, Bluesky", datei: (s) => `/marketing/hityear-quadrat-${s}.jpg` },
  { titel: "Hochformat 1080 × 1920", wo: "Story, Reels, TikTok, WhatsApp-Status", datei: (s) => `/marketing/hityear-story-${s}.jpg` },
  { titel: "Link-Vorschau 1200 × 630", wo: "X, LinkedIn, Facebook-Link, Reddit", datei: () => "/og-bild.jpg" },
];

const POSTS = [
  {
    titel: "Instagram / Facebook (Feed)",
    hinweis: "Mit dem Quadrat-Bild. Link in die Bio oder als Link-Sticker in der Story.",
    de: `Wann kam der Song raus? 🎶

HitYear ist das Musik-Partyspiel für euren nächsten Abend mit Freunden: Ein Song läuft, alle hören rein und legen ihn auf dem Handy in ihren eigenen Zeitstrahl. Wer zuerst genug Karten richtig liegen hat, gewinnt.

✔️ kostenlos
✔️ keine App, kein Konto
✔️ 1–6 Handys, freie Plätze übernehmen Bots
✔️ auch online, wenn ihr nicht im selben Raum seid

Einfach hityear.app am Fernseher öffnen, QR-Code scannen, los geht's.

#HitYear #Musikquiz #Partyspiel #Spieleabend #Musik #Quiz #80er #90er`,
    en: `When did the song come out? 🎶

HitYear is the music party game for your next night in with friends: a song plays, everyone listens and places it in their own timeline on their phone. First to get enough cards right wins.

✔️ free
✔️ no app, no account
✔️ 1–6 phones, bots fill free seats
✔️ works online too, if you're not in the same room

Open hityear.app on your TV, scan the QR code, play.

#HitYear #MusicQuiz #PartyGame #GameNight #Music #Trivia #80s #90s`,
  },
  {
    titel: "Story",
    hinweis: "Mit dem Hochformat-Bild. Link-Sticker auf hityear.app setzen, Text als Overlay oben.",
    de: `Wie gut kennst du deine Hits? 🎧
Song hören, Jahr legen – wer liegt richtig?
👉 hityear.app`,
    en: `How well do you know your hits? 🎧
Hear the song, place the year – who gets it right?
👉 hityear.app`,
  },
  {
    titel: "TikTok / Reels (Video)",
    hinweis: "Idee: TV zeigt den QR-Code, drei Handys scannen, jemand legt den Song ins falsche Jahrzehnt, Auflösung, Jubel oder Stöhnen. Hook in den ersten zwei Sekunden. Ton aus der Plattform-Bibliothek, nicht den Spielton.",
    de: `Wer liegt beim Erscheinungsjahr am nächsten? 😅🎶
Kostenloses Musik-Partyspiel im Browser – Handy als Controller, keine App.
👉 hityear.app

#HitYear #Musikquiz #Spieleabend #Partyspiel #Musik`,
    en: `Who gets closest to the release year? 😅🎶
Free music party game in your browser – your phone is the controller, no app.
👉 hityear.app

#HitYear #MusicQuiz #GameNight #PartyGame #Music`,
  },
  {
    titel: "X / Bluesky / Threads",
    hinweis: "Höchstens 280 Zeichen (X). Mit dem Link erscheint die Link-Vorschau automatisch.",
    de: `Neues Musik-Partyspiel im Browser: Song hören, Erscheinungsjahr schätzen, Karten im eigenen Zeitstrahl sammeln. Handys sind die Controller, der Fernseher die Bühne. Kostenlos, ohne App, Open Source. 🎶

${LINK}`,
    en: `A free music party game in your browser: hear a song, guess the release year, build your own timeline. Phones are the controllers, the TV is the stage. No app, no account, open source. 🎶

${LINK}`,
  },
  {
    titel: "Mastodon",
    hinweis: "Open-Source-Publikum: Technik und Datenschutz nach vorn.",
    de: `Ich habe HitYear gebaut: ein Musik-Partyspiel im Browser. Ein 30-Sekunden-Ausschnitt läuft, alle sortieren den Song auf dem Handy nach Erscheinungsjahr in ihren Zeitstrahl.

Node.js, TypeScript, Socket.IO, kein Frontend-Framework. Keine Werbung, kein Konto, Statistik nur mit Einwilligung.

Spielen: ${LINK}
Code: ${REPO}

#OpenSource #NodeJS #TypeScript #Gaming #Musik #HitYear`,
    en: `I built HitYear: a music party game in the browser. A 30-second preview plays, everyone sorts the song by release year into their own timeline on their phone.

Node.js, TypeScript, Socket.IO, no frontend framework. No ads, no account, analytics only with consent.

Play: ${LINK}
Code: ${REPO}

#OpenSource #NodeJS #TypeScript #Gaming #Music #HitYear`,
  },
  {
    titel: "LinkedIn",
    hinweis: "Als Nebenprojekt erzählen, mit der Link-Vorschau oder dem Quadrat-Bild.",
    de: `Nebenprojekt fertig: HitYear 🎶

Ein Musik-Partyspiel im Browser. Der Fernseher spielt einen Song, alle legen ihn auf dem Handy ins richtige Jahr. Wer zuerst genug Karten richtig hat, gewinnt.

Was mich daran gereizt hat:
• Echtzeit für bis zu sechs Handys und einen Bildschirm mit Socket.IO
• Hörproben direkt von Deezer streamen, statt Musik zu speichern
• eine installierbare Web-App in 29 Sprachen, ohne Framework
• Open Source auf GitHub

Kostenlos ausprobieren: ${LINK}
Feedback ist sehr willkommen!

#SideProject #OpenSource #WebDevelopment #TypeScript #GameDev`,
    en: `Side project shipped: HitYear 🎶

A music party game in the browser. The TV plays a song, everyone places it in the right year on their phone. First to get enough cards right wins.

What I enjoyed building:
• real time for up to six phones and one screen with Socket.IO
• streaming previews straight from Deezer instead of storing music
• an installable web app in 29 languages, no framework
• open source on GitHub

Try it for free: ${LINK}
Feedback very welcome!

#SideProject #OpenSource #WebDevelopment #TypeScript #GameDev`,
  },
  {
    titel: "Reddit",
    hinweis: "Passende Subreddits z. B. r/WebGames, r/opensource, r/SideProject, r/partygames. Vorher die Regeln lesen und offen sagen, dass du der Entwickler bist. Erste Zeile ist der Titel.",
    de: `Ich habe HitYear gebaut – ein kostenloses Musik-Partyspiel im Browser, Handys als Controller

Hallo! HitYear ist mein Nebenprojekt für Spieleabende: Der Fernseher oder Laptop spielt einen 30-Sekunden-Ausschnitt, alle legen den Song auf dem Handy ins richtige Jahr ihres Zeitstrahls. Wer zuerst genug Karten richtig hat, gewinnt.

• 1–6 Spieler, freie Plätze übernehmen Bots
• alle gleichzeitig oder reihum
• Decks nach Land und Thema, Filter nach Jahrzehnt und Genre
• auch online: dann spielt jedes Handy die Musik selbst
• keine Werbung, kein Konto, keine App

Spielen: ${LINK}
Code: ${REPO} (nicht-kommerzielle Lizenz)

Ich freue mich über Feedback, vor allem zu den Decks und der Bedienung am Handy.`,
    en: `I made HitYear – a free music party game in the browser, phones are the controllers

Hi! HitYear is my side project for game nights: the TV or laptop plays a 30-second preview, everyone places the song in the right year of their own timeline on their phone. First to get enough cards right wins.

• 1–6 players, bots fill free seats
• everyone at once or taking turns
• decks by country and theme, filters by decade and genre
• works online too: then every phone plays the music itself
• no ads, no account, no app

Play: ${LINK}
Code: ${REPO} (noncommercial license)

I'd love feedback, especially on the decks and the phone controls.`,
  },
  {
    titel: "Show HN (Hacker News)",
    hinweis: "Titel in die Titelzeile, Link auf hityear.app, Text als ersten Kommentar.",
    de: `Show HN: HitYear – Musik-Partyspiel im Browser, Handys als Controller

Ein Bildschirm spielt eine 30-Sekunden-Hörprobe, jeder Spieler legt den Song auf dem Handy nach Erscheinungsjahr in seinen Zeitstrahl. Node.js/TypeScript mit Socket.IO, Frontend ohne Framework, Hörproben kommen direkt von Deezer (Apple Music als Ersatz), der Server speichert keine Musik. Installierbare PWA, 29 Sprachen, Bots für freie Plätze. Quellcode: ${REPO}`,
    en: `Show HN: HitYear – a music party game in the browser, phones as controllers

One screen plays a 30-second preview, every player places the song by release year into their own timeline on their phone. Node.js/TypeScript with Socket.IO, framework-free frontend, previews stream straight from Deezer (Apple Music as a fallback), the server stores no music. Installable PWA, 29 languages, bots for free seats. Source: ${REPO}`,
  },
  {
    titel: "WhatsApp / Telegram (Einladung)",
    hinweis: "Zum Weiterleiten an Freunde vor dem Spieleabend.",
    de: `Spieleabend? 🎶 Lass uns HitYear spielen: Songs hören und raten, aus welchem Jahr sie sind. Ich mach's am Fernseher auf, ihr scannt nur den QR-Code – keine App nötig.
${LINK}`,
    en: `Game night? 🎶 Let's play HitYear: listen to songs and guess which year they're from. I'll open it on the TV, you just scan the QR code – no app needed.
${LINK}`,
  },
];

const HASHTAGS = {
  de: "#HitYear #Musikquiz #Partyspiel #Spieleabend #Musik #Quiz #Party #Hits #80er #90er #Schlager #OpenSource",
  en: "#HitYear #MusicQuiz #PartyGame #GameNight #Music #Trivia #Party #Hits #80s #90s #Throwback #OpenSource",
};

const KURZ = [
  {
    titel: "Ein Satz",
    de: "HitYear ist ein kostenloses Musik-Partyspiel im Browser: Song hören, Erscheinungsjahr schätzen, Karten im eigenen Zeitstrahl sammeln.",
    en: "HitYear is a free music party game in your browser: hear a song, guess the release year, collect cards in your own timeline.",
  },
  {
    titel: "Profil / Bio",
    de: "🎶 Wann kam der Song raus? Das Musik-Partyspiel im Browser. Kostenlos, ohne App. hityear.app",
    en: "🎶 When did the song come out? The music party game in your browser. Free, no app. hityear.app",
  },
  {
    titel: "Etwa 50 Wörter",
    de: "HitYear ist ein Musik-Partyspiel für 1–6 Personen. Der Fernseher oder Laptop spielt einen 30-Sekunden-Ausschnitt, alle legen den Song auf dem Handy vor, zwischen oder hinter ihre Karten. Richtig gelegt heißt: Karte behalten. Kostenlos, ohne App und Konto, in 29 Sprachen und Open Source.",
    en: "HitYear is a music party game for 1–6 people. The TV or laptop plays a 30-second preview, and everyone places the song before, between or after their cards on their phone. Placed correctly means you keep the card. Free, no app or account, 29 languages and open source.",
  },
];

let sprache = "de";

function kopierKnopf(text) {
  const knopf = el("button", { type: "button", class: "zweit mk-kopieren", text: "Kopieren" });
  knopf.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text());
      knopf.textContent = "✓ Kopiert";
    } catch {
      knopf.textContent = "Bitte markieren und kopieren";
    }
    setTimeout(() => (knopf.textContent = "Kopieren"), 2000);
  });
  return knopf;
}

function textKarte(titel, hinweis, text) {
  const zeichen = [...text].length;
  return el(
    "section",
    { class: "mk-post" },
    el("div", { class: "mk-kopf" }, el("h3", { text: titel }), el("span", { class: "leise klein", text: `${zeichen} Zeichen` }), kopierKnopf(() => text)),
    hinweis ? el("p", { class: "leise klein", text: hinweis }) : null,
    el("pre", { text }),
  );
}

function zeichnen() {
  $("#mk-bilder").replaceChildren(
    ...BILDER.map((b) =>
      el(
        "figure",
        { class: "mk-bild" },
        el("a", { href: b.datei(sprache), target: "_blank", rel: "noopener" }, el("img", { src: b.datei(sprache), alt: b.titel, loading: "lazy" })),
        el("figcaption", {}, el("strong", { text: b.titel }), el("span", { class: "leise klein", text: b.wo }), el("a", { class: "knopf", href: b.datei(sprache), download: "", text: "Herunterladen" })),
      ),
    ),
  );
  $("#mk-posts").replaceChildren(...POSTS.map((p) => textKarte(p.titel, p.hinweis, p[sprache])));
  $("#mk-hashtags").replaceChildren(textKarte("Hashtags", "", HASHTAGS[sprache]));
  $("#mk-kurz").replaceChildren(...KURZ.map((k) => textKarte(k.titel, "", k[sprache])));
}

for (const b of document.querySelectorAll(".mk-sprache button")) {
  b.addEventListener("click", () => {
    sprache = b.dataset.sprache;
    for (const x of document.querySelectorAll(".mk-sprache button")) x.classList.toggle("aktiv", x === b);
    zeichnen();
  });
}
zeichnen();
