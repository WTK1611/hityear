"use strict";

(async () => {
  await anmeldungPruefen();
  const socket = verbinden();
  const audio = audioSpieler();
  const startsongAudio = audioSpieler(); // eigener Spieler: der erste Song lädt derweil schon
  let autoGestartet = null;
  let countdownFuer = null;
  let zustand = null;
  let bibliothek = null;
  let aufgedeckt = null; // Schlüssel der zuletzt gezeigten Auflösung

  // „Keine Verbindung“ meldet schon das gelbe Banner (gemeinsam.js) – nicht doppelt zeigen
  const fehler = (t) => ($("#fehler").textContent = t === "Keine Verbindung zum Server." ? "" : t || "");
  const tun = async (ereignis, daten) => {
    fehler("");
    try {
      return await socket.anfrage(ereignis, daten);
    } catch (err) {
      fehler(err.message);
      return null;
    }
  };

  let platteDrehen = () => {};
  // ---------- Player („Jetzt läuft“) ----------
  // Die Platte ist der Play/Pause-Knopf: Klick hält an (bremst ab wie ein Plattenspieler) oder spielt weiter
  const platte = el("div", { class: "platte handgedreht", role: "button", tabindex: "0", "aria-label": "Abspielen" });
  const eq = equalizerEl(audio.element, 32);
  eq.dataset.tvFokus = ""; // am Fernseher vorgewählt: → schaltet gleich durch die Equalizer
  // Während des Spiels schalten ←/→ (Fernbedienung und PC-Tastatur) immer die Equalizer durch, ↑/↓ navigieren weiter
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target === eq || !eq.isConnected || eq.closest(".versteckt") || document.activeElement?.matches?.("input, textarea, select")) return;
    e.preventDefault();
    e.stopPropagation();
    eq.focus({ preventScroll: true });
    eq.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }));
  }, true);
  $("#eq-platz").replaceWith(eq);
  playerBinden(audio.element, {
    leiste: $("#t-leiste"),
    jetzt: $("#t-jetzt"),
    ende: $("#t-ende"),
    animiert: [platte, eq],
  });
  // Drehung per Skript statt CSS-Animation, damit sie sanft abbremst und wieder anläuft
  {
    const UMDREHUNG_MS = 3000;
    let winkel = 0;
    let tempo = 0; // 0 … 1 (volle Drehzahl)
    let soll = 0;
    let zuletzt = 0;
    let bild = 0;
    const drehen = (t) => {
      const dt = zuletzt ? Math.min(100, t - zuletzt) : 16;
      zuletzt = t;
      // anlaufen in ~0,5 s, abbremsen in ~1,2 s
      tempo = soll > tempo ? Math.min(soll, tempo + dt / 500) : Math.max(soll, tempo - dt / 1200);
      winkel = (winkel + (360 * dt * tempo) / UMDREHUNG_MS) % 360;
      platte.style.transform = `rotate(${winkel.toFixed(2)}deg)`;
      bild = tempo > 0 || soll > 0 ? requestAnimationFrame(drehen) : 0;
      if (!bild) zuletzt = 0;
    };
    const ruhig = matchMedia("(prefers-reduced-motion: reduce)");
    platteDrehen = (an) => {
      soll = an && !ruhig.matches ? 1 : 0;
      if (!bild) bild = requestAnimationFrame(drehen);
    };
    audio.element.addEventListener("playing", () => platteDrehen(true));
    for (const ev of ["pause", "ended", "emptied"]) audio.element.addEventListener(ev, () => platteDrehen(false));
  }

  // ---------- Einstellungen ----------
  try {
    bibliothek = await api("/api/bibliothek");
  } catch {
    bibliothek = {};
  }
  // Alle Decks: fehlende Songs ergänzt der Server selbst (Streaming), es muss nichts heruntergeladen sein
  for (const l of bibliothek.listen ?? []) $("#liste").append(el("option", { value: l.id, text: l.name }));
  // Filter: Jahrzehnte und Genres als bunte Chips (nichts gewählt = alle)
  const jzBox = $("#jahrzehnte");
  const genreBox = $("#genres");
  const chip = (wert, text, anzahl, farbton) => {
    const l = el("label", {}, el("input", { type: "checkbox", value: wert, onchange: einstellungenSenden }), text, el("span", { class: "leise klein", text: `(${anzahl})` }));
    l.style.setProperty("--farbton", String(farbton));
    return l;
  };
  for (const { jahrzehnt, anzahl } of (bibliothek.jahrzehnte ?? []).filter((j) => j.anzahl >= 10)) {
    jzBox.append(chip(jahrzehnt, `${String(jahrzehnt).slice(2)}er`, anzahl, (jahrzehnt - 1950) * 4.5 % 360));
  }
  const GENRE_NAMEN = { pop: "🎤 Pop", rock: "🎸 Rock", dance: "🪩 Dance & Elektro", hiphop: "🎧 Hip-Hop & Rap", rnb: "💜 R&B & Soul", schlager: "🥨 Schlager", film: "🎬 Filmmusik" };
  (bibliothek.genres ?? []).filter((g) => g.anzahl >= 10).forEach(({ genre, anzahl }, i) => genreBox.append(chip(genre, GENRE_NAMEN[genre] ?? genre, anzahl, (i * 51 + 20) % 360)));
  const gewaehlt = (box) => [...box.querySelectorAll("input:checked")].map((i) => i.value);

  // Jahrzehnte/Genres nur bei der ganzen Bibliothek und den Jahrescharts-Decks – feste Decks spielt man komplett
  function filterMoeglich() {
    const liste = $("#liste");
    return !liste.value || /^Jahres/i.test(liste.selectedOptions[0]?.text ?? "");
  }
  function einstellungenLesen() {
    return {
      zielKarten: Number($("#ziel").value),
      wiedergabe: $("#wiedergabe").value,
      zeitlimit: true,
      nichtErraten: "offen", // keine Frage mehr im Setup: Lösung zeigen, Song kommt später nochmal
      modus: $("#modus").value,
      warten: $("#warten").value,
      raten: Boolean($("#raten-was").value),
      ratenWas: $("#raten-was").value || "beide",
      auffuellen: $("#auffuellen").checked,
      ohneBots: zustand?.einstellungen?.ohneBots ?? [],
      liste: $("#liste").value || null,
      jahrzehnte: filterMoeglich() ? gewaehlt(jzBox).map(Number) : [],
      genres: filterMoeglich() ? gewaehlt(genreBox) : [],
    };
  }
  function einstellungenSenden() {
    tun("host:einstellungen", einstellungenLesen());
  }
  for (const id of ["#ziel", "#wiedergabe", "#modus", "#warten", "#raten-was", "#auffuellen", "#liste"]) $(id).addEventListener("change", einstellungenSenden);

  // ---------- Geführte Einrichtung ----------
  // Eine Frage pro Schritt, die Antworten als große Knöpfe (am Handy gut zu tippen, keine Dropdowns).
  // Die versteckten Felder in #einstellungen-quelle bleiben die Quelle für einstellungenLesen().
  const verfuegbarText = el("p", { class: "leise klein verfuegbar" });
  const startKnopf = el("button", { type: "button", id: "starten", class: "gross", disabled: true, text: "Spiel starten ✨" });
  // Bilder für die Antwort-Kacheln der Einrichtung: flächige, weiße Formen im 200×134-Raster (sitzen unten rechts im Cover).
  // Farben: Weiß, Dunkel (#160c26) für Bildschirme/Augen, Gelb (#ffd93d) für Sterne und Akzente.
  const W = "#fff", D = "#160c26", G = "#ffd93d";
  const g = (x, y, s, inhalt, extra = "") => `<g transform="translate(${x} ${y}) scale(${s})"${extra}>${inhalt}</g>`;
  const karte = (x, y, s = 1, jahr = "1985") => g(x, y, s,
    `<rect width="46" height="62" rx="7" fill="${W}"/><rect x="6" y="7" width="34" height="28" rx="4" fill="${D}" opacity=".18"/>` +
    `<text x="23" y="53" font-size="13" font-weight="900" text-anchor="middle" fill="${D}" font-family="Nunito, system-ui, sans-serif">${jahr}</text>`);
  const note = (x, y, s = 1, farbe = W) => g(x, y, s,
    `<rect x="17" y="0" width="6" height="36" rx="2" fill="${farbe}"/><ellipse cx="11" cy="37" rx="11" ry="7.5" transform="rotate(-18 11 37)" fill="${farbe}"/>` +
    `<path d="M23 0c12 4 17 12 14 24-2-7-7-11-14-12z" fill="${farbe}"/>`);
  const mikro = (x, y, s = 1, farbe = W) => g(x, y, s,
    `<rect x="12" y="0" width="22" height="38" rx="11" fill="${farbe}"/><path d="M5 28a18 18 0 0 0 36 0" fill="none" stroke="${farbe}" stroke-width="6" stroke-linecap="round"/>` +
    `<rect x="20" y="45" width="6" height="12" fill="${farbe}"/><rect x="9" y="56" width="28" height="6" rx="3" fill="${farbe}"/>`);
  const stern = (x, y, s = 1) => g(x, y, s, `<path d="M14 0l4.2 8.8 9.8 1.3-7.1 6.8 1.8 9.7L14 21.9l-8.7 4.7 1.8-9.7L0 10.1l9.8-1.3z" fill="${G}" stroke="${D}" stroke-width="1.5" stroke-linejoin="round"/>`);
  const handy = (x, y, s = 1, mitNote = false) => g(x, y, s,
    `<rect width="38" height="64" rx="7" fill="${W}"/><rect x="3" y="8" width="32" height="46" rx="3" fill="${D}"/><rect x="14" y="58" width="10" height="2.5" rx="1" fill="${D}"/>` +
    (mitNote ? note(9, 14, 0.55) : `<rect x="9" y="18" width="20" height="4" rx="2" fill="${W}" opacity=".5"/><rect x="9" y="27" width="20" height="4" rx="2" fill="${W}" opacity=".5"/><rect x="9" y="36" width="12" height="4" rx="2" fill="${W}" opacity=".5"/>`));
  const bogen = (x, y, s = 1, spiegel = false) => g(x, y, s,
    `<path d="M0 6q8 12 0 24M9 0q14 18 0 36" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round"/>`, spiegel ? ' transform-origin="0 0"' : "");
  const person = (x, y, s = 1, matt = false, farbe = W) => g(x, y, s,
    `<circle cx="20" cy="13" r="13" fill="${farbe}"/><path d="M0 54a20 20 0 0 1 40 0z" fill="${farbe}"/>`, matt ? ' opacity=".35"' : "");
  // weiße Plakette mit dunklem Symbol (Song, Interpret) – wie ein kleines Karten-Cover
  const plakette = (x, y, inhalt) => g(x, y, 1, `<rect width="50" height="50" rx="9" fill="${W}"/>${inhalt}`);
  const roboter = (x, y, s = 1) => g(x, y, s,
    `<rect x="18" y="4" width="4" height="9" fill="${W}"/><circle cx="20" cy="3" r="3.5" fill="${G}"/><rect x="0" y="12" width="40" height="32" rx="9" fill="${W}"/>` +
    `<circle cx="13" cy="27" r="4.5" fill="${D}"/><circle cx="27" cy="27" r="4.5" fill="${D}"/><rect x="12" y="35" width="16" height="3.5" rx="1.75" fill="${D}"/>`);
  const leerPlatz = (x, y, s = 1) => g(x, y, s, `<circle cx="20" cy="26" r="18" fill="none" stroke="${W}" stroke-width="3" stroke-dasharray="5 5" opacity=".5"/>`);
  const uhr = (x, y, s = 1, text = "5 s") => g(x, y, s,
    `<rect x="18" y="0" width="12" height="8" rx="2" fill="${W}"/><circle cx="24" cy="32" r="24" fill="${W}"/><circle cx="24" cy="32" r="18" fill="${D}"/>` +
    `<path d="M24 32V21M24 32l8 5" stroke="${W}" stroke-width="4" stroke-linecap="round"/>` +
    (text ? `<rect x="6" y="52" width="36" height="14" rx="7" fill="${G}"/><text x="24" y="62.5" font-size="10" font-weight="900" text-anchor="middle" fill="${D}" font-family="Nunito, system-ui, sans-serif">${text}</text>` : ""));
  const blitz = (x, y, s = 1) => g(x, y, s, `<path d="M26 0L0 36h18l-6 30 30-42H22z" fill="${G}" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>`);
  const haken = (x, y, s = 1) => g(x, y, s, `<circle cx="15" cy="15" r="15" fill="${W}"/><path d="M8 15l5 5 10-10" fill="none" stroke="${D}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
  const balken = (x, y, breite, anteil, text) =>
    `<rect x="${x}" y="${y}" width="${breite}" height="14" rx="7" fill="${W}" opacity=".35"/><rect x="${x}" y="${y}" width="${breite * anteil}" height="14" rx="7" fill="${W}"/>` +
    (text ? `<text x="${x + breite}" y="${y + 30}" font-size="13" font-weight="900" text-anchor="end" fill="${W}" font-family="Nunito, system-ui, sans-serif">${text}</text>` : "");
  const tv = (x, y, s = 1) => g(x, y, s,
    `<rect width="116" height="74" rx="10" fill="${W}"/><rect x="6" y="6" width="104" height="62" rx="6" fill="${D}"/>` +
    `<rect x="48" y="76" width="20" height="9" fill="${W}"/><rect x="33" y="85" width="50" height="7" rx="3.5" fill="${W}"/>` + note(44, 14, 0.75));
  const BILDER_WIEDERGABE = {
    host: tv(32, 2, 0.95) + bogen(146, 20, 0.9) + g(28, 20, 0.9, `<path d="M9 6q-8 12 0 24M0 0q-14 18 0 36" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round"/>`) +
      handy(52, 100, 0.5) + handy(90, 100, 0.5) + handy(128, 100, 0.5),
    // jedes Handy spielt die Musik selbst: Schallwellen an allen drei
    alle: handy(16, 44, 1.1, true) + bogen(62, 46, 0.55) + handy(78, 20, 1.3, true) + bogen(130, 22, 0.6) + handy(142, 44, 1.1, true) + bogen(188, 46, 0.55),
    // allein üben: ein Mensch mit seinem Handy, daneben (wer mag) ein Bot
    solo: person(22, 40, 1.3) + handy(88, 24, 1.3, true) + bogen(140, 26, 0.6) + roboter(150, 70, 0.75),
  };
  const BILDER_MODUS = {
    alle: person(30, 52, 1.1) + person(80, 40, 1.3) + person(138, 52, 1.1) + note(94, 0, 0.9),
    einzeln: person(28, 60, 0.9, true) + person(72, 22, 1.5) + person(140, 60, 0.9, true) + note(130, 10, 0.8),
  };
  const BILDER_WARTEN = {
    alle: note(26, 30, 1.2) + balken(74, 60, 110, 1, "30 s"),
    alle5: haken(20, 38, 1.1) + haken(60, 38, 1.1) + haken(100, 38, 1.1) + uhr(146, 28, 0.9),
    erster: blitz(44, 24, 1.3) + uhr(120, 28, 1),
  };
  const BILDER_RATEN = {
    "": karte(76, 20, 1.5),
    // Jahreskarte wie beim Klassiker, links davor Song und Interpret als Plaketten mit je einem Bonus-Stern
    beide: karte(40, 4, 1.5) + plakette(0, 0, note(9, 5, 0.9, D)) + plakette(0, 52, person(3, 9, 0.62, false, D) + mikro(25, 10, 0.5, D)) +
      stern(36, -8, 0.8) + stern(36, 44, 0.8),
  };
  // sechs Plätze: zwei Menschen, der Rest Bots oder leer
  const PLAETZE = [[32, 14], [82, 14], [132, 14], [32, 74], [82, 74], [132, 74]];
  const BILDER_BOTS = {
    ja: PLAETZE.map(([x, y], i) => (i < 2 ? person(x, y, 1) : roboter(x, y, 1))).join(""),
    nein: PLAETZE.map(([x, y], i) => (i < 2 ? person(x, y, 1) : leerPlatz(x, y, 1))).join(""),
  };
  // Songs pro Deck (spielbare Treffer); ganze Bibliothek = alle Songs mit Jahrzehnt
  const deckAnzahl = (wert) => wert
    ? (bibliothek.listen ?? []).find((l) => l.id === wert)?.treffer ?? 0
    : (bibliothek.jahrzehnte ?? []).reduce((summe, j) => summe + j.anzahl, 0);
  // Farbtöne aller Kacheln, der Reihe nach: Orange, Pink, Blau, Lila (wie die Kartenzahl-Kacheln)
  const FARBEN = [10, 330, 190, 265];
  const farbe = (i) => FARBEN[i % FARBEN.length];
  // aufgefächerter Stapel Song-Karten unten rechts im Cover (statt Schallplatte), Farben passend zum Cover-Farbton
  // etwas größer als gezeichnet, damit er den Platz unter dem Titel nutzt (wie die Bilder der Antwort-Kacheln)
  // „symbol“ (z. B. das Genre-Emoji) steht als Cover auf der obersten Karte
  const kartenStapel = (h, jahre = ["’80", "’95", "’07"], symbol = "") => `<g transform="translate(93 95) scale(1.15) translate(-93 -95)">` + [-16, -6, 4].map((winkel, k) =>
    `<g transform="rotate(${winkel} 76 92)"><rect x="58" y="${50 + k}" width="30" height="40" rx="4" fill="hsl(${(h + 40 * k) % 360} 85% ${62 + k * 4}%)" stroke="#fff" stroke-width="1.6"/>` +
    `<rect x="62" y="${54 + k}" width="22" height="22" rx="2" fill="#160c26" fill-opacity=".25"/><text x="73" y="${86 + k}" class="karte-jahr">${jahre[k]}</text>` +
    (symbol && k === 2 ? `<text x="73" y="${65 + k}" class="karte-symbol">${symbol}</text>` : "") + "</g>").join("") + "</g>";
  // Deck-Cover: Plattenhülle (Kartenstil: farbig mit weißem Rand) und eine Schallplatte, die rechts herausschaut.
  // Der Deck-Name gestaltet die Hülle: Land → Flagge als Hintergrund, Thema → Symbol darauf (sonst der Anfangsbuchstabe).
  const platteSvg = (cx, cy, r, etikett, klasse = "") =>
    `<g${klasse ? ` class="${klasse}"` : ""}><circle cx="${cx}" cy="${cy}" r="${r}" fill="#160c26" stroke="#fff" stroke-width="1.6"/>` +
    [0.82, 0.66].map((f) => `<circle cx="${cx}" cy="${cy}" r="${r * f}" class="rille" stroke-width=".8"/>`).join("") +
    `<path d="M${cx} ${cy - r * 0.8}a${r * 0.8} ${r * 0.8} 0 0 1 ${r * 0.69} ${r * 0.4}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="${etikett}"/><circle cx="${cx}" cy="${cy}" r="1.3" fill="#160c26"/></g>`;
  // Flaggen im 40×40-Feld der Hülle (Streifen quer „q“ oder längs „l“)
  const FLAGGEN = [
    [/deutsch|german/i, "q", ["#000", "#dd0000", "#ffce00"]], [/frankreich|france/i, "l", ["#0055a4", "#fff", "#ef4135"]],
    [/holland|niederland|netherlands/i, "q", ["#ae1c28", "#fff", "#21468b"]], [/ungarn|hungar/i, "q", ["#ce2939", "#fff", "#477050"]],
    [/kanada|canada/i, "l", ["#d52b1e", "#fff", "#fff", "#d52b1e"]], [/nordeuropa|northern europe|nordic/i, "nord", ["#006aa7", "#fecc00"]], [/mitteleuropa|central europe/i, "eu", ["#003399", "#ffcc00"]],
  ];
  // Schlager ohne Land: Strahlenkranz in Pink und Gold wie in den Hitparaden der 70er
  const strahlenkranz = () => `<rect width="40" height="40" fill="#ff3d9a"/>` +
    Array.from({ length: 12 }, (_, i) => {
      const p = (grad) => `${(20 + 40 * Math.cos((grad * Math.PI) / 180)).toFixed(1)} ${(20 + 40 * Math.sin((grad * Math.PI) / 180)).toFixed(1)}`;
      return `<path d="M20 20L${p(i * 30)}L${p(i * 30 + 15)}z" fill="#ffd93d"/>`;
    }).join("") + `<circle cx="20" cy="20" r="10" fill="#ff3d9a"/>`;
  function flagge(name) {
    const f = FLAGGEN.find(([muster]) => muster.test(name));
    if (!f) return /schlager/i.test(name) ? strahlenkranz() : "";
    const [, art, farben] = f;
    if (art === "nord") return `<rect width="40" height="40" fill="${farben[0]}"/><rect x="11" width="7" height="40" fill="${farben[1]}"/><rect y="16.5" width="40" height="7" fill="${farben[1]}"/>`;
    if (art === "eu") return `<rect width="40" height="40" fill="${farben[0]}"/>` +
      Array.from({ length: 12 }, (_, i) => `<circle cx="${20 + 13 * Math.cos((i * Math.PI) / 6)}" cy="${20 + 13 * Math.sin((i * Math.PI) / 6)}" r="1.7" fill="${farben[1]}"/>`).join("");
    const n = farben.length, d = 40 / n;
    return farben.map((c, i) => (art === "q" ? `<rect y="${i * d}" width="40" height="${d + 0.2}" fill="${c}"/>` : `<rect x="${i * d}" width="${d + 0.2}" height="40" fill="${c}"/>`)).join("");
  }
  // Themen-Symbole im 24×24-Raster: weiß mit dunklem Rand (lesbar auf jeder Flagge); englische Stichwörter für übersetzte Namen
  const SYMBOLE = [
    [/radio/i, `<rect x="2" y="8" width="20" height="14" rx="3"/><path d="M6 8L17 2" fill="none" stroke-width="2"/><circle cx="8" cy="15" r="3.6" fill="#160c26"/><path d="M14 13h5M14 17h5" stroke-width="1.6"/>`],
    [/rock/i, `<path d="M14 1L4 14h7l-3 9 11-13h-7z"/>`],
    [/schlager/i, `<rect x="8" y="1" width="8" height="13" rx="4"/><path d="M5 11a7 7 0 0 0 14 0" fill="none" stroke-width="2"/><path d="M12 18v4M8 22h8" fill="none" stroke-width="2"/>`],
    [/sommer|summer/i, `<path d="M12 1v4M12 19v4M1 12h4M19 12h4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M4.2 19.8L7 17M17 7l2.8-2.8" fill="none" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="5.5"/>`],
    [/party/i, `<ellipse cx="12" cy="9" rx="7" ry="8"/><path d="M10.5 17h3l-1.5 2z"/><path d="M12 19q-3 2 0 4" fill="none" stroke-width="1.4"/>`],
    [/bingo/i, `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5.5" fill="#ff3d9a"/><text x="12" y="14.8" font-size="7.5" font-weight="900" text-anchor="middle" fill="#fff" stroke="none">B</text>`],
    [/heimlich|liebling|guilty|secret/i, `<path d="M12 21L4 13a4.8 4.8 0 0 1 8-6 4.8 4.8 0 0 1 8 6z"/>`],
    [/jahrzehnt|decade/i, `<path d="M6 2h12v3l-4.5 7 4.5 7v3H6v-3l4.5-7L6 5z"/><path d="M9 20h6l-3-3z" fill="#ffd93d"/>`],
    [/jahres|charts|of the year/i, `<rect x="3" y="5" width="18" height="17" rx="3"/><rect x="3" y="5" width="18" height="5" rx="2" fill="#ff3d9a"/><text x="12" y="19.5" font-size="8.5" font-weight="900" text-anchor="middle" fill="#160c26" stroke="none">#1</text>`],
    [/hits/i, `<path d="M12 1l3.4 7 7.6 1-5.5 5.3 1.4 7.6L12 18.3l-6.9 3.6 1.4-7.6L1 9l7.6-1z"/>`],
  ];
  function symbol(name) {
    const treffer = SYMBOLE.find(([muster]) => muster.test(name));
    const inhalt = treffer ? treffer[1]
      : `<text x="12" y="19" font-size="20" font-weight="900" text-anchor="middle">${[...name.trim()][0]?.toUpperCase().replace(/[<&>]/g, "") ?? "♪"}</text>`;
    return `<g transform="translate(50 54)" fill="#fff" stroke="#160c26" stroke-width="1.3" stroke-linejoin="round" paint-order="stroke fill">${inhalt}</g>`;
  }
  const schallplatte = (h, name, nr) => {
    const flaggeSvg = flagge(name);
    return platteSvg(77, 66, 19, `hsl(${(h + 40) % 360} 85% 62%)`, "platte") +
      `<g transform="translate(0 3) rotate(-6 62 66)"><defs><clipPath id="huelle-${nr}"><rect width="40" height="40" rx="4"/></clipPath></defs>` +
      `<rect x="42" y="46" width="40" height="40" rx="4" fill="hsl(${(h + 80) % 360} 85% 70%)"/>` +
      (flaggeSvg ? `<g clip-path="url(#huelle-${nr})" transform="translate(42 46)">${flaggeSvg}</g>` : `<rect x="47" y="51" width="30" height="30" rx="3" fill="#160c26" fill-opacity=".2"/>`) +
      `<rect x="42" y="46" width="40" height="40" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/>` + symbol(name) + "</g>" +
      // Schlager: etwas Glitzer um die Hülle
      (/schlager/i.test(name) ? glitzer(38, 52, 0.9) + glitzer(92, 42, 0.7) : "") +
      // Länder-Decks: oben rechts das Länderkennzeichen wie am Auto
      kennzeichen(KENNZEICHEN.find(([muster]) => muster.test(name))?.[1]);
  };
  // Länderkennzeichen je Deck (Schlager und Jahrescharts sind deutsch); Mittel-/Nordeuropa ohne
  const KENNZEICHEN = [
    [/deutsch|german|schlager|jahrescharts/i, "D"], [/frankreich|france/i, "F"], [/holland|niederland|netherlands/i, "NL"],
    [/ungarn|hungar/i, "H"], [/kanada|canada/i, "CDN"],
  ];
  // klein in der Ecke, damit es auch neben langen Titelzeilen („Deutschlands“) frei steht; längere Kennzeichen
  // werden nach links breiter, der rechte Rand bleibt
  const kennzeichen = (land) => {
    if (!land) return "";
    const rx = 5.5 + 3 * land.length, cx = 95.5 - rx, gross = land.length > 2 ? 7 : 8;
    return `<g transform="rotate(-8 ${cx} 11)"><ellipse cx="${cx}" cy="11" rx="${rx}" ry="5.8" fill="#fff" stroke="#160c26" stroke-width="1.4"/>` +
      `<text x="${cx}" y="${11 + gross * 0.36}" font-size="${gross}" font-weight="900" text-anchor="middle" fill="#160c26" font-family="Nunito, system-ui, sans-serif">${land}</text></g>`;
  };
  // „Alle Songs“: ein ganzer Stapel Schallplatten in Regenbogenfarben statt einer Hülle
  const plattenStapel = () => platteSvg(52, 72, 15, "#3dd8ff") + platteSvg(64, 60, 16, "#ffd93d") + platteSvg(77, 68, 19, "#ff3d9a", "platte im-stapel");
  // Genre-Bilder im Kartenstil (farbige Flächen, weißer Rand, dunkle Details), unten rechts im 100er-Cover
  const R = 'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"';
  const glitzer = (x, y, g = 1) => `<path d="M${x} ${y - 5 * g}l${1.3 * g} ${3.7 * g} ${3.7 * g} ${1.3 * g}-${3.7 * g} ${1.3 * g}-${1.3 * g} ${3.7 * g}-${1.3 * g}-${3.7 * g}-${3.7 * g}-${1.3 * g} ${3.7 * g}-${1.3 * g}z" fill="#ffd93d"/>`;
  // dicker Strich mit weißem Rand: erst breit in Weiß, dann schmaler in der Farbe
  const strich = (d, farbe, breite) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${breite + 3.2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${farbe}" stroke-width="${breite}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const GENRE_BILDER = {
    pop: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`, f2 = `hsl(${(h + 40) % 360} 85% 62%)`;
      return `<path d="M66 60L50 87a4.5 4.5 0 0 0 7.5 4L74 66z" fill="${f2}" ${R}/><circle cx="75" cy="54" r="13" fill="${f}" ${R}/>` +
        `<path d="M67 48l14 14M71 44l14 14M64 54l12 12" stroke="#160c26" stroke-opacity=".25" stroke-width="1.6"/>` + glitzer(90, 76) + glitzer(56, 44, 0.7);
    },
    rock: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`, f2 = `hsl(${(h + 40) % 360} 85% 62%)`;
      const hals = "M66 70L88 42";
      return `<path d="${hals}" stroke="#fff" stroke-width="9.2" stroke-linecap="round"/><circle cx="60" cy="78" r="14.6" fill="#fff"/><circle cx="70" cy="66" r="11.6" fill="#fff"/>` +
        `<path d="${hals}" stroke="${f2}" stroke-width="6" stroke-linecap="round"/><rect x="84" y="36" width="9" height="11" rx="2.5" transform="rotate(38 88 42)" fill="#160c26"/>` +
        `<circle cx="60" cy="78" r="13" fill="${f}"/><circle cx="70" cy="66" r="10" fill="${f}"/>` +
        `<rect x="57" y="69" width="12" height="4" rx="1.5" transform="rotate(-52 63 71)" fill="#160c26" fill-opacity=".7"/><rect x="61" y="74" width="12" height="4" rx="1.5" transform="rotate(-52 67 76)" fill="#160c26" fill-opacity=".7"/>` +
        `<path d="M58 82L86 45" stroke="#160c26" stroke-width=".8" stroke-opacity=".6"/>` + glitzer(48, 56, 0.8);
    },
    dance: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`;
      return `<path d="M70 32v12" stroke="#fff" stroke-width="2"/><circle cx="70" cy="66" r="21" fill="${f}" ${R}/>` +
        `<g fill="none" stroke="#160c26" stroke-opacity=".28" stroke-width="1.3"><ellipse cx="70" cy="66" rx="9" ry="21"/><ellipse cx="70" cy="66" rx="17" ry="21"/>` +
        `<path d="M50 59h40M49 66h42M50 73h40M54 52h32M54 80h32"/></g>` +
        `<path d="M60 55l6-4 3 6-6 3z" fill="#fff" fill-opacity=".8"/>` + glitzer(94, 50) + glitzer(46, 84, 0.8) + glitzer(92, 86, 0.6);
    },
    hiphop: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`, f2 = `hsl(${(h + 40) % 360} 85% 62%)`;
      return strich("M54 54v-9h32v9", f2, 3) + `<rect x="43" y="53" width="54" height="34" rx="6" fill="${f}" ${R}/>` +
        [56, 84].map((x) => `<circle cx="${x}" cy="71" r="10" fill="#160c26"/><circle cx="${x}" cy="71" r="4" fill="${f2}"/>`).join("") +
        `<rect x="64" y="59" width="12" height="7" rx="1.5" fill="#160c26" fill-opacity=".3"/><circle cx="67" cy="78" r="1.6" fill="#160c26"/><circle cx="73" cy="78" r="1.6" fill="#160c26"/>`;
    },
    rnb: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`;
      return `<path d="M70 90L49 69a12 12 0 0 1 21-16 12 12 0 0 1 21 16z" fill="${f}" ${R}/>` +
        `<g transform="translate(62 56) scale(.42)"><rect x="17" y="0" width="6" height="36" rx="2" fill="#160c26"/><ellipse cx="11" cy="37" rx="11" ry="7.5" transform="rotate(-18 11 37)" fill="#160c26"/><path d="M23 0c12 4 17 12 14 24-2-7-7-11-14-12z" fill="#160c26"/></g>` +
        glitzer(92, 48) + glitzer(48, 48, 0.7);
    },
    schlager: (h) => {
      const f2 = `hsl(${(h + 40) % 360} 85% 62%)`;
      const brezel = "M70 62C62 46 44 50 46 64C48 77 62 80 84 89M70 62C78 46 96 50 94 64C92 77 78 80 56 89";
      return strich(brezel, f2, 6.5) + [[52, 58], [60, 70], [88, 58], [80, 70], [70, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff"/>`).join("") + glitzer(94, 86, 0.8);
    },
    film: (h) => {
      const f = `hsl(${(h + 80) % 360} 85% 70%)`;
      return `<rect x="46" y="60" width="46" height="30" rx="3" fill="${f}" ${R}/><path d="M52 70h34M52 78h22" stroke="#160c26" stroke-opacity=".3" stroke-width="2.4" stroke-linecap="round"/>` +
        `<g transform="rotate(-16 46 59)"><rect x="46" y="49" width="46" height="10" rx="2" fill="#160c26" ${R}/>` +
        [50, 62, 74, 86].map((x) => `<path d="M${x} 50h5l-5 8h-5z" fill="#fff"/>`).join("") + "</g>" + glitzer(96, 48, 0.8);
    },
  };
  // Titel in Zeilen zu höchstens 12 Zeichen, höchstens vier Zeilen (schon übersetzt, damit der Umbruch passt)
  function titelZeilen(text) {
    const zeilen = [];
    for (const wort of t(text).split(/\s+/)) {
      const letzte = zeilen.at(-1);
      if (letzte && (letzte + " " + wort).length <= 12) zeilen[zeilen.length - 1] = letzte + " " + wort;
      else zeilen.push(wort);
    }
    if (zeilen.length > 4) zeilen.splice(3, zeilen.length, zeilen[3] + " …");
    const titel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titel.setAttribute("class", "deck-titel");
    zeilen.forEach((z, i) => {
      const zeile = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      zeile.setAttribute("x", "8");
      zeile.setAttribute("y", String(22 + i * 12));
      zeile.textContent = z;
      titel.append(zeile);
    });
    return titel;
  }
  // Deck-Cover: Verlauf in der Farbe des Decks, Plattenhülle mit Schallplatte und der Paketname (ohne Marke davor)
  function deckCover(wert, name, nr) {
    const h = farbe(nr);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "deck-cover");
    svg.setAttribute("aria-hidden", "true");
    const id = `deck-verlauf-${nr}`;
    const farben = wert
      ? `<stop offset="0" stop-color="hsl(${h} 85% 60%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 80% 38%)"/>`
      : `<stop offset="0" stop-color="#ff3d9a"/><stop offset=".35" stop-color="#ffd93d"/><stop offset=".7" stop-color="#3dd8ff"/><stop offset="1" stop-color="#9b5cff"/>`;
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${farben}</linearGradient></defs>` +
      `<rect width="100" height="100" rx="10" fill="url(#${id})"/>` +
      // Motiv aus dem Originalnamen (die Anzeige ist schon übersetzt)
      (wert ? schallplatte(h, (bibliothek.listen ?? []).find((l) => l.id === wert)?.name ?? name, nr) : plattenStapel());
    if (wert) svg.append(titelZeilen(t(name).replace(/^(HitYear|Party-Hits)\s*[-–:]?\s+/i, "")));
    else {
      const titel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      titel.setAttribute("class", "deck-titel");
      titel.setAttribute("x", "8");
      titel.setAttribute("y", "22");
      titel.textContent = "Alle Songs";
      svg.append(titel);
    }
    return svg;
  }
  // Galerie: eine Reihe großer Cover, wischen per Touch oder blättern mit den Pfeilen; merkt sich je Schritt die Position
  const galerieStand = {};
  function galerie(schluessel, messen, karten) {
    const reihe = el("div", { class: "deck-raster", "data-anzahl": String(Math.min(karten.length, 6)) }, karten);
    const blaettern = (richtung) => reihe.scrollBy({ left: richtung * reihe.clientWidth * 0.8, behavior: "smooth" });
    const links = el("button", { type: "button", class: "galerie-pfeil links", "aria-label": "Zurück blättern", text: "‹", onclick: () => blaettern(-1) });
    const rechts = el("button", { type: "button", class: "galerie-pfeil rechts", "aria-label": "Weiter blättern", text: "›", onclick: () => blaettern(1) });
    // Hinweis, solange es mehr zu sehen gibt – auf breiten Bildschirmen in der Zeile mit Zurück/Weiter (kein eigener Platz)
    const touch = matchMedia("(pointer: coarse)").matches;
    const hinweis = el("p", { class: "galerie-hinweis", "aria-hidden": "true" },
      el("span", { class: "galerie-hand", text: touch ? "👆" : "↔" }), touch ? "Wischen für mehr" : "Scrollen oder Pfeile für mehr");
    const pfeile = () => {
      links.disabled = reihe.scrollLeft < 4;
      rechts.disabled = reihe.scrollLeft + reihe.clientWidth > reihe.scrollWidth - 4;
      hinweis.classList.toggle("aus", links.disabled && rechts.disabled);
    };
    const groesseSetzen = () => {
      if (matchMedia("(max-width: 700px)").matches) { reihe.classList.remove("vermessen"); return; }
      const breite = reihe.clientWidth - 8, abstand = parseFloat(getComputedStyle(reihe).columnGap) || 16;
      if (!breite) return;
      // in jedem Schritt gleich groß: vier passen nebeneinander (höchstens 300px), weniger stehen mittig, mehr blättert man
      const groesse = Math.max(150, Math.min(300, (breite - 3 * abstand) / 4));
      reihe.style.setProperty("--kachel", `${Math.floor(groesse)}px`);
      reihe.classList.add("vermessen");
      pfeile();
    };
    new ResizeObserver(groesseSetzen).observe(reihe);
    requestAnimationFrame(groesseSetzen);
    // Mausrad: senkrecht drehen blättert waagerecht, je Raste eine Kachel (Scroll-Snap rastet ohnehin kachelweise ein).
    // Am Anfang/Ende der Reihe scrollt das Rad wieder die Seite; waagerechtes Wischen am Trackpad bleibt unberührt.
    let radPause = 0;
    reihe.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || reihe.scrollWidth <= reihe.clientWidth + 4) return;
      const richtung = Math.sign(e.deltaY);
      if ((richtung < 0 && reihe.scrollLeft < 4) || (richtung > 0 && reihe.scrollLeft + reihe.clientWidth > reihe.scrollWidth - 4)) return;
      e.preventDefault();
      if (performance.now() < radPause) return;
      radPause = performance.now() + 220;
      const kachel = reihe.firstElementChild?.getBoundingClientRect().width ?? 200;
      reihe.scrollBy({ left: richtung * (kachel + (parseFloat(getComputedStyle(reihe).columnGap) || 16)), behavior: "smooth" });
    }, { passive: false });
    reihe.addEventListener("scroll", () => {
      galerieStand[schluessel] = reihe.scrollLeft;
      pfeile();
    }, { passive: true });
    // beim Neuaufbau (z. B. neuer Mitspieler) an derselben Stelle bleiben
    if (!messen) requestAnimationFrame(() => {
      reihe.scrollLeft = galerieStand[schluessel] ?? 0;
      pfeile();
    });
    return el("div", { class: "galerie" }, links, reihe, rechts, hinweis);
  }
  // Cover für Jahrzehnte („80er“ groß) und Genres (Name als Titel wie bei den Decks, Symbol auf der obersten Karte)
  function filterCover(art, text, farbton, nr, schluessel = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "deck-cover");
    svg.setAttribute("aria-hidden", "true");
    const id = `filter-verlauf-${art}-${nr}`;
    const h = Math.round(farbton) % 360;
    // Jahrzehnte: Karten mit Jahren aus diesem Jahrzehnt (z. B. „80er“ → ’81, ’85, ’89)
    const jz = art === "jahrzehnte" ? text.match(/(\d)0(?=\D*$)/)?.[1] : null; // Zehnerstelle, auch bei „2000er“/„2010s“
    const genre = art === "genres" ? text.match(/^(\S+)\s+(.*)$/u) : null; // „🎸 Rock“ → Symbol und Name
    // Genres mit eigenem Bild (Mikrofon, Gitarre, …) statt Kartenstapel; unbekannte Genres: Symbol auf der Karte
    const stapel = GENRE_BILDER[schluessel]?.(h) ?? kartenStapel(h, jz ? [1, 5, 9].map((e) => `’${jz}${e}`) : undefined, genre?.[1]);
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 85% 60%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 80% 38%)"/></linearGradient></defs>` +
      `<rect width="100" height="100" rx="10" fill="url(#${id})"/>` + stapel;
    if (genre) {
      svg.append(titelZeilen(genre[2]));
      return svg;
    }
    const gross = document.createElementNS("http://www.w3.org/2000/svg", "text");
    gross.setAttribute("x", "8");
    gross.setAttribute("y", "34");
    gross.setAttribute("class", art === "zahl" ? "filter-gross zahl-gross" : "filter-gross");
    gross.textContent = text;
    svg.append(gross);
    // darunter „Karten“
    if (art === "zahl") {
      const unter = document.createElementNS("http://www.w3.org/2000/svg", "text");
      unter.setAttribute("x", "9");
      unter.setAttribute("y", "46");
      unter.setAttribute("class", "deck-titel");
      unter.textContent = "Karten";
      svg.append(unter);
    }
    return svg;
  }
  const SCHRITTE = [
    {
      frage: "Wo läuft die Musik?", feld: "#wiedergabe", symbole: { host: "📺", alle: "📱", solo: "🎧" }, bilder: BILDER_WIEDERGABE,
      koepfe: {
        host: ["Party", "vor Ort", "Ton vom TV", "Nur Hauptscreen spielt Musik"], alle: ["Online", "spielen", "Ton am Handy", "Alle Geräte spielen Musik"],
        solo: ["Allein", "spielen", "Zum Üben", "Mit oder ohne Bots"],
      },
      texte: {
        host: "Ein Fernseher oder Monitor ist der Hauptbildschirm, der Ton kommt aus seinen Lautsprechern. Die Handys dienen nur zum Tippen.",
        alle: "Ein Gerät richtet das Spiel ein, jedes Handy spielt die Musik selbst ab – auch wenn ihr nicht im selben Raum seid.",
        solo: "Du spielst allein auf diesem Gerät – zum Üben, gegen Bots oder ganz für dich.",
      },
    },
    {
      // „Allein üben“ ohne Bots: niemand, mit dem man sich abwechseln könnte
      nur: () => !allein(),
      frage: "Wer ist dran?", feld: "#modus", symbole: { einzeln: "👤", alle: "👥" }, bilder: BILDER_MODUS,
      koepfe: { alle: ["Alle", "gleichzeitig", "Für viele"], einzeln: ["Reihum", "einer ist dran", "Zum Mitfiebern"] },
      texte: {
        alle: "Alle hören denselben Song und ordnen ihn gleichzeitig auf ihrem Handy ein. Schnell und für viele Spieler am besten.",
        einzeln: "Reihum ist immer ein Spieler dran, die anderen schauen zu und fiebern mit.",
      },
    },
    {
      frage: "Wann endet eine Runde?", feld: "#warten", symbole: { alle: "✋", alle5: "⏱️", erster: "⚡" }, bilder: BILDER_WARTEN,
      koepfe: { alle: ["30 s", "nach ganzer Hörprobe", "Zum Mitsingen"], alle5: ["5 s", "nach allen Antworten", "Ausgewogen"], erster: ["5 s", "ab 1. Antwort", "Schnelle Runden"] },
      nur: () => $("#modus").value === "alle",
      // allein ohne Bots: „ab 1. Antwort“ wäre dasselbe wie „nach allen Antworten“
      allein: { ohne: { erster: "alle5" }, koepfe: { alle5: ["5 s", "nach deiner Antwort", "Schnelle Runden"] }, texte: { alle5: "Hast du geantwortet, geht es nach 5 Sekunden weiter. Sonst endet die Runde, wenn die Zeit um ist." } },
      texte: {
        alle: "Die Vorschau läuft immer ganz durch – Zeit genug zum Mitsingen und Grübeln.",
        alle5: "Haben alle geantwortet, geht es nach 5 Sekunden weiter. Sonst endet die Runde, wenn die Zeit um ist.",
        erster: "Wer zuerst tippt, startet die Uhr: Die anderen haben noch 5 Sekunden. Für schnelle Runden.",
      },
    },
    {
      frage: "Was wird geraten?", feld: "#raten-was", symbole: { "": "📅", beide: "🌟" }, bilder: BILDER_RATEN,
      koepfe: { "": ["Jahr", "zählt allein", "Der Klassiker"], beide: ["Jahr +", "Song & Interpret", "Für Musik-Profis"] },
      texte: {
        "": "Nur das Erscheinungsjahr zählt – der Klassiker, für alle leicht zu verstehen.",
        beide: "Titel und Interpret bringen je einen Bonus-Stern – für Musik-Profis.",
      },
    },
    {
      frage: "Wie viele Karten zum Sieg?", feld: "#ziel", art: "zahl",
      texte: { 10: "Eine schnelle Partie – ideal zum Reinkommen.", 15: "Mittlere Länge für einen gemütlichen Abend.", 20: "Eine lange Partie für echte Musik-Kenner." },
      kurz: { 10: "Schnelle Partie", 15: "Gemütlicher Abend", 20: "Für Musik-Kenner" },
    },
    { frage: "Welches Deck?", feld: "#liste", art: "deck" },
    { frage: "Welche Jahrzehnte?", art: "jahrzehnte", mehrfach: true, nur: () => filterMoeglich() },
    { frage: "Welche Genres?", art: "genres", mehrfach: true, nur: () => filterMoeglich() },
    { frage: "Freie Plätze mit KI-Bots füllen?", art: "bots" },
    { frage: "Wer spielt mit?", art: "spieler" },
  ];
  const allein = () => $("#wiedergabe").value === "solo" && !$("#auffuellen").checked;
  let schritt = 0;
  let gezeigt = null;
  let weiterTimer = 0;
  // „Allein üben“: die Bot-Frage kommt gleich nach „Wo läuft die Musik?“ – davon hängt ab, ob „Wer ist dran?“ Sinn ergibt
  const sichtbareSchritte = () => {
    const liste = SCHRITTE.filter((s) => !s.nur || s.nur());
    if ($("#wiedergabe").value !== "solo") return liste;
    const bots = liste.find((s) => s.art === "bots");
    return [liste[0], bots, ...liste.slice(1).filter((s) => s !== bots)];
  };
  // Bild so groß wie den Kartenstapel der Decks einpassen: unten rechts im freien Platz unter dem Text,
  // entweder rechts neben der Plakette bis ganz unten oder breiter, dann aber über der Plakette
  function bildEinpassen(bildSvg, oben) {
    if (!bildSvg.isConnected) return;
    const b = bildSvg.firstElementChild.getBBox();
    if (!b.width || !b.height) return;
    const rand = 1.5;
    const w = b.width + 2 * rand, h = b.height + 2 * rand;
    const neben = Math.min(43 / w, (96 - oben) / h);
    const ueber = Math.min(62 / w, (83 - oben) / h);
    const s = Math.max(neben, ueber), unten = neben >= ueber ? 96 : 83;
    bildSvg.setAttribute("viewBox", `${b.x - rand} ${b.y - rand} ${w} ${h}`);
    bildSvg.setAttribute("width", String(w * s));
    bildSvg.setAttribute("height", String(h * s));
    bildSvg.setAttribute("x", String(96 - w * s));
    bildSvg.setAttribute("y", String(unten - h * s));
  }
  // Antwort als quadratische Cover-Kachel im Stil der Kartenzahl: Stichwort groß, eine Zeile darunter, Bild unten rechts,
  // kurze Einordnung als Plakette unten links; der lange Erklärtext steht im Tooltip
  function kachel(text, an, farbton, onclick, bild, erklaerung, [gross, unter, kurz, fussnote] = [text, "", ""]) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "deck-cover kachel-cover");
    svg.setAttribute("aria-hidden", "true");
    const h = Math.round(farbton) % 360;
    const id = `kachel-verlauf-${h}-${Math.random().toString(36).slice(2, 7)}`;
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 85% 60%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 80% 38%)"/></linearGradient></defs>` +
      `<rect width="100" height="100" rx="10" fill="url(#${id})"/>` +
      // mit Fußnote: Bild etwas kleiner und tiefer, damit die Zeile darüber frei bleibt
      (bild ? (fussnote ? `<svg viewBox="0 0 200 134" x="50" y="61" width="46" height="31" class="kachel-bild"><g>${bild}</g></svg>`
        : `<svg viewBox="0 0 200 134" x="44" y="56" width="54" height="36" class="kachel-bild"><g>${bild}</g></svg>`) : "");
    const bildSvg = svg.querySelector(".kachel-bild");
    if (bildSvg) requestAnimationFrame(() => requestAnimationFrame(() => bildEinpassen(bildSvg, fussnote ? 51 : 45)));
    // Zeile anlegen und, sobald sie (übersetzt) im Bild ist, notfalls verkleinern, damit lange Wörter nicht über den Rand laufen
    const zeile = (inhalt, x, y, klasse) => {
      const z = document.createElementNS(ns, "text");
      z.setAttribute("x", x); z.setAttribute("y", y); z.setAttribute("class", klasse);
      z.textContent = inhalt;
      svg.append(z);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const breite = z.isConnected ? z.getComputedTextLength() : 0;
        const platz = 92 - Number(x);
        if (breite > platz) z.style.fontSize = `${parseFloat(getComputedStyle(z).fontSize) * platz / breite}px`;
      }));
    };
    zeile(gross, "8", "30", "filter-gross kachel-gross");
    if (unter) zeile(unter, "9", "41", "deck-titel kachel-unter");
    if (fussnote) zeile(fussnote, "9", "48", "deck-titel kachel-fussnote");
    const k = el("button", { type: "button", class: "deck-knopf kachel", "aria-pressed": String(an), title: erklaerung || "", onclick },
      svg, el("span", { class: "deck-name" }, el("span", { text }), kurz ? el("small", { text: kurz }) : null));
    k.style.setProperty("--farbton", String(h));
    return k;
  }
  // Antwort setzen, kurz zeigen, dann von selbst zur nächsten Frage
  // Ein Tipp auf eine Antwort reicht: Karte hüpft, die Frage gleitet nach links raus, die nächste von rechts rein
  let wechsel = false;
  function waehlen(feld, wert, k) {
    if (wechsel) return;
    if (feld.type === "checkbox") {
      if (feld.checked !== wert) { feld.checked = wert; feld.dispatchEvent(new Event("change")); }
    } else if (feld.value !== wert) {
      feld.value = wert;
      feld.dispatchEvent(new Event("change"));
    }
    // jeder Tipp auf eine Kachel bekommt einen anderen Partikel-Effekt; bei der Kartenzahl mehr Konfetti je mehr Karten
    if (feld.id === "ziel") konfetti(Math.min(90, 14 + Number(wert) * 3), k);
    else funken(k);
    for (const b of k.parentElement.children) b.setAttribute("aria-pressed", String(b === k));
    k.classList.add("tipp");
    wechsel = true;
    clearTimeout(weiterTimer);
    weiterTimer = setTimeout(() => {
      $("#schritt-inhalt .schritt")?.classList.add("raus");
      weiterTimer = setTimeout(() => springen(schritt + 1), 260);
    }, 380);
  }
  let richtung = "vor";
  function springen(n) {
    clearTimeout(weiterTimer);
    wechsel = false;
    const ziel = Math.max(0, Math.min(sichtbareSchritte().length - 1, n));
    richtung = ziel < schritt ? "zurueck" : "vor";
    schritt = ziel;
    schrittZeigen();
  }
  // Inhalt eines Schritts; beim Messen mit Kopien der Elemente, die es nur einmal gibt
  function schrittInhalt(s, liste, messen = false) {
    const einmal = (n) => (messen ? n.cloneNode(true) : n);
    const inhalt = [el("h3", { class: "assistent-frage", text: s.frage })];
    if (s.art === "zahl") {
      // Kartenzahl als Cover-Kacheln wie bei den Decks: Zahl groß, kurze Einordnung als Plakette
      const feld = $(s.feld);
      inhalt.push(galerie("zahl", messen, [...feld.options].map((o, i) =>
        el("button", { type: "button", class: "deck-knopf", "aria-pressed": String(feld.value === o.value), title: s.texte[o.value], onclick: (ev) => waehlen(feld, o.value, ev.currentTarget) },
          filterCover("zahl", o.value, farbe(i), i), el("span", { class: "deck-name" }, el("span", { text: `${o.value} Karten` }), el("small", { text: s.kurz[o.value] ?? "" }))))));
    } else if (s.art === "deck") {
      const feld = $(s.feld);
      inhalt.push(galerie("deck", messen, [...feld.options].map((o, i) =>
        el("button", { type: "button", class: "deck-knopf", "aria-pressed": String(feld.value === o.value), onclick: (ev) => waehlen(feld, o.value, ev.currentTarget) },
          deckCover(o.value, o.text, i), el("span", { class: "deck-name" }, el("span", { text: o.text }), el("small", { class: "leise", text: `${deckAnzahl(o.value)} Songs` }))))));
    } else if (s.feld) {
      const feld = $(s.feld);
      const a = allein() ? s.allein : null;
      if (a?.ohne?.[feld.value] && !messen) {
        feld.value = a.ohne[feld.value];
        feld.dispatchEvent(new Event("change"));
      }
      inhalt.push(galerie(s.feld, messen, [...feld.options].filter((o) => !a?.ohne?.[o.value]).map((o, i) =>
        kachel(o.text, feld.value === o.value, farbe(i), (ev) => waehlen(feld, o.value, ev.currentTarget), s.bilder?.[o.value],
          a?.texte?.[o.value] ?? s.texte?.[o.value], a?.koepfe?.[o.value] ?? s.koepfe?.[o.value]))));
    } else if (s.art === "jahrzehnte" || s.art === "genres") {
      // Mehrfachauswahl als Galerie: jeder Tipp schaltet ein Cover an/aus, „Weiter“ führt zur nächsten Frage
      const box = s.art === "jahrzehnte" ? jzBox : genreBox;
      // Hinweise rechts neben der Frage statt darunter: sonst wäre dieser Schritt der höchste und der Rahmen überall zu hoch
      inhalt[0] = el("div", { class: "frage-zeile" }, inhalt[0],
        el("div", { class: "frage-notiz" }, el("p", { class: "leise klein", text: s.art === "jahrzehnte" ? "Ohne Auswahl spielt ihr alle Jahrzehnte." : "Ohne Auswahl spielt ihr alle Genres." }), einmal(verfuegbarText)));
      inhalt.push(
        galerie(s.art, messen, [...box.querySelectorAll("label")].map((l, i) => {
          const input = l.querySelector("input");
          const text = l.childNodes[1].textContent;
          const anzahl = l.querySelector("span").textContent.replace(/\D/g, "");
          return el("button", {
            type: "button", class: "deck-knopf mehrfach", "aria-pressed": String(input.checked),
            onclick: (ev) => {
              input.checked = !input.checked;
              input.dispatchEvent(new Event("change"));
              ev.currentTarget.setAttribute("aria-pressed", String(input.checked));
              if (input.checked) funken(ev.currentTarget);
              weiterPruefen(s);
            },
          }, filterCover(s.art, text, farbe(i), i, input.value), el("span", { class: "deck-name" }, el("span", { text }), el("small", { class: "leise", text: `${anzahl} Songs` })));
        })),
      );
    } else if (s.art === "bots") {
      const feld = $("#auffuellen");
      const solo = $("#wiedergabe").value === "solo";
      inhalt.push(galerie("bots", messen, [
        kachel("Ja, auf 6 auffüllen", feld.checked, farbe(0), (ev) => waehlen(feld, true, ev.currentTarget), BILDER_BOTS.ja,
          "Freie Plätze übernehmen beim Start Bots – Name und Stärke würfelt die App.", ["Ja", "Bots füllen auf", "Immer 6 Plätze"]),
        kachel("Nein, nur echte Mitspieler", !feld.checked, farbe(1), (ev) => waehlen(feld, false, ev.currentTarget), BILDER_BOTS.nein,
          solo ? "Du spielst ganz für dich." : "Es spielen nur die, die den QR-Code gescannt haben.", ["Nein", "keine Bots", solo ? "Nur du" : "Nur Menschen"]),
      ]));
    } else if (s.art === "spieler") {
      // letzte Seite: sechs Plätze – Mitspieler, beim Start dazukommende Bots oder frei – und der Start-Knopf
      const spieler = zustand?.spieler ?? [];
      const bots = $("#auffuellen").checked;
      const bereitJetzt = new Set();
      const du = $("#wiedergabe").value === "solo" && !spieler.length;
      if (!messen) queueMicrotask(() => (bereitVorher = bereitJetzt)); // Mess-Durchlauf zählt nicht
      inhalt.push(
        el("div", { class: "platz-raster" }, Array.from({ length: 6 }, (_, i) => {
          const p = spieler[i];
          // „Ich bin fertig“: grüner Rahmen; gewackelt wird nur in dem Moment, in dem es neu dazukommt
          const neuBereit = Boolean(p?.bereit && !bereitVorher.has(p.id));
          if (p?.bereit) bereitJetzt.add(p.id);
          if (p) return el("div", { class: `platz ${p.verbunden ? "" : "offline"} ${p.bereit ? "bereit" : ""} ${neuBereit ? "wackeln" : ""}` },
            messen ? null : el("button", { type: "button", class: "zweit platz-weg", "aria-label": `${p.name} entfernen`, onclick: () => tun("host:entfernen", { spielerId: p.id }) }),
            avatarEl(p), el("span", { class: "platz-name", text: p.name + (p.verbunden ? "" : " (offline)") }));
          // „Allein üben“: der erste Platz ist für dich, du trittst erst nach „Spiel starten“ bei
          if (du && i === 0) return el("div", { class: "platz" }, el("span", { class: "platz-symbol", "aria-hidden": "true", text: "🎧" }), el("span", { class: "platz-name", text: "Du" }));
          // freie Plätze: die Bots, die der Server beim Start einsetzt (Name, Avatar, Stufe stehen schon fest)
          const b = zustand?.botsDazu?.[i - spieler.length - (du ? 1 : 0)];
          // ein Klick auf einen Bot nimmt ihn heraus, ein Klick auf einen freien Platz holt den zuletzt entfernten zurück
          const weg = zustand?.einstellungen?.ohneBots ?? [];
          if (bots && b) return platzKnopf(el("div", { class: "platz bot", title: "Bot entfernen" },
            messen ? null : el("span", { class: "knopf zweit platz-weg", "aria-hidden": "true" }),
            avatarEl({ avatar: b.avatar, farbe: "#b48cff" }), el("span", { class: "platz-name", text: b.name })), messen ? null : () => botsAendern([...weg, b.name]));
          const zurueck = bots && weg.length && !messen;
          return platzKnopf(el("div", { class: `platz frei ${zurueck ? "zurueckholen" : ""}`, title: zurueck ? "Bot zurückholen" : "" },
            el("span", { class: "platz-symbol", "aria-hidden": "true", text: "+" }), el("span", { class: "platz-name leise", text: zurueck ? "Bot dazu" : "frei" })),
            zurueck ? () => botsAendern(weg.slice(0, -1)) : null);
        })),
        // „Online spielen“ ohne eigenes Handy: der Gastgeber spielt auf diesem Gerät mit (bei „Party vor Ort“ ist es der Hauptscreen)
        messen || spieler.length >= 6 || $("#wiedergabe").value !== "alle" ? null
          : el("button", { type: "button", class: "zweit hier-mitspielen", text: "🎮 Auf diesem Gerät mitspielen", onclick: mitspielen }),
      );
    }
    return inhalt;
  }
  let bereitVorher = new Set(); // wer beim letzten Aufbau schon „fertig“ war (nur Neue wackeln)
  function schrittZeigen() {
    const liste = sichtbareSchritte();
    schritt = Math.min(schritt, liste.length - 1);
    const s = liste[schritt];
    const nr = SCHRITTE.indexOf(s);
    const box = el("div", { class: gezeigt === nr ? "schritt" : `schritt rein ${richtung}` }, schrittInhalt(s, liste));
    gezeigt = nr;
    $("#schritt-inhalt").replaceChildren(box);
    const letzter = schritt === liste.length - 1;
    // „Weiter“ nur, wo man mehreres wählen kann (Jahrzehnte/Genres) – sonst geht es mit dem Tipp auf die Antwort weiter
    $("#schritt-weiter").classList.toggle("unsichtbar", letzter || !s.mehrfach);
    // letzte Seite: rechts unten „Spiel starten“ statt „Weiter“
    $("#schritt-weiter").classList.toggle("versteckt", letzter);
    startKnopf.classList.toggle("versteckt", !letzter);
    weiterPruefen(s);
  }
  // Jahrzehnte/Genres: ohne Auswahl „Weiter mit allen“ (leere Auswahl = alle), sonst weiter, solange die Auswahl Songs hat
  function weiterPruefen(s) {
    const knopf = $("#schritt-weiter");
    const box = s?.art === "jahrzehnte" ? jzBox : s?.art === "genres" ? genreBox : null;
    const keins = box && !box.querySelector("input:checked");
    const leer = box && !keins && zustand?.verfuegbar === 0;
    knopf.textContent = t(keins ? "Weiter mit allen ›" : "Weiter ›");
    knopf.disabled = Boolean(leer);
    knopf.title = leer ? t("Keine Songs passen zur Auswahl.") : "";
  }
  // Der Rahmen bleibt in jedem Schritt gleich hoch: alle Schritte unsichtbar in voller Breite aufbauen, den höchsten nehmen
  let gemessen = false;
  function hoeheMessen() {
    const ziel = $("#schritt-inhalt");
    if (!ziel.clientWidth) return false;
    // schmaler Bildschirm: die Schritte stehen untereinander und die Seite scrollt – keine feste Höhe (sonst riesige Lücken)
    if (matchMedia("(max-width: 700px)").matches) {
      ziel.style.minHeight = "";
      return true;
    }
    const liste = sichtbareSchritte();
    // die letzte Seite (Mitspieler + Start) darf höher sein und wächst dann von selbst – sie zählt für die gemeinsame Höhe nicht mit
    const mess = el("div", { class: "schritt-messen", "aria-hidden": "true" }, SCHRITTE.filter((s) => s.art !== "spieler").map((s) => el("div", { class: "schritt" }, schrittInhalt(s, liste, true))));
    mess.style.width = `${ziel.clientWidth}px`;
    ziel.after(mess);
    // erst im nächsten Bild messen, dann sind die Texte übersetzt (i18n läuft per MutationObserver)
    requestAnimationFrame(() => {
      ziel.style.minHeight = `${Math.max(...[...mess.children].map((k) => k.offsetHeight))}px`;
      mess.remove();
    });
    return true;
  }
  let messTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(messTimer);
    messTimer = setTimeout(hoeheMessen, 200);
  });
  document.fonts?.ready.then(() => gemessen && hoeheMessen());
  // im ersten Schritt zurück zur Startseite
  $("#schritt-zurueck").addEventListener("click", () => (schritt === 0 ? location.assign("/") : springen(schritt - 1)));
  $("#schritt-weiter").addEventListener("click", () => springen(schritt + 1));
  $("#schritt-weiter").after(startKnopf);

  // „Spiel erstellen“ auf der Startseite: immer ein neuer Raum, nicht das laufende Spiel
  if (new URLSearchParams(location.search).has("neu")) {
    speicher("zs_host", null);
    history.replaceState(null, "", location.pathname);
  }
  // Logo im laufenden Spiel: erst nachfragen, dann Raum schließen
  logoSchutz(() => zustand && zustand.phase !== "lobby" && zustand.phase !== "ende", async () => {
    await tun("host:beenden");
    speicher("zs_host", null);
  });

  async function raumAnlegen() {
    const alt = JSON.parse(speicher("zs_host") || "null");
    if (alt) {
      const r = await socket.anfrage("host:verbinden", alt).catch(() => null);
      if (r) return;
    }
    const r = await tun("host:erstellen", { einstellungen: einstellungenLesen() });
    if (r) speicher("zs_host", JSON.stringify({ code: r.code, hostSitzung: r.hostSitzung }));
  }

  socket.on("connect", () => {
    $("#status").textContent = "";
    raumAnlegen();
  });
  // schon verbunden, während die Bibliothek lud → „connect“ ist vorbei, Raum jetzt anlegen
  if (socket.connected) raumAnlegen();
  socket.on("connect_error", (e) => {
    if (String(e.message).includes("angemeldet")) location.href = "/?weiter=/host.html";
  });
  socket.on("beendet", () => {
    speicher("zs_host", null);
    location.href = "/";
  });
  socket.on("zustand", (z) => {
    zustand = z;
    darstellen();
    tvFokus();
  });

  // Fernbedienung: Liegt der Fokus nirgends (oder auf etwas Verstecktem), springt er auf den
  // Hauptknopf der Phase – so reicht am Fernseher meist ein Druck auf OK.
  function tvFokus() {
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body && aktiv.offsetParent !== null && !aktiv.disabled) return;
    const k = ["#starten", "#schritt-inhalt [aria-pressed=true]", "#schritt-weiter", "#revanche"].map((id) => $(id)).find((b) => b && !b.disabled && b.offsetParent !== null);
    k?.focus({ preventScroll: true });
  }

  const name = (id) => zustand.spieler.find((p) => p.id === id)?.name ?? "?";

  function darstellen() {
    const z = zustand;
    void wachHalten(z.phase !== "ende"); // Host-Bildschirm (Laptop/Tablet) soll während der Party nicht dunkel werden
    $("#lobby").classList.toggle("versteckt", z.phase !== "lobby");
    $("#spiel").classList.toggle("versteckt", z.phase !== "hoeren" && z.phase !== "aufloesung");
    if (qrFuer !== z.code) {
      $("#qr").src = $("#qr-spiel").src = $("#qr-unten").src = `/api/qr?raum=${encodeURIComponent(z.code)}`;
      // Code hier setzen, nicht nur in der Lobby: wird die Seite mitten im Spiel neu geladen, fehlte er sonst
      $("#code").textContent = $("#code-spiel").textContent = $("#code-unten").textContent = z.code;
      qrFuer = z.code;
    }
    $("#ende").classList.toggle("versteckt", z.phase !== "ende");
    if (z.phase === "lobby") lobby(z);
    else if (z.phase === "ende") ende(z);
    else spiel(z);
  }

  // Platz in der Lobby anklickbar machen (auch per Tastatur bzw. TV-Fernbedienung)
  function platzKnopf(platz, aktion) {
    if (!aktion) return platz;
    platz.setAttribute("role", "button");
    platz.tabIndex = 0;
    platz.classList.add("klickbar");
    platz.addEventListener("click", aktion);
    platz.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); aktion(); }
    });
    return platz;
  }
  function botsAendern(ohneBots) {
    tun("host:einstellungen", { ...einstellungenLesen(), ohneBots });
  }
  // ---------- Lobby ----------
  let qrFuer = null;
  function lobby(z) {
    audio.laden(null);
    aufgedeckt = null;
    const e = z.einstellungen;
    $("#ziel").value = String(e.zielKarten);
    $("#wiedergabe").value = e.wiedergabe;
    document.body.classList.toggle("solo", e.wiedergabe === "solo"); // allein: kein QR-Code zum Einladen
    $("#modus").value = e.modus;
    $("#warten").value = e.warten;
    $("#raten-was").value = e.raten ? e.ratenWas ?? "beide" : "";
    $("#auffuellen").checked = Boolean(e.auffuellen);
    $("#liste").value = e.liste ?? "";
    for (const i of jzBox.querySelectorAll("input")) i.checked = (e.jahrzehnte ?? []).includes(Number(i.value));
    for (const i of genreBox.querySelectorAll("input")) i.checked = (e.genres ?? []).includes(i.value);

    const v = z.verfuegbar ?? 0;
    const noetig = Math.max(e.auffuellen ? 6 : z.spieler.length, 1) + 5;
    const fehlt = !z.spieler.length && !e.auffuellen && e.wiedergabe !== "solo" ? "Warte auf Mitspieler – mindestens 1 muss den QR-Code scannen."
      : v < noetig ? `Für ${z.spieler.length} Mitspieler braucht es mindestens ${noetig} Songs – wähle ein größeres Deck oder mehr Jahrzehnte/Genres.`
      : "";
    verfuegbarText.textContent = `${v} Songs passen zur Auswahl.${fehlt ? " " + fehlt : ""}`;
    startKnopf.disabled = Boolean(fehlt);
    startKnopf.title = fehlt;
    if (!wechsel) schrittZeigen(); // nicht mitten in die Wechsel-Animation hinein neu aufbauen
    if (!gemessen) gemessen = hoeheMessen();
  }

  // ---------- Spiel ----------
  function spiel(z) {
    const aktiv = z.spieler.find((p) => p.id === z.aktiv);
    const hoeren = z.phase === "hoeren";
    const runde = z.stechen ? `Stechen · Runde ${z.runde}` : `Runde ${z.runde}`;

    $("#player-steuerung").classList.toggle("versteckt", !hoeren);
    // alle haben getippt → keine Frist mehr, aber der Countdown läuft bis zur Auflösung weiter (wie auf dem Handy)
    if (hoeren && !z.frist && z.aufloesungUm) fristAnzeigen($("#frist"), { frist: z.aufloesungUm }, "Auflösung kommt");
    else fristAnzeigen($("#frist"), z);
    $("#weiter-bereich").classList.toggle("versteckt", hoeren);
    weiterCountdown($("#weiter"), z);
    // Abschnitte der Sanduhr: Zeit zum Einordnen (alle haben getippt → bis zur Auflösung), nächster Song; vor dem Songstart keine Uhr
    sanduhr($("#sanduhr"), hoeren
      ? [{ ab: z.startUm, bis: z.frist ?? z.aufloesungUm, label: z.frist ? "Zeit zum Einordnen" : "Auflösung kommt" }]
      : [{ bis: z.weiterUm, label: "Nächster Song" }], hoeren ? null : z.wartetAuf);
    $("#jahr-gross").classList.toggle("versteckt", hoeren);
    leisteAufladen($("#t-leiste").parentElement, hoeren ? z.startUm : null);

    if (hoeren) {
      aufgedeckt = null;
      startsongZeigen(z.vorspiel, startsongAudio);
      const hierAudio = z.einstellungen.wiedergabe === "host";
      audio.laden(hierAudio ? z.ausschnitt : null);
      // neuer Ausschnitt → Countdown 3 · 2 · 1, dann spielt er von selbst
      if (hierAudio && audio.url && autoGestartet !== audio.url) {
        const url = (autoGestartet = audio.url);
        countdownAbspielen(audio, () => zustand?.phase === "hoeren" && audio.url === url, z.startUm);
      }
      // Musik läuft auf den Handys → trotzdem 3 · 2 · 1 am Hauptbildschirm
      if (!hierAudio && z.startUm && countdownFuer !== z.startUm) {
        const startUm = (countdownFuer = z.startUm);
        countdownZeigen(startUm, () => zustand?.phase === "hoeren" && zustand.startUm === startUm);
      }
      $("#kicker").textContent = z.einstellungen.modus === "alle" ? `${runde} · alle sind dran` : `${runde} · ${aktiv?.name ?? "?"} ist dran`;
      $("#titel-gross").textContent = "Welches Jahr?";
      $("#interpret-gross").textContent = hierAudio ? "Hör genau hin …"
        : z.einstellungen.wiedergabe === "alle" ? "Die Musik läuft auf euren Handys."
        : `Die Musik läuft auf dem Handy von ${aktiv?.name ?? "?"}.`;
      $("#urteil").textContent = "";
      // wer schon getippt hat, steht unten in den Spielerkarten (zeitstrahleZeichnen)
      $("#eingaben").replaceChildren();
      // Quellenhinweis schon während der Hörprobe (ohne Link – der würde den Titel verraten)
      $("#fakten").replaceChildren(z.quelle ? el("span", { text: `🎧 Hörprobe: ${z.quelle}` }) : []);
      $("#geschichte").classList.add("versteckt");
      $("#ambient").classList.add("geheim");
      $("#ambient").style.backgroundImage = "";
      // nur neu einhängen, wenn nötig – sonst startet die Dreh-Animation bei jedem Update neu
      if ($("#cover-gross").firstChild !== platte) $("#cover-gross").replaceChildren(platte);
      platte.classList.toggle("gesperrt", !hierAudio || !audio.url);
      // keine Statuszeilen („Alle sortieren …“, „Die erste Antwort ist da …“) – die Uhr rechts oben zeigt den Countdown
      $("#hinweis").textContent = z.aufloesungUm || !hierAudio || audio.url ? "" : "Ausschnitt wird vorbereitet …";
    } else if (z.ergebnis) {
      audio.stop();
      const e = z.ergebnis;
      const schluessel = `${z.runde}-${e.karte.songId}`;
      if (aufgedeckt !== schluessel) {
        aufgedeckt = schluessel;
        aufloesen(z, e);
      }
    }
    zeitstrahleZeichnen(z);
    hintergrundStimmung(z);
  }

  async function aufloesen(z, e) {
    const k = e.karte;
    $("#eingaben").replaceChildren();
    if (z.verdeckt) return verdeckt(e, z);
    const treffer = (z.ergebnisse ?? []).filter((r) => r.richtig).length;
    $("#kicker").textContent = !e.spielerId
      ? `${treffer} von ${z.ergebnisse?.length ?? 0} richtig` // Modus „alle“
      : e.richtig ? `✓ ${name(e.spielerId)} liegt richtig` : e.zeitUm ? `⏱ ${name(e.spielerId)}: Zeit abgelaufen` : `✗ ${name(e.spielerId)} liegt daneben`;
    $("#titel-gross").textContent = k.titel;
    $("#interpret-gross").textContent = k.interpret;
    hochzaehlen($("#jahr-gross"), k.jahr);
    const u = $("#urteil");
    u.className = `urteil ${e.richtig ? "gut" : "schlecht"}`;
    u.textContent = !e.spielerId
      ? (treffer ? "Karte geht in den Zeitstrahl, wer richtig lag" : wohinFalsch(z))
      : e.richtig ? "Karte geht in den Zeitstrahl" : wohinFalsch(z);
    if (e.richtig) konfetti();

    // Cover unverändert vom Dienst; der Hintergrund ist ein eigener Verlauf in der Farbe des Jahrzehnts (keine Bearbeitung des Covers)
    const amb = $("#ambient");
    amb.classList.remove("geheim");
    amb.style.backgroundImage = `linear-gradient(135deg, hsl(${farbton(k.jahr)} 90% 55%), hsl(${farbton(k.jahr) + 60} 90% 45%), hsl(${farbton(k.jahr) + 120} 85% 40%))`;
    const img = el("img", { alt: `Cover: ${k.titel}`, src: `/api/cover/${k.songId}` });
    img.addEventListener("error", () => img.replaceWith(faerben(el("div", { class: "platzhalter-gross", text: "♪" }), k.jahr)));
    coverUmdrehen(img);

    // Fakten, Geschichte
    $("#fakten").replaceChildren();
    $("#geschichte").classList.add("versteckt");
    try {
      const d = await api(`/api/details/${k.songId}?raum=${encodeURIComponent(z.code)}`);
      if (aufgedeckt !== `${z.runde}-${k.songId}`) return;
      const fakten = [];
      if (d.album) fakten.push(`💿 ${d.album}`);
      fakten.push(`🗓️ ${String(k.jahr).slice(0, 3)}0er`);
      for (const g of d.genres ?? []) if (GENRE_NAMEN[g]) fakten.push(GENRE_NAMEN[g]);
      $("#fakten").replaceChildren(...fakten.map((f) => el("span", { text: f })));
      // Apple/Deezer verlangen bei Hörproben einen Hinweis mit Link (gilt für Ton und Cover)
      if (d.appleUrl) {
        const dienst = /deezer\.com/.test(d.appleUrl) ? "Deezer" : "Apple Music";
        $("#fakten").append(quelleHinweis(dienst, d.appleUrl, "leise"));
      }
      // eigene Geschichte (in der Bibliothek gepflegt) – ein Satz reicht
      if (d.geschichte) {
        $("#geschichte").textContent = d.geschichte;
        $("#geschichte").classList.remove("versteckt");
      }
    } catch {
      /* Details sind Beiwerk */
    }
  }

  /** Was jemand getippt hat, als kurzer Text (steht im Spieler-Rahmen). */
  function zeitraumText(r) {
    if (r.zeitUm || !r.zeitraum) return "nichts eingegeben";
    const { von, bis } = r.zeitraum;
    if (von !== null && bis !== null) return von === bis ? `${von}` : `${von}–${bis}`;
    if (bis !== null) return `vor ${bis}`;
    if (von !== null) return `nach ${von}`;
    return "erste Karte";
  }

  /** Auflösung: die Schallplatte dreht sich wie eine Karte um, auf der Rückseite liegt das Cover. */
  // jedes Cover deckt sich anders auf (zufällig, nie zweimal hintereinander dieselbe):
  // Drehungen wie eine Karte und „flache“ Varianten ohne 3D (Iris, Vorhang, Platte rollt weg, Zoom)
  const WENDUNGEN = [
    "wende-y", "wende-x", "wende-wirbel", "wende-diagonal", "wende-salto", "wende-pfanne", "wende-doppel", "wende-wackel",
    "flach auf-iris", "flach auf-vorhang", "flach auf-rollen", "flach auf-zoom",
  ];
  let wendung = -1;
  async function coverUmdrehen(rueckseite) {
    const box = $("#cover-gross");
    const vorher = box.firstChild;
    // Bild erst fertig laden und dekodieren – sonst ruckelt die Drehung oder die Rückseite ist kurz leer
    if (rueckseite instanceof HTMLImageElement) {
      const geladen = rueckseite.decode().catch(() => {});
      await Promise.race([geladen, new Promise((r) => setTimeout(r, 1500))]);
    }
    if (box.firstChild !== vorher) return; // inzwischen läuft schon der nächste Song
    const vorne = [...box.childNodes];
    wendung = (wendung + 1 + Math.floor(Math.random() * (WENDUNGEN.length - 1))) % WENDUNGEN.length;
    box.replaceChildren(
      el("div", { class: `wende ${WENDUNGEN[wendung]}` },
        el("div", { class: "seite vorne" }, ...vorne),
        el("div", { class: "seite hinten" }, rueckseite),
      ),
    );
  }

  /** Wohin die Karte geht, wenn niemand richtig lag (Einstellung „Nicht erraten“). */
  const wohinFalsch = (z) => (z.einstellungen.nichtErraten === "weg" ? "Karte ist raus" : "Karte geht zurück in den Stapel");

  /** Niemand lag richtig: Song kommt zurück in den Stapel → Titel, Jahr, Cover und Fakten bleiben geheim. */
  function verdeckt(e, z) {
    const wer = e.spielerId ? name(e.spielerId) : "Niemand";
    $("#kicker").textContent = e.zeitUm ? `⏱ ${wer}: Zeit abgelaufen` : e.spielerId ? `✗ ${wer} liegt daneben` : "✗ Niemand lag richtig";
    $("#titel-gross").textContent = "Der Song kommt später nochmal";
    $("#interpret-gross").textContent = "";
    $("#jahr-gross").textContent = "?";
    const u = $("#urteil");
    u.className = "urteil schlecht";
    u.textContent = wohinFalsch(z);
    $("#ambient").classList.add("geheim");
    coverUmdrehen(el("div", { class: "platzhalter-gross", text: "?" }));
    $("#fakten").replaceChildren();
    $("#geschichte").classList.add("versteckt");
  }

  let vorherGelegt = new Set();
  let sterneGezeigt = null;
  // Stand je Spieler vom letzten Zeichnen – wächst Karten- oder ⭐-Zahl, hüpft sie mit „+1“
  const standVorher = new Map();
  function zahlEl(p, z) {
    const karten = p.zeitstrahl.length;
    const sterne = p.punkte ?? 0;
    const vorher = standVorher.get(p.id);
    standVorher.set(p.id, { karten, sterne });
    const teil = (text, plus, art) =>
      el("span", { class: `zahl-teil ${art} ${plus > 0 ? "plus" : ""}` }, el("span", { class: "wert", text }), plus > 0 ? el("span", { class: "plus-eins", "aria-hidden": "true", text: `+${plus}` }) : null);
    return el(
      "span",
      { class: "zahl" },
      teil(`${karten}/${z.einstellungen.zielKarten}`, vorher ? karten - vorher.karten : 0, "karten"),
      z.einstellungen.raten ? " · " : null,
      z.einstellungen.raten ? teil(`⭐ ${sterne}`, vorher ? sterne - vorher.sterne : 0, "sterne") : null,
    );
  }
  function zeitstrahleZeichnen(z) {
    // fertig = Jahr gelegt und (geführte Eingabe) auch Interpret/Titel abgeschlossen
    const raetNoch = new Set(z.phase === "hoeren" ? z.raten ?? [] : []);
    const jahrDa = new Set(z.phase === "hoeren" ? z.gelegt ?? [] : []); // Eingabe ist angekommen (auch wenn noch geraten wird)
    const gelegt = new Set([...jahrDa].filter((id) => !raetNoch.has(id)));
    // Auflösung: wer Interpret/Titel richtig geraten hat, bekommt ein Abzeichen in der Karte
    const ergebnisse = z.phase === "aufloesung" ? z.ergebnisse ?? (z.ergebnis ? [z.ergebnis] : []) : [];
    // Während der Song läuft: wer überlegt noch, wer hat schon getippt (ohne zu verraten, wohin)
    const status = (p) => {
      if (ergebnisse.some((x) => x.spielerId === p.id)) return null; // steht im Ergebnis-Banner
      if (z.phase !== "hoeren" || (z.einstellungen.modus !== "alle" && p.id !== z.aktiv)) return null;
      if (raetNoch.has(p.id)) return el("span", { class: "tipp-status raet", text: "✓ Jahr · 🎤 rät …" });
      // fertig zeigt der grüne Rahmen der Karte – kein Extra-Hinweis
      return gelegt.has(p.id) ? null : el("span", { class: "tipp-status", text: "überlegt …" });
    };
    // Auflösung: der Tipp steht im Zeitstrahl – richtig = neue Karte leuchtet grün, falsch = rote Karte an der getippten Stelle
    const tippZeitstrahl = (p) => {
      const r = ergebnisse.find((x) => x.spielerId === p.id);
      const lis = p.zeitstrahl.map((k) => {
        const neu = r?.richtig && k.songId === r.karte.songId;
        // Mini-Cover über dem Jahr; ohne Cover bleibt nur die Jahreszahl
        const bild = el("img", { class: "mini-cover", src: `/api/cover/${k.songId}`, alt: "", loading: "lazy" });
        bild.addEventListener("error", () => bild.remove());
        return faerben(el("li", { class: neu ? "tipp gut mit-cover" : "mit-cover", title: `${k.titel} – ${k.interpret}`, "data-jahr": String(k.jahr) }, bild, el("span", { text: neu ? `✓ ${k.jahr}` : String(k.jahr) })), k.jahr);
      });
      if (r && !r.richtig && r.position >= 0) {
        lis.splice(r.position, 0, el("li", { class: "tipp schlecht", title: "hier getippt", text: `✗ ${r.karte.jahr ?? "?"}` }));
      }
      return lis;
    };
    const bonus = (p) => {
      const b = ergebnisse.find((r) => r.spielerId === p.id)?.bonus;
      if (!b || !(b.interpretRichtig || b.titelRichtig)) return null;
      const was = b.interpretRichtig && b.titelRichtig ? "Interpret & Titel" : b.interpretRichtig ? "Interpret" : "Titel";
      return el("div", { class: "bonus-treffer", text: `⭐ ${was} richtig! +${Number(b.interpretRichtig) + Number(b.titelRichtig)}` });
    };
    const denkt = (p) => z.phase === "hoeren" && !jahrDa.has(p.id) && (z.einstellungen.modus === "alle" || p.id === z.aktiv);
    const ergebnisKlasse = (p) => {
      const r = ergebnisse.find((x) => x.spielerId === p.id);
      return r ? (r.richtig ? "ergebnis-gut" : "ergebnis-schlecht") : "";
    };
    const ebenFertig = (p) => jahrDa.has(p.id) && !vorherGelegt.has(p.id);
    // Sterne nur beim ersten Zeichnen der Auflösung (nicht bei jedem Zustands-Update erneut)
    const sterneKey = ergebnisse.length ? `${z.runde}-${ergebnisse[0].karte?.songId ?? ""}` : null;
    const sterneJetzt = sterneKey && sterneKey !== sterneGezeigt;
    if (sterneKey) sterneGezeigt = sterneKey;
    const banner = (p) => {
      const r = ergebnisse.find((x) => x.spielerId === p.id);
      if (!r) return null;
      return el(
        "div",
        { class: `ergebnis-banner ${r.richtig ? "gut" : "schlecht"} ${sterneJetzt ? "neu" : ""}` },
        el("b", { text: r.richtig ? "✓ Richtig!" : "✗ Daneben" }),
        el("span", { text: zeitraumText(r) }),
        r.richtig && sterneJetzt && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? el("span", { class: "sterne", "aria-hidden": "true" }, ...Array.from({ length: 8 }, (_, i) => {
              const s = el("i", { text: i % 2 ? "✦" : "★" });
              s.style.setProperty("--w", `${i * 45 + Math.random() * 20}deg`);
              s.style.setProperty("--d", `${Math.random() * 0.25}s`);
              return s;
            }))
          : null,
      );
    };
    queueMicrotask(() => { for (const ol of document.querySelectorAll("#zeitstrahle ol")) zeitstrahlBuendeln(ol); });
    $("#zeitstrahle").replaceChildren(
      ...z.spieler.map((p) =>
        el(
          "div",
          { class: `mini-strahl ${p.id === z.aktiv ? "aktiv" : ""} ${p.verbunden ? "" : "offline"} ${denkt(p) ? "denkt" : ""} ${ebenFertig(p) ? "eben-fertig" : ""} ${jahrDa.has(p.id) ? "eingeloggt" : ""} ${raetNoch.has(p.id) ? "raet" : ""} ${ergebnisKlasse(p)}` },
          el("h3", {}, avatarEl(p), p.name, status(p), zahlEl(p, z)),
          banner(p),
          (() => {
            const balken = el("i");
            balken.style.width = `${Math.min(100, (100 * p.zeitstrahl.length) / z.einstellungen.zielKarten)}%`;
            return el("div", { class: "fortschritt" }, balken);
          })(),
          el("ol", {}, tippZeitstrahl(p)),
          bonus(p),
        ),
      ),
      // freie Plätze (bis 6) als Einladung: per QR-Code oben rechts einsteigen
      ...Array.from({ length: Math.max(0, 6 - z.spieler.length) }, () =>
        el("div", { class: "mini-strahl frei" }, el("span", { class: "frei-plus", "aria-hidden": "true", text: "+" }), el("span", { text: "Platz frei – QR-Code scannen" })),
      ),
    );
    vorherGelegt = jahrDa;
  }

  // ---------- Ende ----------
  function ende(z) {
    audio.laden(null);
    const gew = z.gewinner.map(name).map((n) => t(n)); // Bot-Namen übersetzt wie in der Rangliste
    $("#sieger-avatare").replaceChildren(...z.gewinner.map((id) => avatarEl(z.spieler.find((p) => p.id === id), true)));
    $("#sieger").textContent = gew.length > 1 ? `Unentschieden: ${gew.join(" & ")}` : `${gew[0] ?? "—"} gewinnt!`;
    ranglisteZeichnen($("#rangliste"), z);
    bestenlisteZeichnen($("#bestenliste"), z.bestenliste, z.spieler.map((p) => p.name));
    if (aufgedeckt !== "ende") {
      aufgedeckt = "ende";
      konfetti(260);
      setTimeout(() => konfetti(200), 900);
    }
  }

  // ---------- Selbst mitspielen ----------
  // Wer kein zweites Gerät hat, spielt hier mit: Wechsel zur Spieler-Seite (Name, Avatar). Dort erkennt sie den
  // Gastgeber an seiner Host-Sitzung und zeigt ihm „Spiel starten“ und am Ende Revanche bzw. neues Spiel.
  function mitspielen() {
    if (zustand) location.assign(`/spielen.html?raum=${encodeURIComponent(zustand.code)}`);
  }

  // ---------- Knöpfe ----------
  // „Allein üben“: erst auf der Spieler-Seite Name und Avatar wählen, dort startet das Spiel dann von selbst
  startKnopf.addEventListener("click", () => {
    if (zustand?.einstellungen.wiedergabe !== "solo") return void tun("host:starten");
    speicher(`zs_solo_start_${zustand.code}`, "1");
    mitspielen();
  });
  $("#revanche").addEventListener("click", () => tun("host:revanche"));
  zweiterKlick($("#beenden"), "Wirklich schließen? Alle fliegen raus", async () => {
    await tun("host:beenden");
    speicher("zs_host", null);
    location.href = "/";
  });
  // Klick auf die Platte: anhalten wie ein Plattenspieler (Ton sinkt und wird leiser) oder weiterspielen
  let tempoSchritt = 0;
  const geschwindigkeit = (von, bis, ms) => {
    const a = audio.element;
    clearInterval(tempoSchritt);
    a.preservesPitch = false;
    const start = performance.now();
    a.playbackRate = von;
    tempoSchritt = setInterval(() => {
      const f = Math.min(1, (performance.now() - start) / ms);
      a.playbackRate = von + (bis - von) * f;
      if (f >= 1) {
        clearInterval(tempoSchritt);
        if (bis === 1) a.preservesPitch = true;
      }
    }, 30);
  };
  const platteKlick = async () => {
    if (platte.classList.contains("gesperrt")) return;
    const a = audio.element;
    if (!a.paused) {
      platteDrehen(false);
      geschwindigkeit(1, 0.4, 800);
      audio.stop(0.8);
      setTimeout(() => {
        if (a.paused) {
          clearInterval(tempoSchritt);
          a.playbackRate = 1;
          a.preservesPitch = true;
        }
      }, 850);
      return;
    }
    platteDrehen(true);
    const ab = a.currentTime > 0 && !a.ended ? a.currentTime : 0;
    geschwindigkeit(0.5, 1, 500);
    const ok = await audio.abspielen(ab);
    if (!ok) {
      platteDrehen(false);
      fehler("Abspielen nicht möglich – Ausschnitt noch nicht bereit oder vom Browser blockiert.");
    }
  };
  platte.addEventListener("click", platteKlick);
  platte.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      platteKlick();
    }
  });
  audio.element.addEventListener("playing", () => platte.setAttribute("aria-label", "Pause"));
  audio.element.addEventListener("pause", () => platte.setAttribute("aria-label", "Abspielen"));
  audio.element.addEventListener("canplay", () => {
    platte.classList.remove("gesperrt");
    if (zustand?.phase === "hoeren") $("#hinweis").textContent = "";
  });
})();

// Player-Karte hat eine feste Höhe (CSS): bei langen Titeln/Bandnamen oder viel Text die Schrift verkleinern
{
  const info = document.querySelector(".player-info");
  let wartet = 0;
  const einpassen = () => {
    wartet = 0;
    const zusatz = [document.getElementById("geschichte")];
    info.style.removeProperty("--fit");
    for (const e of zusatz) e.style.display = "";
    if (getComputedStyle(info).overflow !== "hidden") return; // schmal: Karte wächst mit
    const verkleinern = (bis) => {
      let fit = 1;
      info.style.removeProperty("--fit");
      while (info.scrollHeight > info.clientHeight + 1 && fit > bis) {
        fit -= 0.05;
        info.style.setProperty("--fit", fit.toFixed(2));
      }
    };
    verkleinern(0.7);
    // passt es noch immer nicht: Geschichte weglassen, dann notfalls noch kleiner
    if (info.scrollHeight > info.clientHeight + 1) {
      for (const e of zusatz) e.style.display = "none";
      verkleinern(0.5);
    }
  };
  const bald = () => (wartet ||= setTimeout(einpassen, 30));
  new ResizeObserver(bald).observe(info);
  new MutationObserver(bald).observe(info, { subtree: true, childList: true, characterData: true, attributeFilter: ["class"] });
  document.fonts?.ready.then(bald);
}

// Handy quer: wie ein Fernseher darstellen – das Layout ist mindestens 1280 px breit und der Browser skaliert es auf den Bildschirm.
// So greifen Fernseher-Ansicht und --skala (unten), und alles passt ohne Scrollen. Hochkant bleibt die Handy-Ansicht.
{
  const meta = document.querySelector('meta[name="viewport"]');
  const hochkant = meta?.content;
  const handy = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 500;
  const quer = () => (screen.orientation?.type ?? (Math.abs(Number(window.orientation)) === 90 ? "landscape" : "portrait")).startsWith("landscape");
  const anpassen = (gedreht = true) => {
    // kam das Handy quer von den eigenen Karten (spielen.js): beim Hochkant-Drehen wieder dorthin
    if (gedreht && !quer()) {
      let zurueck = null;
      try {
        zurueck = sessionStorage.getItem("zs_spielfeld_quer");
        sessionStorage.removeItem("zs_spielfeld_quer");
      } catch {
        /* ohne Rückweg */
      }
      if (zurueck) return location.replace(`/spielen.html?raum=${encodeURIComponent(zurueck)}`);
    }
    const lang = Math.max(screen.width, screen.height), kurz = Math.min(screen.width, screen.height);
    const breite = Math.max(1280, Math.round((860 * lang) / kurz)); // ~860 px Höhe wie ein kleiner Fernseher (Handys sind sehr breit)
    const soll = quer() ? `width=${breite}, initial-scale=${(lang / breite).toFixed(3)}, viewport-fit=cover` : hochkant;
    if (meta.content !== soll) meta.content = soll;
  };
  if (meta && handy) {
    anpassen(false);
    screen.orientation?.addEventListener?.("change", anpassen);
    addEventListener("orientationchange", anpassen);
  }
}

// Hauptbildschirm (groß, quer): die Spielansicht passt immer ohne Scrollen auf den Bildschirm.
// Wächst der Inhalt (lange Zeitstrahle), werden Cover-Karte und Zeitstrahle per --skala stufenweise kleiner –
// höchstens bis 0.45 (Schrift der Zeitstrahle hat eine Untergrenze), damit alles lesbar bleibt.
{
  const spiel = document.getElementById("spiel");
  const gross = matchMedia("(min-width: 1024px) and (orientation: landscape)");
  let wartet = 0;
  const passen = () => {
    wartet = 0;
    spiel.style.removeProperty("--skala");
    spiel.classList.remove("ohne-cover");
    if (spiel.classList.contains("versteckt") || !gross.matches) return;
    const wurzel = document.documentElement;
    const verkleinern = () => {
      let k = 1;
      spiel.style.removeProperty("--skala");
      while (wurzel.scrollHeight > innerHeight + 1 && k > 0.46) {
        k -= 0.05;
        spiel.style.setProperty("--skala", k.toFixed(2));
      }
    };
    for (const ol of spiel.querySelectorAll("#zeitstrahle ol")) zeitstrahlBuendeln(ol);
    verkleinern();
    for (const ol of spiel.querySelectorAll("#zeitstrahle ol")) zeitstrahlBuendeln(ol);
    // reicht das nicht (lange Zeitstrahle, niedriger Bildschirm): Mini-Cover weglassen, nur Jahre
    if (wurzel.scrollHeight > innerHeight + 1) {
      spiel.classList.add("ohne-cover");
      verkleinern();
    }
  };
  const bald = () => (wartet ||= setTimeout(passen, 50));
  new ResizeObserver(bald).observe(spiel);
  // nur auf Ein-/Ausblenden reagieren – „ohne-cover“ setzt passen() selbst
  let sichtbar = !spiel.classList.contains("versteckt");
  new MutationObserver(() => {
    if (sichtbar !== !spiel.classList.contains("versteckt")) (sichtbar = !sichtbar), bald();
  }).observe(spiel, { attributeFilter: ["class"] });
  addEventListener("resize", bald);
}

/**
 * Zeitstrahl in einer Zeile halten: passen nicht alle Karten nebeneinander, werden benachbarte Karten zu
 * einem Stapel zusammengefasst (übereinanderliegende Cover, Jahre „1984–95“). Die getippte Karte bleibt einzeln.
 */
function zeitstrahlBuendeln(ol) {
  const alle = (ol._alle ??= [...ol.children]);
  ol.replaceChildren(...alle);
  if (alle.length < 2 || !ol.clientWidth) return;
  const luecke = parseFloat(getComputedStyle(ol).columnGap) || 4;
  const breite = Math.max(...alle.map((li) => li.offsetWidth));
  let platz = Math.max(1, Math.floor((ol.clientWidth + luecke) / (breite + luecke)));
  if (alle.length <= platz) return;
  const einzeln = (li) => li.classList.contains("tipp");
  const gruppen = alle.map((li) => [li]);
  // Stapel-Beschriftungen („1991–2000“) sind breiter als einzelne Karten: nachmessen und weiter bündeln, bis nichts umbricht
  const umbricht = () => new Set([...ol.children].map((li) => li.offsetTop)).size > 1;
  for (;;) {
    // immer das kleinste benachbarte Paar zusammenlegen, bis alles in eine Zeile passt
    while (gruppen.length > platz) {
      let beste = -1;
      for (let i = 0; i < gruppen.length - 1; i++) {
        if (gruppen[i].some(einzeln) || gruppen[i + 1].some(einzeln)) continue;
        if (beste < 0 || gruppen[i].length + gruppen[i + 1].length < gruppen[beste].length + gruppen[beste + 1].length) beste = i;
      }
      if (beste < 0) break;
      gruppen.splice(beste, 2, [...gruppen[beste], ...gruppen[beste + 1]]);
    }
    ol.replaceChildren(...gruppen.map((g) => {
      if (g.length === 1) return g[0];
      const von = g[0].dataset.jahr;
      const bis = g.at(-1).dataset.jahr;
      const text = von === bis ? von : von.slice(0, 2) === bis.slice(0, 2) ? `${von}–${bis.slice(2)}` : `${von}–${bis}`;
      const bilder = el("span", { class: "stapel-bilder" }, g.slice(-3).map((li) => li.querySelector("img")?.cloneNode()).filter(Boolean));
      const li = el("li", { class: "mit-cover stapel", title: g.map((x) => `${x.dataset.jahr}: ${x.title}`).join("\n"), "data-jahr": bis },
        bilder, el("span", { text }), el("b", { class: "stapel-zahl", text: `×${g.length}` }));
      li.style.setProperty("--farbton", g.at(-1).style.getPropertyValue("--farbton"));
      return li;
    }));
    if (!umbricht() || gruppen.length > platz || platz <= 1) return;
    platz = gruppen.length - 1;
  }
}

/**
 * Digitale Sanduhr am Rand des Hauptbildschirms: eine LED-Punktmatrix in Sanduhrform. Oben erlöschen die Punkte
 * Reihe für Reihe, unten wächst ein Haufen von der Mitte aus – von jetzt bis zum Zeitpunkt „bis“ (Serveruhr).
 */
const SANDUHR_REIHEN = [9, 9, 7, 5, 3, 1, 3, 5, 7, 9, 9];
function sanduhr(box, abschnitte, wartetAuf) {
  clearInterval(box._uhr);
  const aufbauen = () => {
    const matrix = el("div", { class: "led-matrix", "aria-hidden": "true" });
    const oben = [];
    const unten = [];
    let hals = null;
    const mitte = Math.floor(SANDUHR_REIHEN.length / 2);
    SANDUHR_REIHEN.forEach((breite, r) => {
      const reihe = [];
      for (let c = 0; c < 9; c++) {
        const punkt = el("i");
        punkt.style.setProperty("--farbton", String((r * 32 + 280) % 360));
        const drin = Math.abs(c - 4) <= (breite - 1) / 2;
        if (!drin) punkt.className = "aus-form";
        matrix.append(punkt);
        if (drin) reihe.push({ punkt, abstand: Math.abs(c - 4) });
      }
      // oben erlöschen die Punkte Reihe für Reihe von außen nach innen; unten wächst der Haufen ab der untersten Reihe von der Mitte aus
      if (r < mitte) oben.push(...reihe.sort((x, y) => y.abstand - x.abstand).map((x) => x.punkt));
      else if (r > mitte) unten.unshift(...reihe.sort((x, y) => x.abstand - y.abstand).map((x) => x.punkt));
      else hals = reihe[0].punkt;
    });
    box._punkte = { oben, unten, hals };
    box.replaceChildren(matrix, el("span", { class: "uhr-zahl", "aria-hidden": "true" }), el("span", { class: "weiter-label" }));
    matrix.animate([{ transform: "rotate(180deg)" }, { transform: "rotate(0)" }], { duration: 600, easing: "cubic-bezier(.3, 1.4, .5, 1)" });
  };
  // Klick auf die Uhr: zwischen Sanduhr und Zahlen-Countdown wechseln (wird gemerkt)
  if (!box._klick) {
    box._klick = true;
    box.classList.toggle("zahlen", speicher("zs_uhr") === "zahlen");
    box.title = "Klicken: Sanduhr oder Zahlen";
    box.addEventListener("click", () => {
      const zahlen = box.classList.toggle("zahlen");
      speicher("zs_uhr", zahlen ? "zahlen" : null);
    });
  }
  const tick = () => {
    const jetzt = Date.now();
    const a = abschnitte.find((x) => x.bis && lokal(x.bis) - jetzt > 300 && !(x.ab && lokal(x.ab) > jetzt));
    if (!a && !wartetAuf?.length) {
      box.classList.add("versteckt");
      box._ziel = null;
      // ein Abschnitt beginnt erst noch (Song startet gleich) → weiter takten, damit die Uhr dann von selbst erscheint
      if (!abschnitte.some((x) => x.ab && x.bis && lokal(x.ab) > jetzt)) clearInterval(box._uhr);
      return;
    }
    box.classList.remove("versteckt");
    const ziel = a ? lokal(a.bis) : null;
    if (!box._punkte || (a && box._ziel !== a.bis)) {
      box._ziel = a?.bis ?? null;
      box._von = jetzt;
      aufbauen();
    }
    const { oben, unten, hals } = box._punkte;
    const rest = ziel ? Math.max(0, ziel - jetzt) : 0;
    const anteil = ziel ? Math.min(1, (jetzt - box._von) / Math.max(1, ziel - box._von)) : 1;
    const n = Math.round(anteil * oben.length);
    oben.forEach((p, i) => p.classList.toggle("an", i >= n));
    unten.forEach((p, i) => p.classList.toggle("an", i < n));
    hals.classList.toggle("an", rest > 0 && Math.floor(jetzt / 250) % 2 === 0);
    box.classList.toggle("knapp", rest > 0 && rest <= 5000);
    // Zahlen-Countdown: jede Sekunde springt die Zahl neu auf und wird zum Ende hin immer größer
    const sek = Math.ceil(rest / 1000);
    const zahl = box.querySelector(".uhr-zahl");
    if (zahl.textContent !== String(sek)) {
      zahl.textContent = String(sek);
      zahl.style.setProperty("--wachsen", String(anteil));
      if (box.classList.contains("zahlen")) zahl.animate([{ transform: "scale(0.5)", opacity: 0.2 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
    }
    box.querySelector(".weiter-label").textContent = !rest && wartetAuf?.length ? `Warte auf ${wartetAuf.join(" & ")} …` : a?.label ?? "";
  };
  tick();
  box._uhr = setInterval(tick, 125);
}

/** Vor dem Songstart lädt sich der Fortschrittsbalken von links nach rechts auf – genau bis zur Startzeit (Serveruhr). */
function leisteAufladen(leiste, startUm) {
  const start = startUm ? lokal(startUm) : 0;
  if (leiste._start === startUm) return;
  leiste._start = startUm;
  leiste.querySelector(".aufladen")?.remove();
  if (!start || start - Date.now() < 300) return;
  // bunt und verspielt: Regenbogen mit wandernden Streifen füllt sich von links nach rechts, am Ziel ein kleiner Hüpfer
  const balken = el("b", { class: "aufladen", "aria-hidden": "true" });
  leiste.append(balken);
  leiste.classList.add("laedt");
  balken.animate([{ clipPath: "inset(0 100% 0 0 round 6px)" }, { clipPath: "inset(0 0 0 0 round 6px)" }], { duration: start - Date.now(), easing: "cubic-bezier(0.45, 0.05, 0.55, 0.95)", fill: "forwards" })
    .finished.then(() => balken.animate([{ transform: "scaleY(1)", opacity: 1 }, { transform: "scaleY(1.8)", opacity: 1, offset: 0.35 }, { transform: "scaleY(1)", opacity: 0 }], { duration: 450, fill: "forwards" }).finished)
    .then(() => { balken.remove(); leiste.classList.remove("laedt"); }, () => leiste.classList.remove("laedt"));
}
