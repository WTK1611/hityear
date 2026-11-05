// Gemeinsame Helfer für alle Seiten (ohne Build-Schritt, ohne Framework).
"use strict";

const $ = (sel, wurzel = document) => wurzel.querySelector(sel);

/** Element bauen; Texte immer über textContent (kein innerHTML mit Daten). */
/** Kleine SVG-Symbole statt Unicode-Zeichen (▶ ❚❚ fehlen in manchen TV-Browsern und erscheinen als Kästchen). */
const SYMBOLE = { play: "M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z", pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" };
function symbol(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "symbol");
  const pfad = document.createElementNS(ns, "path");
  pfad.setAttribute("d", SYMBOLE[name]);
  pfad.setAttribute("fill", "currentColor");
  svg.append(pfad);
  return svg;
}

function el(tag, attrs = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "farbe") e.style.background = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    e.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return e;
}

async function api(pfad, daten) {
  const res = await fetch(pfad, {
    method: daten === undefined ? "GET" : "POST",
    headers: daten === undefined ? {} : { "Content-Type": "application/json" },
    body: daten === undefined ? undefined : JSON.stringify(daten),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.fehler || `HTTP ${res.status}`), { status: res.status });
  return json;
}

/** Nicht angemeldet (Passwortpflicht auf dem Server) → Passwort abfragen, erst danach geht es weiter. */
async function anmeldungPruefen() {
  const { rolle } = await api("/api/ich");
  return rolle || passwortAbfragen();
}

function passwortAbfragen() {
  return new Promise((fertig) => {
    const feld = el("input", { type: "password", id: "zugang-passwort", autocomplete: "current-password", placeholder: "Passwort", "aria-label": "Passwort", required: "" });
    const meldung = el("p", { class: "fehler", role: "alert" });
    const knopf = el("button", { class: "gross", type: "submit", text: "Rein da! 🎶" });
    const form = el(
      "form",
      { class: "zugang-karte box" },
      el("div", { class: "zugang-schloss", "aria-hidden": "true", text: "🔒" }),
      el("h2", { text: "Psst … wie lautet das Passwort?" }),
      el("p", { class: "leise klein", text: "HitYear ist gerade nur mit Passwort spielbar." }),
      feld,
      meldung,
      knopf,
      el("p", { class: "zugang-links klein" }, el("a", { href: "/datenschutz.html", text: "Datenschutz" })),
    );
    const huelle = el("div", { class: "zugang", role: "dialog", "aria-modal": "true", "aria-label": "Passwort" }, form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      meldung.textContent = "";
      knopf.disabled = true;
      try {
        const { rolle } = await api("/api/login", { passwort: feld.value });
        huelle.classList.add("weg");
        setTimeout(() => huelle.remove(), 400);
        fertig(rolle);
      } catch (err) {
        meldung.textContent = err.message;
        form.classList.remove("wackeln");
        void form.offsetWidth; // Animation neu starten
        form.classList.add("wackeln");
        feld.select();
      } finally {
        knopf.disabled = false;
      }
    });
    const zeigen = () => {
      document.body.append(huelle);
      feld.focus();
    };
    if (document.body) zeigen();
    else document.addEventListener("DOMContentLoaded", zeigen);
  });
}

/** Songs ohne Cover: nicht bei jedem Neuzeichnen erneut anfragen */
const ohneCover = new Set();

function karteEl(k, extra = "") {
  // Mini-Cover rechts; fehlt es, bleibt einfach eine farbige Kachel mit Note
  const leer = () => el("div", { class: "karte-cover leer", "aria-hidden": "true", text: "♪" });
  const cover = ohneCover.has(k.songId) ? leer() : el("img", { class: "karte-cover", src: `/api/cover/${k.songId}`, alt: "", loading: "lazy" });
  cover.addEventListener("error", () => {
    ohneCover.add(k.songId);
    cover.replaceWith(leer());
  });
  const karte = el(
    "div",
    { class: `karte ${extra}` },
    el("div", { class: "jahr", text: k.jahr }),
    el("div", { class: "titel", text: k.titel }),
    cover,
    el("div", { class: "interpret", text: k.interpret }),
  );
  return faerben(karte, k.jahr);
}

/** Hinweis „Hörprobe & Cover bereitgestellt von …“, verlinkt auf den Song – die Dienste verlangen Hinweis und Link. */
function quelleHinweis(dienst, link, klasse) {
  const attr = { class: klasse, text: `Hörprobe & Cover bereitgestellt von ${dienst}` };
  return link ? el("a", { ...attr, class: `${klasse} quelle-link`, href: link, target: "_blank", rel: "noopener" }) : el("small", attr);
}

async function quelleZeigen(songId, ziel) {
  try {
    const q = await api(`/api/quelle/${songId}`);
    if (!q.dienst) return;
    ziel.replaceChildren(quelleHinweis(q.dienst, q.link, "quelle-hinweis"));
  } catch {
    /* ohne Hinweis weiter */
  }
}

/** Auflösung groß: Cover, Jahr, Titel, Interpret (Cover erst nach dem Aufdecken freigegeben). */
function aufloesungEl(k) {
  const platzhalter = () => faerben(el("div", { class: "aufloesung-cover platzhalter", text: "♪" }), k.jahr);
  const cover = el("img", { class: "aufloesung-cover", src: `/api/cover/${k.songId}`, alt: `Cover: ${k.titel}` });
  cover.addEventListener("error", () => cover.replaceWith(platzhalter()));
  const quelle = el("div", { class: "quelle" });
  quelleZeigen(k.songId, quelle);
  return faerben(el("div", { class: "aufloesung" },
    cover,
    el("div", { class: "aufloesung-text" },
      el("div", { class: "jahr", text: k.jahr }),
      el("div", { class: "titel", text: k.titel }),
      el("div", { class: "interpret", text: k.interpret }),
      quelle,
    ),
  ), k.jahr);
}

/** Restzeit bis zur Frist anzeigen; Serveruhr wird ausgeglichen. Ohne Frist ausgeblendet. */
function fristAnzeigen(ziel, z, label = "Zeit zum Einordnen") {
  clearInterval(ziel._uhr);
  const frist = z.frist ? lokal(z.frist) : null;
  ziel.classList.toggle("versteckt", !frist);
  if (!frist) return;
  const gross = ziel.classList.contains("weiter-gross"); // Hauptbildschirm: große Zahl im Countdown-Platz
  let zuletzt = null;
  const tick = () => {
    const rest = Math.max(0, Math.ceil((frist - Date.now()) / 1000));
    // Start-Countdown 3 · 2 · 1 läuft noch → der hat den Platz
    if (gross) ziel.classList.toggle("unter-start", Boolean(document.querySelector(".uhr-platz .countdown")));
    if (rest === zuletzt) return;
    zuletzt = rest;
    if (gross) ziel.replaceChildren(
      el("span", { class: "weiter-label", text: label }),
      el("span", { class: `weiter-zahl ${rest > 5 ? "klein" : "knapp"}`, text: String(rest) }),
    );
    else {
      ziel.textContent = rest ? `⏱ noch ${rest} s zum Einordnen` : "⏱ Zeit ist um";
      ziel.classList.toggle("knapp", rest <= 10);
    }
    if (!rest) clearInterval(ziel._uhr);
  };
  tick();
  ziel._uhr = setInterval(tick, 250);
}

/** Musik-Avatare (gleiche Liste wie AVATARE in src/game.ts). */
const AVATARE = ["🎸", "🎤", "🎹", "🥁", "🎷", "🎺", "🎻", "🪕", "🎧", "🪩", "📻", "💿", "🦄", "🐸", "🦜", "🤘"];

/** Avatar eines Spielers im farbigen Kreis (ohne Avatar: farbiger Punkt). */
function avatarEl(p, gross = false) {
  if (!p?.avatar) return el("span", { class: "punkt", farbe: p?.farbe });
  const a = el("span", { class: `avatar ${gross ? "gross" : ""}`, text: p.avatar, "aria-hidden": "true" });
  a.style.setProperty("--ring", p.farbe || "#fff");
  return a;
}

// ---------- Uhrabgleich mit dem Server ----------
// Alle Zeitpunkte im Zustand (startUm, frist, weiterUm …) sind Serveruhr. Der Versatz wird per Ping
// gemessen (Laufzeit halbiert), damit Countdown, Start und Anzeigen auf allen Geräten gleich laufen.
let uhrVersatz = 0;
const lokal = (serverZeit) => serverZeit - uhrVersatz;
async function uhrAbgleichen(socket) {
  const messungen = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const server = await new Promise((r) => socket.emit("zeit", null, r));
    const t1 = Date.now();
    if (typeof server === "number") messungen.push({ rtt: t1 - t0, versatz: server - (t0 + t1) / 2 });
  }
  messungen.sort((a, b) => a.rtt - b.rtt); // schnellste Antwort ist am genauesten
  if (messungen.length) uhrVersatz = messungen[0].versatz;
}

/** Zählt bis zum automatischen Weiter herunter (Handy: Textzeile, Hauptbildschirm: große Zahl). */
function weiterCountdown(anzeige, z) {
  clearInterval(anzeige._uhr);
  const ziel = z.weiterUm ? lokal(z.weiterUm) : null;
  if (!ziel) return void anzeige.replaceChildren();
  // Hauptbildschirm: große Zahl 10 · 9 · 8 …, die bei jedem Wechsel neu aufspringt
  const gross = anzeige.classList.contains("weiter-gross");
  let zuletzt = null;
  const tick = () => {
    const rest = Math.max(0, Math.ceil((ziel - Date.now()) / 1000));
    if (rest === zuletzt) return;
    zuletzt = rest;
    const wartet = !rest && z.wartetAuf?.length ? `Warte auf ${z.wartetAuf.join(" & ")} …` : null;
    if (!gross) anzeige.textContent = wartet ?? (rest ? `Nächster Song in ${rest} s` : "Nächster Song kommt …");
    else if (wartet) anzeige.replaceChildren(el("span", { class: "weiter-label", text: wartet }));
    else anzeige.replaceChildren(
      el("span", { class: "weiter-label", text: "Nächster Song" }),
      el("span", { class: `weiter-zahl ${rest > 5 ? "klein" : "knapp"}`, text: String(rest) }),
    );
    if (!rest) clearInterval(anzeige._uhr);
  };
  anzeige._uhr = setInterval(tick, 250);
  tick();
}

function speicher(schluessel, wert) {
  try {
    if (wert === undefined) return localStorage.getItem(schluessel);
    if (wert === null) localStorage.removeItem(schluessel);
    else localStorage.setItem(schluessel, wert);
  } catch {
    return null;
  }
  return null;
}

/** Socket mit einfacher Antwort-Promise. */
function verbinden() {
  // eslint-disable-next-line no-undef
  const s = io({ transports: ["websocket", "polling"] });
  s.anfrage = (ereignis, daten) =>
    new Promise((resolve, reject) => {
      s.timeout(8000).emit(ereignis, daten ?? {}, (err, antwort) => {
        if (err) return reject(new Error("Keine Verbindung zum Server."));
        if (!antwort || !antwort.ok) return reject(new Error((antwort && antwort.fehler) || "Fehler"));
        resolve(antwort);
      });
    });
  // bei jeder (Wieder-)Verbindung und regelmäßig die Uhr abgleichen
  s.on("connect", () => void uhrAbgleichen(s));
  setInterval(() => s.connected && void uhrAbgleichen(s), 60_000);
  // Stand-Abgleich: verpasste Zustände (Funkloch, Handy im Schlaf) holt das Gerät selbst nach
  let stand = null;
  // Zu spät angekommene Zustände melden (Fehlersuche) und zu bekannten Zeitpunkten (Auflösung,
  // nächster Song) gezielt nachfragen, statt auf den nächsten 2-s-Abgleich zu warten
  const nachfragen = new Map();
  // Fehlersuche: Ereignisse sammeln und beim nächsten Verbinden an den Server melden (landen im Log)
  const meldungen = [];
  const melden = (typ, daten = {}) => {
    meldungen.push({ typ, ...daten, um: new Date().toISOString().slice(11, 23), sichtbar: document.visibilityState === "visible" });
    if (meldungen.length > 20) meldungen.shift();
    if (s.connected) for (const m of meldungen.splice(0)) s.emit("diagnose", m);
  };
  s.on("connect", () => {
    for (const m of meldungen.splice(0)) s.emit("diagnose", m);
  });
  // Hängt die Seite selbst (iOS hält JavaScript an)? Dann bleiben auch diese Takte aus.
  let letzterTakt = Date.now();
  setInterval(() => {
    const luecke = Date.now() - letzterTakt;
    letzterTakt = Date.now();
    if (luecke > 2000) melden("haenger", { ms: luecke, verbunden: s.connected });
  }, 500);
  let getrenntSeit = 0;
  s.on("disconnect", (grund) => {
    getrenntSeit = Date.now();
    melden("getrennt", { grund });
  });
  s.on("connect", () => {
    if (getrenntSeit) melden("wieder-da", { ms: Date.now() - getrenntSeit });
    getrenntSeit = 0;
  });
  // Handshake vor dem nächsten Song: Antwort beweist, dass Seite und Verbindung leben
  s.on("bereit", (antwort) => typeof antwort === "function" && antwort(true));
  s.on("zustand", (z) => {
    stand = z?.stand ?? null;
    const verzug = z?.um ? Date.now() - lokal(z.um) : 0;
    if (verzug > 1500) s.emit("verzug", { ms: verzug, transport: s.io.engine?.transport?.name, sichtbar: document.visibilityState === "visible" });
    for (const um of [z?.weiterUm, z?.aufloesungUm, z?.frist]) {
      if (!um || nachfragen.has(um)) continue;
      const bis = lokal(um) - Date.now() + 700;
      if (bis > 0 && bis < 120_000) nachfragen.set(um, setTimeout(() => (nachfragen.delete(um), abgleichen()), bis));
    }
  });
  // Jeder Abgleich wartet auf eine Antwort. Bleibt sie aus, ist die Verbindung tot, auch wenn der
  // Browser sie noch für offen hält (iOS nach Sperre/Hintergrund) → sofort neu verbinden.
  let neuVerbinden = false;
  const abgleichen = () => {
    if (!s.connected || neuVerbinden) return;
    s.timeout(3000).emit("abgleich", { stand: stand ?? -1 }, (err) => {
      if (!err || !s.connected || neuVerbinden) return;
      melden("keine-antwort");
      neuVerbinden = true;
      s.disconnect();
      s.connect();
    });
  };
  s.on("connect", () => {
    neuVerbinden = false;
    setTimeout(abgleichen, 300); // nach dem (Wieder-)Verbinden gleich nachholen
  });
  setInterval(() => document.visibilityState === "visible" && abgleichen(), 2000);
  const aufwachen = () => {
    if (document.visibilityState !== "visible") return;
    if (!s.connected) s.connect(); // Verbindung sofort neu aufbauen statt auf den Backoff zu warten
    else abgleichen();
  };
  document.addEventListener("visibilitychange", aufwachen);
  addEventListener("pageshow", (e) => {
    // aus dem Zurück-Cache wiederhergestellt → die alte Verbindung ist sicher tot
    if (e.persisted && s.connected) {
      neuVerbinden = true;
      s.disconnect();
      s.connect();
    } else aufwachen();
  });
  addEventListener("online", aufwachen);
  addEventListener("focus", aufwachen);
  // Verbindung weg → deutlicher Hinweis oben (nach 1,5 s, kurze Wackler bleiben unsichtbar)
  let hinweisUhr = 0;
  const hinweis = el("div", { class: "verbindung-weg", role: "status", text: "🔌 Verbindung weg – verbinde neu …" });
  s.on("disconnect", () => {
    clearTimeout(hinweisUhr);
    hinweisUhr = setTimeout(() => !s.connected && document.body.append(hinweis), 1500);
  });
  s.on("connect", () => {
    clearTimeout(hinweisUhr);
    hinweis.remove();
  });
  return s;
}

/**
 * Bildschirm wach halten, solange ein Spiel läuft (Screen Wake Lock, iOS ab 16.4). Ein schlafendes
 * Handy verliert die Verbindung – genau das soll nicht passieren. Nach dem Zurückkehren neu anfordern.
 */
let wachSperre = null;
let wachGewuenscht = false;
async function wachHalten(an) {
  wachGewuenscht = an;
  try {
    if (an && !wachSperre && "wakeLock" in navigator && document.visibilityState === "visible") {
      wachSperre = await navigator.wakeLock.request("screen");
      wachSperre.addEventListener("release", () => (wachSperre = null));
    } else if (!an && wachSperre) {
      await wachSperre.release();
      wachSperre = null;
    }
  } catch {
    /* nicht unterstützt oder Energiesparmodus – dann eben nicht */
  }
}
document.addEventListener("visibilitychange", () => wachGewuenscht && void wachHalten(true));
// manche Browser (Safari) verlangen dafür eine Berührung – beim nächsten Tipp nachholen
document.addEventListener("pointerdown", () => wachGewuenscht && !wachSperre && void wachHalten(true), true);

function vibrieren(muster) {
  try {
    navigator.vibrate && navigator.vibrate(muster);
  } catch {
    /* egal */
  }
}

/** Kurze stille WAV-Datei: damit lässt sich Audio beim ersten Antippen freischalten (Safari/iOS). */
function stilleWav() {
  const n = 800;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); text(8, "WAVE"); text(12, "fmt ");
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, 8000, true);
  b.setUint32(28, 16000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); text(36, "data"); b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

// ---------- Ton über Web Audio (Ein-/Ausblenden, Visualizer) ----------
// Ein gemeinsamer AudioContext, je Audio-Element eine Quelle mit Lautstärke-Knoten (iOS ignoriert audio.volume).
// Erst nach einem Tipp/Klick umleiten, wenn der Kontext wirklich läuft – sonst bliebe der Song stumm.
let tonKontext = null;
const tonwege = new WeakMap(); // Element → Promise<{ ctx, gain }> (bleibt offen, solange es kein Web Audio gibt)
const tonwegWartend = [];
function tonwegeAnschliessen() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !tonwegWartend.length) return;
  // erst nach einer echten Geste (auf Touch-Geräten zählt pointerdown noch nicht) – sonst warnt Chrome „AudioContext was not allowed to start“
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    tonKontext ??= new Ctx();
  } catch {
    return;
  }
  tonKontext.resume().then(() => {
    if (tonKontext.state !== "running") return;
    for (const w of tonwegWartend.splice(0)) {
      try {
        const gain = tonKontext.createGain();
        tonKontext.createMediaElementSource(w.element).connect(gain).connect(tonKontext.destination);
        w.fertig({ ctx: tonKontext, gain });
      } catch {
        /* ohne Web Audio weiter (Ton läuft direkt) */
      }
    }
  }, () => {});
}
for (const ev of ["pointerdown", "pointerup", "keydown", "click"]) document.addEventListener(ev, tonwegeAnschliessen, true);
function tonweg(element) {
  if (!tonwege.has(element)) {
    tonwege.set(element, new Promise((fertig) => tonwegWartend.push({ element, fertig })));
    if (navigator.userActivation?.hasBeenActive) tonwegeAnschliessen();
  }
  return tonwege.get(element);
}

/** Audio-Spieler mit iOS-Freischaltung: der erste Tipp auf der Seite schaltet Autoplay für später frei. */
function audioSpieler() {
  const a = new Audio();
  a.preload = "auto";
  // Streaming: Hörproben kommen per Weiterleitung von Apple/Deezer (CORS „*“) – nur so darf Web Audio mithören
  a.crossOrigin = "anonymous";
  // Jeder Song wird ein- und ausgeblendet (auch gestreamte Hörproben, die nicht per ffmpeg geschnitten sind)
  const EIN = 1.2;
  const AUS = 1.5;
  let weg = null;
  tonweg(a).then((w) => (weg = w));
  let schritt = 0;
  // von = Startwert erzwingen (beim Einblenden 0), sonst ab der aktuellen Lautstärke
  const blenden = (ziel, sek, von = null) => {
    if (weg) {
      const g = weg.gain.gain;
      const t = weg.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(von ?? g.value, t);
      g.linearRampToValueAtTime(ziel, t + sek);
      return;
    }
    // ohne Web Audio: über audio.volume (wirkt nicht auf iOS)
    clearInterval(schritt);
    if (von !== null) try { a.volume = von; } catch { /* nicht änderbar */ }
    von ??= a.volume;
    const start = performance.now();
    schritt = setInterval(() => {
      const f = Math.min(1, (performance.now() - start) / (sek * 1000));
      try {
        a.volume = von + (ziel - von) * f;
      } catch {
        /* nicht änderbar */
      }
      if (f >= 1) clearInterval(schritt);
    }, 40);
  };
  let ausgeblendet = false;
  a.addEventListener("timeupdate", () => {
    if (!ausgeblendet && Number.isFinite(a.duration) && a.duration - a.currentTime <= AUS) {
      ausgeblendet = true;
      blenden(0, Math.max(0.2, a.duration - a.currentTime));
    }
  });
  let aktuell = null;
  const freischalten = () => {
    for (const ev of ["pointerdown", "keydown"]) document.removeEventListener(ev, freischalten, true);
    if (aktuell) return; // läuft schon ein Ausschnitt, nichts überschreiben
    a.src = stilleWav();
    a.play().then(() => a.pause(), () => {}).finally(() => {
      if (!aktuell) a.removeAttribute("src");
    });
  };
  for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, freischalten, true);
  return {
    element: a,
    laden(url) {
      if (url === aktuell) return;
      aktuell = url;
      // Song läuft noch und es kommt keiner nach (Auflösung) → sanft ausblenden statt hart abschneiden
      if (!url && !a.paused) {
        ausgeblendet = true;
        blenden(0, 0.8);
        setTimeout(() => {
          if (aktuell !== null) return;
          a.pause();
          a.removeAttribute("src");
          a.load();
        }, 800);
        return;
      }
      a.pause();
      if (url) {
        a.src = url;
        a.load();
      } else {
        a.removeAttribute("src");
        a.load();
      }
    },
    async abspielen(ab = 0) {
      if (!aktuell) return false;
      a.currentTime = Math.max(0, ab);
      ausgeblendet = false;
      blenden(0, 0.01, 0);
      try {
        await a.play();
        blenden(1, EIN, 0);
        return true;
      } catch {
        return false;
      }
    },
    /** Sanft leiser werden und anhalten */
    stop(sek = 0.4) {
      if (a.paused) return;
      blenden(0, sek);
      const url = aktuell;
      setTimeout(() => aktuell === url && a.pause(), sek * 1000);
    },
    /** Jetzt ausblenden (z. B. kurz bevor der Startsong endet) */
    ausblenden(sek = AUS) {
      ausgeblendet = true;
      blenden(0, sek);
    },
    get url() {
      return aktuell;
    },
  };
}

/**
 * Countdown 3 · 2 · 1 groß über der Seite, danach abspielen. Lässt der Browser kein Autoplay zu,
 * bleibt ein großer Knopf „Tippen zum Abspielen“. nochAktuell() = false bricht ab (Runde vorbei).
 */
/**
 * Synchroner Start auf allen Geräten: 3-2-1 genau vor `startUm` (Serveruhr), dann spielt der
 * Ausschnitt los. Wer später dazukommt (oder erst tippen muss), springt an die richtige Stelle.
 */
/** Nur der Countdown 5 · 4 · 3 · 2 · 1 bis zur gemeinsamen Startzeit – für Geräte ohne eigenen Ton. */
/** Overlay für 3 · 2 · 1: auf dem Hauptbildschirm im Countdown-Platz (#uhr-platz), sonst über der ganzen Seite. */
function countdownFlaeche() {
  const platz = document.querySelector("#uhr-platz");
  const ov = el("div", { class: platz ? "countdown im-platz" : "countdown", "aria-live": "assertive" });
  (platz ?? document.body).append(ov);
  const zeige = (kind) => ov.replaceChildren(...(platz && ov.parentNode === platz ? [el("span", { class: "weiter-label", text: "Gleich geht's los" })] : []), kind);
  return { ov, zeige };
}

/** Davor läuft noch der Startsong → Countdown erst kurz vor dem Start einblenden. */
async function nachStartsong(start, nochAktuell) {
  if (start - Date.now() <= 6000) return true;
  await new Promise((r) => setTimeout(r, start - 3500 - Date.now()));
  return nochAktuell();
}

async function countdownZeigen(startUm, nochAktuell) {
  const start = lokal(startUm);
  if (start - Date.now() < 300) return;
  if (!(await nachStartsong(start, nochAktuell))) return;
  const { ov, zeige } = countdownFlaeche();
  const bis = (t) => new Promise((r) => setTimeout(r, Math.max(0, t - Date.now())));
  const erste = Math.min(3, Math.ceil((start - Date.now()) / 1000));
  zeige(el("span", { class: "countdown-zahl", text: String(erste) }));
  for (const n of [3, 2, 1]) {
    if (start - Date.now() < (n - 1) * 1000) continue;
    await bis(start - n * 1000);
    if (!nochAktuell()) return ov.remove();
    zeige(el("span", { class: "countdown-zahl", text: String(n) }));
  }
  await bis(start);
  if (!nochAktuell()) return ov.remove();
  zeige(el("span", { class: "countdown-zahl los" }, symbol("play")));
  setTimeout(() => ov.remove(), 500);
}

async function countdownAbspielen(audio, nochAktuell, startUm) {
  const start = startUm ? lokal(startUm) : Date.now() + 3000;
  if (!(await nachStartsong(start, nochAktuell))) return;
  const { ov, zeige } = countdownFlaeche();
  let weg = false;
  const entfernen = () => {
    weg = true;
    clearInterval(waechter);
    ov.remove();
  };
  // Runde vorbei oder schon von Hand gestartet → Overlay weg
  const waechter = setInterval(() => {
    if (!nochAktuell() || !audio.element.paused) entfernen();
  }, 300);
  const bis = (t) => new Promise((r) => setTimeout(r, Math.max(0, t - Date.now())));
  const position = () => Math.max(0, (Date.now() - start) / 1000);
  // nur Zahlen: der Countdown zählt 3 · 2 · 1 (beim ersten Song wartet er den längeren Vorlauf zum Laden ab)
  const erste = Math.min(3, Math.ceil((start - Date.now()) / 1000));
  if (erste >= 1) zeige(el("span", { class: "countdown-zahl", text: String(erste) }));
  for (const n of [3, 2, 1]) {
    if (start - Date.now() < (n - 1) * 1000) continue; // zu spät für diese Zahl
    await bis(start - n * 1000);
    if (weg) return;
    zeige(el("span", { class: "countdown-zahl", text: String(n) }));
  }
  await bis(start);
  if (weg) return;
  clearInterval(waechter);
  // Overlay verschwindet überall genau zur Startzeit – nicht erst, wenn dieses Gerät fertig gepuffert hat
  zeige(el("span", { class: "countdown-zahl los" }, symbol("play")));
  const ausblenden = setTimeout(entfernen, 500);
  if (await audio.abspielen(position())) {
    // langsam geladen? an die Stelle springen, an der die anderen gerade sind
    if (Math.abs(audio.element.currentTime - position()) > 0.3) audio.element.currentTime = position();
    return;
  }
  clearTimeout(ausblenden);
  weg = false;
  if (!nochAktuell()) return entfernen();
  // Knopf „Tippen zum Abspielen“ immer groß über der ganzen Seite
  ov.classList.remove("im-platz");
  document.body.append(ov);
  ov.classList.add("tippen");
  ov.replaceChildren(el("button", {
    class: "countdown-knopf",
    text: "▶ Tippen zum Abspielen",
    onclick: async () => {
      if (await audio.abspielen(position())) entfernen(); // an die Stelle, an der die anderen gerade sind
    },
  }));
  const spaeter = setInterval(() => {
    if (!nochAktuell()) {
      clearInterval(spaeter);
      entfernen();
    }
  }, 500);
}

/**
 * Startsong zu Beginn: alle starten mit derselben Karte. Sie wird groß mit Jahr gezeigt und von `ab` bis `bis`
 * (Serveruhr) kurz angespielt – Ton nur, wenn `v.url` da ist. Danach kommt der Countdown zum ersten Song.
 */
let startsongFuer = null;
function startsongZeigen(v, spieler) {
  if (!v || startsongFuer === v.ab) return;
  const ab = lokal(v.ab);
  const bis = lokal(v.bis);
  if (bis - Date.now() < 1500) return;
  startsongFuer = v.ab;
  const k = v.karte;
  const jahr = el("div", { class: "startsong-jahr", text: "…" });
  const cover = el("img", { class: "startsong-cover", alt: `Cover: ${k.titel}`, src: `/api/cover/${k.songId}` });
  cover.addEventListener("error", () => cover.replaceWith(faerben(el("div", { class: "startsong-cover platzhalter-gross", text: "♪" }), k.jahr)));
  const quelle = el("div", { class: "quelle" });
  quelleZeigen(k.songId, quelle);
  // Jahrzehnt-Karten wie auf der Startseite: das Cover fliegt gleich hinein und reiht sich nach Jahr ein
  const reihe = el("div", { class: "startsong-reihe", "aria-hidden": "true" }, [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((d) => {
    const s = el("span", { text: String(d).slice(2) });
    s.style.setProperty("--farbton", String(farbton(d)));
    s.style.animationDelay = `${(d - 1950) / 70}s`;
    return s;
  }));
  const ov = el(
    "div",
    { class: "startsong", role: "status", "aria-live": "polite" },
    el(
      "div",
      { class: "startsong-karte" },
      el("div", { class: "startsong-kicker", text: "Deine Startkarte" }),
      el("div", { class: "startsong-buehne" }, cover, reihe),
      jahr,
      el("div", { class: "startsong-titel", text: k.titel }),
      el("div", { class: "startsong-interpret", text: k.interpret }),
      el("p", { class: "leise klein", text: "Alle beginnen ihren Zeitstrahl mit diesem Song." }),
      quelle,
    ),
  );
  faerben(ov, k.jahr);
  document.body.append(ov);
  if (spieler && v.url) spieler.laden(v.url);
  setTimeout(async () => {
    hochzaehlen(jahr, k.jahr);
    if (spieler && v.url && (await spieler.abspielen(Math.max(0, (Date.now() - ab) / 1000)))) {
      // langsam geladen? an die Stelle springen, an der die anderen gerade sind
      const soll = (Date.now() - ab) / 1000;
      if (Math.abs(spieler.element.currentTime - soll) > 0.3) spieler.element.currentTime = soll;
    }
  }, Math.max(0, ab - Date.now()));
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setTimeout(() => startkarteEinreihen(reihe, k.jahr), Math.max(0, ab - Date.now()) + 1800);
  setTimeout(() => spieler?.ausblenden(), bis - Date.now() - 1500);
  setTimeout(() => {
    spieler?.laden(null);
    ov.classList.add("weg");
    setTimeout(() => ov.remove(), 500);
  }, bis - Date.now());
}

/** Startkarte: das große Cover schrumpft und fliegt in die Lücke hinter seinem Jahrzehnt (nur transform/opacity). */
function startkarteEinreihen(reihe, jahr) {
  const gross = reihe.previousElementSibling; // Cover oder Platzhalter
  if (!reihe.isConnected || !gross) return;
  const d = Math.min(7, Math.max(0, Math.floor((jahr - 1950) / 10)));
  const bild = gross.tagName === "IMG" ? el("img", { src: gross.src, alt: "" }) : faerben(el("i", { class: "platzhalter-gross", text: "♪" }), jahr);
  const platz = el("span", { class: "startsong-platz" }, bild, el("b", { text: String(jahr) }));
  reihe.children[d].after(platz);
  reihe.classList.add("sichtbar");
  // Ziel messen (Lücke schon offen), dann Lücke wieder zu und mit Übergang öffnen
  platz.classList.add("offen", "sofort");
  const ziel = bild.getBoundingClientRect();
  const von = gross.getBoundingClientRect();
  platz.classList.remove("offen");
  void platz.offsetWidth;
  platz.classList.remove("sofort");
  platz.classList.add("offen");
  const dx = von.left + von.width / 2 - (ziel.left + ziel.width / 2);
  const dy = von.top + von.height / 2 - (ziel.top + ziel.height / 2);
  gross.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
  bild.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${von.width / ziel.width})` },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 30}px) rotate(-8deg) scale(1.6)`, offset: 0.55 },
      { transform: "translate(0, 4px) rotate(3deg) scale(1.1)", offset: 0.85 },
      { transform: "none" },
    ],
    { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

// ---------- Design-Helfer ----------

/** Farbton je Jahrzehnt: 60er pink → 2020er lila, jede Dekade eine eigene Farbe. */
function farbton(jahr) {
  const jz = Math.floor(Number(jahr) / 10) * 10;
  const tabelle = { 1950: 20, 1960: 330, 1970: 30, 1980: 300, 1990: 190, 2000: 150, 2010: 50, 2020: 265 };
  return tabelle[jz] ?? ((jz * 7) % 360);
}

/**
 * Stimmung des Hintergrunds: jede Runde eine eigene Farbe (auf allen Geräten gleich, verrät nichts),
 * nach der Auflösung die Farbe des Jahrzehnts. Der Bass (--beat) lässt die Wolken pulsieren.
 */
function hintergrundStimmung(z) {
  const jahr = z.phase !== "hoeren" ? z.ergebnis?.karte?.jahr : null;
  // Pink (330°) ist die Grundfarbe der größten Wolke → so weit drehen, bis sie die Jahrzehnt-Farbe hat
  const drehung = jahr ? farbton(jahr) - 330 : ((z.runde ?? 0) * 67) % 360;
  document.documentElement.style.setProperty("--stimmung", `${drehung}deg`);
}

function faerben(element, jahr) {
  element.style.setProperty("--farbton", String(farbton(jahr)));
  return element;
}

/** Jahreszahl hochzählen (z. B. 1950 → 1984) für die Auflösung. */
function hochzaehlen(element, ziel, dauer = 900) {
  const leise = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (leise) return void (element.textContent = ziel);
  const start = ziel - 40;
  const t0 = performance.now();
  const schritt = (t) => {
    const p = Math.min(1, (t - t0) / dauer);
    const e = 1 - Math.pow(1 - p, 3);
    element.textContent = String(Math.round(start + (ziel - start) * e));
    if (p < 1) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

/** Bestenliste über alle Spiele (Top 5) in `box` zeichnen; `hervor` = Namen dieses Spiels. */
/** Rangliste der gerade beendeten Runde: nach Karten, dann Treffern; `ich` wird hervorgehoben (Handy). */
function ranglisteZeichnen(box, z, ich = null) {
  const sortiert = [...z.spieler].sort((a, b) => b.zeitstrahl.length - a.zeitstrahl.length || b.richtig - a.richtig);
  box.replaceChildren(
    ...sortiert.map((p, i) => {
      const quote = p.richtig + p.falsch ? Math.round((100 * p.richtig) / (p.richtig + p.falsch)) : 0;
      return el(
        "div",
        { class: `platz ${z.gewinner.includes(p.id) ? "sieg" : ""} ${p.id === ich ? "ich" : ""}` },
        el("strong", { text: `${i + 1}.` }),
        avatarEl(p),
        el("span", { text: p.name }),
        el("span", { class: "leise klein", text: `${p.zeitstrahl.length} Karten · ${quote} % Treffer${z.einstellungen.raten ? ` · ⭐ ${p.punkte ?? 0} Punkte` : ""}` }),
      );
    }),
  );
}

function bestenlisteZeichnen(box, liste, hervor = []) {
  box.classList.toggle("versteckt", !liste?.length);
  if (!liste?.length) return;
  const unsere = new Set(hervor.map((n) => n.trim().toLocaleLowerCase("de")));
  const medaille = ["🥇", "🥈", "🥉"];
  box.replaceChildren(
    el("h2", { text: "🏅 Bestenliste" }),
    el("p", { class: "leise klein", text: "Alle Punkte aus allen Spielen – Karten plus ⭐ Zusatzpunkte." }),
    ...liste.map((e, i) =>
      el(
        "div",
        { class: `besten-zeile ${unsere.has(e.name.trim().toLocaleLowerCase("de")) ? "unser" : ""}` },
        el("strong", { class: "besten-platz", text: medaille[i] ?? `${i + 1}.` }),
        el("span", { class: "besten-name", text: e.name }),
        el("span", { class: "leise klein", text: `${e.spiele} ${e.spiele === 1 ? "Spiel" : "Spiele"}${e.siege ? ` · 🏆 ${e.siege}` : ""}` }),
        el("strong", { class: "besten-punkte", text: `${e.punkte}` }),
      ),
    ),
  );
}

/** Buntes Konfetti (Canvas, ohne Bibliothek). `von`: Element, aus dem es platzt (sonst Bildmitte). */
function konfetti(menge = 140, von = null) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = el("canvas", { class: "konfetti", "aria-hidden": "true" });
  document.body.append(c);
  const ctx = c.getContext("2d");
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const farben = ["#ff3d9a", "#ff8a3d", "#ffd93d", "#3dffb0", "#3dd8ff", "#9b5cff"];
  const r = von?.getBoundingClientRect();
  const kraft = r ? 0.55 : 1;
  const teile = Array.from({ length: menge }, () => ({
    x: r ? r.left + r.width / 2 + (Math.random() - 0.5) * r.width : innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: r ? r.top + r.height / 2 : innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 16 * kraft,
    vy: (-Math.random() * 16 - 6) * kraft,
    w: 6 + Math.random() * 8,
    h: 8 + Math.random() * 10,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    f: farben[Math.floor(Math.random() * farben.length)],
  }));
  const t0 = performance.now();
  const bild = (t) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of teile) {
      p.vy += 0.42;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.f;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t - t0 < 3200) requestAnimationFrame(bild);
    else c.remove();
  };
  requestAnimationFrame(bild);
}

/**
 * Kurzer Partikel-Effekt an einem Element (Einrichtungs-Kacheln): jeder Aufruf nimmt die nächste Art –
 * Konfetti, Musiknoten, Sterne, Seifenblasen, Schallplatten. Eine Leinwand, gut eine Sekunde, dann weg.
 */
let funkenArt = 0;
function funken(von) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !von) return;
  const arten = ["konfetti", "noten", "sterne", "blasen", "platten"];
  const art = arten[funkenArt++ % arten.length];
  if (art === "konfetti") return konfetti(40, von);
  const c = el("canvas", { class: "konfetti", "aria-hidden": "true" });
  document.body.append(c);
  const ctx = c.getContext("2d");
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const farben = ["#ff3d9a", "#ff8a3d", "#ffd93d", "#3dffb0", "#3dd8ff", "#9b5cff"];
  const r = von.getBoundingClientRect();
  const mx = r.left + r.width / 2, my = r.top + r.height / 2;
  const zufall = (a, b) => a + Math.random() * (b - a);
  const menge = { noten: 18, sterne: 26, blasen: 22, platten: 12 }[art];
  const teile = Array.from({ length: menge }, (_, i) => {
    const winkel = (i / menge) * Math.PI * 2 + zufall(-0.3, 0.3);
    const tempo = art === "sterne" ? zufall(5, 11) : art === "platten" ? zufall(5, 10) : zufall(1, 3);
    return {
      x: art === "sterne" || art === "platten" ? mx : r.left + zufall(0.1, 0.9) * r.width,
      y: art === "sterne" || art === "platten" ? my : r.top + zufall(0.4, 1) * r.height,
      vx: art === "sterne" || art === "platten" ? Math.cos(winkel) * tempo : zufall(-1.2, 1.2),
      vy: art === "sterne" ? Math.sin(winkel) * tempo : art === "platten" ? Math.sin(winkel) * tempo - 6 : -zufall(2, 4.5),
      g: art === "platten" ? 0.35 : art === "sterne" ? 0.05 : -0.02,
      s: art === "blasen" ? zufall(8, 22) : art === "noten" ? zufall(22, 36) : zufall(8, 16),
      rot: zufall(0, Math.PI * 2), vr: zufall(-0.15, 0.15), phase: zufall(0, 6),
      f: farben[i % farben.length], zeichen: ["♪", "♫", "♬", "♩"][i % 4],
    };
  });
  const stern = (s) => {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? s * 0.45 : s;
      ctx.lineTo(Math.cos((k * Math.PI) / 5 - Math.PI / 2) * rr, Math.sin((k * Math.PI) / 5 - Math.PI / 2) * rr);
    }
    ctx.closePath();
  };
  const dauer = 1400, t0 = performance.now();
  const bild = (t) => {
    const anteil = (t - t0) / dauer;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of teile) {
      p.vy += p.g;
      if (art === "sterne") { p.vx *= 0.93; p.vy *= 0.93; }
      p.x += p.vx + (art === "noten" || art === "blasen" ? Math.sin(t / 220 + p.phase) * 0.8 : 0);
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - anteil * anteil);
      ctx.translate(p.x, p.y);
      ctx.rotate(art === "blasen" ? 0 : p.rot);
      if (art === "noten") {
        ctx.font = `900 ${p.s}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#fff";
        ctx.strokeText(p.zeichen, 0, 0);
        ctx.fillStyle = p.f;
        ctx.fillText(p.zeichen, 0, 0);
      } else if (art === "sterne") {
        stern(p.s * (0.8 + 0.3 * Math.sin(t / 60 + p.phase)));
        ctx.fillStyle = p.i % 2 ? "#fff" : "#ffd93d";
        ctx.fill();
      } else if (art === "blasen") {
        const s = p.s * (0.6 + anteil * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fillStyle = `${p.f}33`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s * 0.35, -s * 0.35, s * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      } else {
        // kleine Schallplatte: schwarz mit weißem Rand, Rillen, farbiges Etikett
        ctx.beginPath();
        ctx.arc(0, 0, p.s, 0, Math.PI * 2);
        ctx.fillStyle = "#160c26";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.beginPath();
        ctx.arc(0, 0, p.s * 0.72, 0, Math.PI * 1.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, p.s * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = p.f;
        ctx.fill();
      }
      ctx.restore();
    }
    if (anteil < 1) requestAnimationFrame(bild);
    else c.remove();
  };
  teile.forEach((p, i) => (p.i = i));
  requestAnimationFrame(bild);
}

// Regel: Der aufwendige Hintergrund (Farbwolken, schwenkende Bühnen-Spotlights) läuft nur auf großen
// Bildschirmen ohne Touch (Laptop, Desktop) und nur am Hauptbildschirm und auf der Startseite. Handys, Tablets
// und Fernseher bekommen immer den ruhenden Verlauf ohne Animation und ohne Weichzeichner: Der teure Hintergrund
// hat iPhones bei jedem Rundenwechsel sekundenlang eingefroren, und TV-Browser haben noch weniger Rechenleistung.
// TV-Modus von Hand: ?tv=1 schaltet ihn auf diesem Gerät dauerhaft ein, ?tv=0 wieder aus (für TV-Browser, die sich
// wie ein Desktop-Browser melden, z. B. manche Hisense/VIDAA-Browser)
const tvVonHand = (() => {
  const wert = new URLSearchParams(location.search).get("tv");
  try {
    if (wert === "1" || wert === "0") localStorage.setItem("hityear-tv", wert);
    return localStorage.getItem("hityear-tv");
  } catch { return wert; }
})();
// Gemessen zu langsam (siehe Bildraten-Messung unten): Gerät bekommt dauerhaft den ruhigen Hintergrund; ?tv=0 setzt zurück
const LANGSAM = "hityear-langsam";
const gemessenLangsam = (() => {
  try {
    if (tvVonHand === "0" && new URLSearchParams(location.search).get("tv") === "0") localStorage.removeItem(LANGSAM);
    return localStorage.getItem(LANGSAM) === "1";
  } catch { return false; }
})();
// Gemessen langsam und gebaut wie ein Fernseher – Bildschirm 16:9 ab 1280 Gerätepixeln, kein Touch – gilt als TV (Tasten-Modus,
// Demo, Kürzel „tv“), auch wenn der Browser sich wie ein Desktop meldet; ?tv=0 nimmt das zurück
const wieTv = Math.abs(screen.width / screen.height - 16 / 9) < 0.05 && Math.max(screen.width, screen.height) * (devicePixelRatio || 1) >= 1280 && !navigator.maxTouchPoints;
const fernseher = tvVonHand === "1" || (tvVonHand !== "0" && (gemessenLangsam && wieTv ||
  /SMART-?TV|SmartTV|Tizen|Web0S|webOS|NetCast|VIDAA|Hisense|HbbTV|BRAVIA|PhilipsTV|Android TV|GoogleTV|AFT[A-Z]|CrKey|Roku|AppleTV|TV Safari|\bTV\b/i.test(navigator.userAgent)));
const grosserBildschirm = !fernseher && !gemessenLangsam && matchMedia("(min-width: 1024px)").matches && !matchMedia("(pointer: coarse)").matches;
// Sparmodus (app.css: html.sparsam): keine Dauer-Animationen, die jedes Bild neu malen. Immer auf Fernsehern,
// sonst nur auf alten Geräten (höchstens 2 Kerne oder 2 GB Speicher) – aktuelle Tablets und Handys behalten alles.
const altesGeraet = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
const sparsam = fernseher || altesGeraet || gemessenLangsam;
document.documentElement.classList.toggle("sparsam", sparsam);
document.documentElement.classList.toggle("tv", fernseher);
const hauptbildschirm = location.pathname === "/host.html";
const startseite = location.pathname === "/" || location.pathname === "/index.html";
const spots = () => ["s1", "s2", "s3", "s4"].map((s) => el("div", { class: `spot ${s}` }));
document.documentElement.classList.toggle("schlicht", !(hauptbildschirm && grosserBildschirm));
document.body.prepend(
  hauptbildschirm && grosserBildschirm
    ? el(
        "div",
        { class: "hintergrund", "aria-hidden": "true" },
        ...["w1", "w2", "w3", "w4"].map((w) => el("div", { class: `wolke ${w}` })),
        ...spots(),
      )
    : el("div", { class: "hintergrund ruhig", "aria-hidden": "true" }, ...(startseite && grosserBildschirm ? spots() : [])),
);

// Bildraten-Messung: Manche Fernseher melden sich wie ein Desktop-Browser (z. B. Hisense) und bekämen sonst den
// teuren Hintergrund – dort ruckelt dann alles. Läuft der Hintergrund, messen wir nach dem Laden 3 s lang die
// Bildrate; schafft das Gerät im Schnitt keine ~36 Bilder/s, schaltet es sofort und dauerhaft auf ruhig und sparsam.
if (grosserBildschirm && (hauptbildschirm || startseite)) {
  setTimeout(() => {
    if (document.hidden) return;
    const zeiten = [];
    let letzte = 0;
    const messen = (t) => {
      if (letzte) zeiten.push(t - letzte);
      letzte = t;
      if (document.hidden) return;
      if (zeiten.length < 120 && zeiten.reduce((a, b) => a + b, 0) < 3000) return void requestAnimationFrame(messen);
      const schnitt = zeiten.reduce((a, b) => a + b, 0) / zeiten.length;
      const ruckler = zeiten.filter((d) => d > 50).length / zeiten.length;
      if (schnitt < 28 && ruckler < 0.15) return;
      // ab dem nächsten Aufruf dauerhaft ruhig; sieht das Gerät aus wie ein Fernseher (wieTv), gilt es dann als TV
      try { localStorage.setItem(LANGSAM, "1"); } catch { /* nur für diesen Aufruf */ }
      document.documentElement.classList.add("sparsam", "schlicht");
      document.querySelector(".hintergrund")?.replaceWith(el("div", { class: "hintergrund ruhig", "aria-hidden": "true" }));
    };
    requestAnimationFrame(messen);
  }, 2500);
}

const zeitText = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** Fortschrittsleiste + Play/Pause-Symbol + Equalizer/Platte an ein Audio-Element binden. */
function playerBinden(audioEl, teile) {
  const { leiste, jetzt, ende, knopf, animiert = [] } = teile;
  const aktualisieren = () => {
    const d = audioEl.duration;
    const t = audioEl.currentTime;
    if (leiste) leiste.style.width = d ? `${Math.min(100, (100 * t) / d)}%` : "0%";
    if (jetzt) jetzt.textContent = zeitText(t);
    if (ende) ende.textContent = d ? `-${zeitText(Math.max(0, d - t))}` : "0:00";
  };
  // während der Wiedergabe jedes Bild nachziehen – „timeupdate“ kommt nur ~4× pro Sekunde und ruckelt
  let bild = 0;
  const schleife = () => {
    aktualisieren();
    bild = audioEl.paused || audioEl.ended ? 0 : requestAnimationFrame(schleife);
  };
  const laeuft = (an) => {
    cancelAnimationFrame(bild);
    // Sparmodus: „timeupdate“ reicht, jedes Bild nachzuziehen kostet dort zu viel
    bild = an && !sparsam ? requestAnimationFrame(schleife) : 0;
    if (knopf) {
      knopf.replaceChildren(symbol(an ? "pause" : "play"));
      knopf.setAttribute("aria-label", an ? "Pause" : "Abspielen");
    }
    for (const a of animiert) a && a.classList.toggle("laeuft", an);
  };
  for (const ev of ["timeupdate", "loadedmetadata", "emptied"]) audioEl.addEventListener(ev, aktualisieren);
  audioEl.addEventListener("playing", () => laeuft(true));
  for (const ev of ["pause", "ended", "emptied"]) audioEl.addEventListener(ev, () => laeuft(false));
  laeuft(false);
  aktualisieren();
}

/**
 * Equalizer zum Song: zeigt die echten Frequenzbänder (Web Audio). Web Audio darf erst nach
 * einem Tipp/Tastendruck starten – bis dahin (oder ohne Web Audio) bleibt die Animation.
 */
function equalizerEl(audioEl, anzahl = 24) {
  const balken = Array.from({ length: anzahl }, (_, i) => {
    const b = el("i");
    b.style.setProperty("--i", String(i / (anzahl - 1))); // 0…1 von links nach rechts (Farbe, Verzögerung)
    // gespiegelte Stile ordnen die Balken per CSS „order“ um: --o Bass in der Mitte, --oa Bass außen;
    // --po/--pa Platz 0…1 in dieser Reihenfolge (Farbe), --dm/--da Abstand zur Mitte 0…1
    const mitte = Math.floor(anzahl / 2), c = (anzahl - 1) / 2;
    const o = i % 2 === 0 ? mitte + i / 2 : mitte - 1 - (i - 1) / 2;
    const oa = i % 2 === 0 ? i / 2 : anzahl - 1 - (i - 1) / 2;
    for (const [k, v] of [["--o", o], ["--oa", oa]]) b.style.setProperty(k, String(v));
    for (const [k, v] of [["--po", o / (anzahl - 1)], ["--pa", oa / (anzahl - 1)], ["--dm", Math.abs(o - c) / c], ["--da", Math.abs(oa - c) / c]]) b.style.setProperty(k, v.toFixed(3));
    return b;
  });
  const eq = el("div", { class: "equalizer", role: "button", tabindex: "0", title: "Klicken: anderer Equalizer", "aria-label": "Equalizer-Stil wechseln" }, ...balken);
  // Per Klick, OK oder ←/→ (Fernbedienung) durch die Stile schalten; die Wahl bleibt auf dem Gerät. Standard: LED
  const STILE = ["led", "balken", "spiegel", "punkte", "neon", "regenbogen", "berge", "pixel", "retro",
    "spektrum", "synthwave", "glut", "linien", "disco", "matrix", "digital", "aurora", "blasen", "welle", "farbwelle"];
  let stil = Math.max(0, STILE.indexOf(speicher("zs_eq") ?? ""));
  const stilSetzen = () => {
    for (const s of STILE) eq.classList.toggle(`eq-${s}`, s === STILE[stil]);
  };
  const wechseln = (schritt = 1) => {
    stil = (stil + schritt + STILE.length) % STILE.length;
    speicher("zs_eq", STILE[stil]);
    stilSetzen();
  };
  eq.addEventListener("click", () => wechseln());
  eq.addEventListener("keydown", (e) => {
    const schritt = { Enter: 1, " ": 1, ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!schritt) return;
    e.preventDefault(); // ←/→ bleiben beim Equalizer, ↑/↓ verlassen ihn (Pfeiltasten-Navigation)
    wechseln(schritt);
  });
  stilSetzen();
  welleAnlegen(eq, balken);
  taktSimulieren(eq, balken);
  if (!audioEl) return eq;
  let ctx = null;
  let analyse = null;
  let daten = null;
  // Bänder logarithmisch verteilt (tiefe Töne links, ~40 Hz bis ~14 kHz bei 1024er-FFT), je Band der Mittelwert
  const kante = (i) => Math.round(2 * 160 ** (i / anzahl));
  const grenzen = [];
  for (let i = 0, von = 1; i < anzahl; i++) {
    const bis = Math.max(von + 1, kante(i + 1));
    grenzen.push([von, bis]);
    von = bis;
  }
  // Spitzen wie bei alten Spektrum-Anzeigen: bleiben kurz oben stehen und fallen dann langsam
  const spitze = balken.map(() => 0);
  const halten = balken.map(() => 0);
  let bildEq = 0; // läuft schon eine Zeichen-Schleife? (sonst startet jedes „playing“ eine weitere)
  let still = 0; // Bilder in Folge ohne jedes Signal
  let zuletztEq = 0;
  const zeichnen = (t = performance.now()) => {
    bildEq = 0;
    if (!analyse) return;
    // Sparmodus: höchstens ~12 Bilder pro Sekunde
    if (sparsam && t - zuletztEq < 80) {
      if (!audioEl.paused) bildEq = requestAnimationFrame(zeichnen);
      return;
    }
    zuletztEq = t;
    analyse.getByteFrequencyData(daten);
    // kein Signal (Web Audio noch gesperrt oder Quelle ohne Freigabe): Spektrum nachbilden statt flacher Balken
    still = daten.some((d) => d > 0) ? 0 : still + 1;
    if (!still) eq.classList.remove("simuliert");
    else if (still > 45) eq.classList.add("simuliert");
    if (eq.classList.contains("simuliert")) {
      if (!audioEl.paused) bildEq = requestAnimationFrame(zeichnen); // weiter horchen, bis Signal kommt
      return;
    }
    grenzen.forEach(([von, bis], i) => {
      let summe = 0;
      for (let k = von; k < bis; k++) summe += daten[k];
      const wert = summe / (bis - von) / 255;
      const hoehe = Math.max(10, Math.round(100 * wert ** 1.4));
      balken[i].style.height = `${hoehe}%`;
      if (hoehe >= spitze[i]) {
        spitze[i] = hoehe;
        halten[i] = 14;
      } else if (halten[i] > 0) halten[i]--;
      else spitze[i] = Math.max(hoehe, spitze[i] - 1.2);
      balken[i].style.setProperty("--sp", (spitze[i] / hoehe).toFixed(3));
      // Bass-Puls setzt Variablen an der Wurzel (ganze Seite neu berechnen) – nicht im Sparmodus
      if (i === 2 && !sparsam) {
        const beat = wert ** 2;
        const wurzel = document.documentElement.style;
        wurzel.setProperty("--beat", beat.toFixed(2));
        // nur sehr kräftiger Bass → die Platte zittert bis ca. 3 Pixel (zufällige Richtung je Bild)
        const stoss = Math.max(0, beat - 0.6) * 7.5;
        wurzel.setProperty("--zx", ((Math.random() * 2 - 1) * stoss).toFixed(1));
        wurzel.setProperty("--zy", ((Math.random() * 2 - 1) * stoss).toFixed(1));
      }
    });
    if (!audioEl.paused) bildEq = requestAnimationFrame(zeichnen);
    else {
      for (const b of balken) b.style.height = "";
      for (const v of ["--beat", "--zx", "--zy"]) document.documentElement.style.setProperty(v, "0");
    }
  };
  // mithören über den gemeinsamen Web-Audio-Weg des Spielers (nach dem Lautstärke-Knoten)
  tonweg(audioEl).then((w) => {
    ctx = w.ctx;
    analyse = ctx.createAnalyser();
    analyse.fftSize = 1024;
    analyse.smoothingTimeConstant = 0.7;
    daten = new Uint8Array(analyse.frequencyBinCount);
    w.gain.connect(analyse);
    eq.classList.add("echt");
    if (!audioEl.paused && !bildEq) zeichnen();
  });
  // bis Web Audio mithören darf (erst nach einem Tipp), wenigstens ein nachgebildetes Spektrum zeigen
  audioEl.addEventListener("playing", () => {
    if (!analyse || ctx.state !== "running") eq.classList.add("simuliert");
    if (!analyse) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    if (!bildEq) zeichnen();
  });
  for (const ev of ["pause", "ended", "emptied"]) audioEl.addEventListener(ev, () => eq.classList.remove("simuliert"));
  return eq;
}

/**
 * Klasse „takt“: Die Musik läuft auf einem anderen Gerät, hier gibt es nichts zu messen. Damit der
 * Equalizer trotzdem wie echte Musik aussieht, wird ein Spektrum nachgebildet: Bass links kräftiger,
 * Höhen rechts schwächer, ein Schlag im 120er-Takt und je Balken ein weich schwankender Pegel.
 */
/** Wellen-Stile („welle“, „farbwelle“): statt Balken glatte Linienbündel durch die Balkenhöhen (SVG, Farben im CSS).
 *  Die Balken bleiben unsichtbar stehen und liefern die Höhen – egal ob gemessen, simuliert oder per CSS-Animation. */
function welleAnlegen(eq, balken) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "eq-welle-bild");
  svg.setAttribute("viewBox", "0 0 400 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  // Verläufe in Nutzerkoordinaten (flache Linien haben keine Höhe → objectBoundingBox würde nichts zeichnen);
  // eigene IDs je Equalizer, Farbe als Attribut (der Stil „welle“ überschreibt sie per CSS)
  const id = `eq-verlauf-${(welleAnlegen.zaehler = (welleAnlegen.zaehler ?? 0) + 1)}`;
  const FARBEN = [["#3dd8ff", "#ffd93d", "#ff3d6e"], ["#ff8a3d", "#ff3d6e", "#3dd8ff"], ["#2f7bff", "#3dffb0", "#ffd93d"]];
  svg.innerHTML = `<defs>${FARBEN.map((f, s) => `<linearGradient id="${id}-${s}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="0">` +
    f.map((farbe, k) => `<stop offset="${k / 2}" stop-color="${farbe}"/>`).join("") + "</linearGradient>").join("")}</defs>`;
  const STRAENGE = 3, LINIEN = 5;
  const pfade = [];
  for (let s = 0; s < STRAENGE; s++)
    for (let l = 0; l < LINIEN; l++) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("class", `strang-${s}`);
      p.setAttribute("stroke", `url(#${id}-${s})`);
      p.setAttribute("vector-effect", "non-scaling-stroke");
      pfade.push({ p, s, l });
      svg.append(p);
    }
  const mittellinie = document.createElementNS(NS, "path");
  mittellinie.setAttribute("class", "mittellinie");
  mittellinie.setAttribute("vector-effect", "non-scaling-stroke");
  mittellinie.setAttribute("d", "M0 50H400");
  svg.append(mittellinie);
  eq.append(svg);
  const n = balken.length;
  // glatte Kurve durch die Punkte (Catmull-Rom → kubische Bézier)
  const kurve = (pt) => {
    let d = `M${pt[0][0]} ${pt[0][1].toFixed(1)}`;
    for (let i = 0; i < pt.length - 1; i++) {
      const [a, b, c, e] = [pt[i - 1] ?? pt[i], pt[i], pt[i + 1], pt[i + 2] ?? pt[i + 1]];
      d += `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
    }
    return d;
  };
  let bild = 0, zuletzt = 0;
  const an = () => eq.isConnected && (eq.classList.contains("eq-welle") || eq.classList.contains("eq-farbwelle"));
  const schritt = (t) => {
    bild = 0;
    if (!an()) return;
    bild = requestAnimationFrame(schritt);
    if (t - zuletzt < (typeof sparsam !== "undefined" && sparsam ? 80 : 30)) return;
    zuletzt = t;
    const voll = eq.clientHeight || 1;
    const h = balken.map((b) => Math.min(1, b.offsetHeight / voll)); // erst alles lesen, dann schreiben
    const z = t / 1000;
    for (const { p, s, l } of pfade) {
      const pt = [[0, 50]];
      for (let i = 0; i < n; i++) {
        const huelle = Math.sin((Math.PI * (i + 1)) / (n + 1)); // an den Rändern flach wie in der Vorlage
        const welle = Math.sin(i * 0.55 + z * (0.8 + s * 0.35) + s * 2.1);
        const auf = 66 * Math.sqrt(h[i]) * huelle * welle * (1 - l * 0.09) + (l - (LINIEN - 1) / 2) * 1.2 * huelle;
        pt.push([((i + 1) * 400) / (n + 1), 50 - Math.max(-48, Math.min(48, auf))]);
      }
      pt.push([400, 50]);
      p.setAttribute("d", kurve(pt));
    }
  };
  const starten = () => {
    if (an() && !bild) bild = requestAnimationFrame(schritt);
  };
  new MutationObserver(starten).observe(eq, { attributeFilter: ["class"] });
  starten();
}

function taktSimulieren(eq, balken) {
  const n = balken.length;
  const pegel = balken.map(() => Math.random());
  let bild = 0;
  let zuletzt = 0;
  const schritt = (t) => {
    bild = 0;
    const an = () => eq.classList.contains("takt") || eq.classList.contains("simuliert");
    if (!an() || !eq.isConnected) {
      for (const b of balken) b.style.height = "";
      return;
    }
    if (t - zuletzt > (sparsam ? 120 : 70)) {
      zuletzt = t;
      const schlag = Math.exp(-(t % 500) / 110); // 120 BPM: kurzer Stoß, dann abklingen
      balken.forEach((b, i) => {
        const x = i / Math.max(1, n - 1);
        pegel[i] += (Math.random() - pegel[i]) * 0.5; // weich zum neuen Zufallswert
        const huelle = 0.95 - 0.4 * x; // Bass lauter als Höhen
        const wert = huelle * (0.12 + 0.6 * pegel[i] ** 1.6 + 0.5 * schlag * (1 - x) ** 1.2);
        b.style.height = `${Math.round(100 * Math.min(0.96, Math.max(0.08, wert)))}%`;
      });
    }
    bild = requestAnimationFrame(schritt);
  };
  new MutationObserver(() => {
    if ((eq.classList.contains("takt") || eq.classList.contains("simuliert")) && !bild) bild = requestAnimationFrame(schritt);
  }).observe(eq, { attributes: true, attributeFilter: ["class"] });
}

// ---------- Fernbedienung (TV) ----------
// Pfeiltasten springen zum nächsten bedienbaren Element in Pfeilrichtung, OK/Enter klickt.
// In Textfeldern bleiben ←/→ beim Cursor; ↑/↓ verlassen das Feld. Auswahllisten öffnet OK.
// Vorgewählt (Fernseher oder nach Pfeiltasten): [data-tv-fokus], im Setup die gewählte Kachel – auch nach
// jedem Neuzeichnen, damit der Fokus nicht verloren geht. Die Zurück-Taste der Fernbedienung blättert im Setup zurück.
(() => {
  // Blätterpfeile der Galerie zählen nicht: der Fokus scrollt die Reihe selbst
  const AUSWAHL = "a[href], button:not([disabled]):not(.galerie-pfeil), input:not([disabled]):not([type=hidden]), select:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
  const RICHTUNG = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  function sichtbar(e) {
    if (e.closest(".versteckt, [hidden]")) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
  }

  function naechstes(von, [dx, dy]) {
    const a = von.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let bestes = null, bestWert = Infinity;
    for (const e of document.querySelectorAll(AUSWAHL)) {
      // Fußzeile (Impressum …) nicht per Pfeil anspringen: Sie läge sonst „rechts“ von jeder Kachelreihe
      if (e === von || !sichtbar(e) || e.closest(".credits")) continue;
      const b = e.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      // Abstand in Pfeilrichtung (muss positiv sein) und quer dazu (wird stärker bestraft)
      const vor = dx ? (bx - ax) * dx : (by - ay) * dy;
      const quer = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      const kante = dx ? (dx > 0 ? b.left - a.right : a.left - b.right) : (dy > 0 ? b.top - a.bottom : a.top - b.bottom);
      if (vor <= 0 || kante < -4) continue;
      const wert = vor + quer * 2.5;
      if (wert < bestWert) { bestWert = wert; bestes = e; }
    }
    return bestes;
  }

  document.addEventListener("keydown", (ev) => {
    const r = RICHTUNG[ev.key];
    if (!r || ev.altKey || ev.ctrlKey || ev.metaKey || ev.defaultPrevented) return;
    const aktiv = document.activeElement;
    const textfeld = aktiv?.matches?.("input:not([type=checkbox]):not([type=radio]), textarea");
    if (textfeld && r[0] !== 0) return;
    const start = aktiv && aktiv !== document.body ? aktiv : null;
    const ziel = start ? naechstes(start, r) : vorschlag() ?? [...document.querySelectorAll(AUSWAHL)].find(sichtbar);
    if (!ziel) return;
    ev.preventDefault();
    ziel.focus({ preventScroll: true, focusVisible: true });
    ziel.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });

  // Tastatur-Modus: am Fernseher von Anfang an, sonst ab der ersten Pfeiltaste; ein Klick/Tipp beendet ihn
  let tasten = fernseher;
  document.addEventListener("keydown", (ev) => { if (RICHTUNG[ev.key]) tasten = true; }, true);
  document.addEventListener("pointerdown", (ev) => { if (ev.pointerType !== "mouse" || !fernseher) tasten = false; }, true);

  // in dieser Reihenfolge: ausdrücklich vorgewählt, im Setup der Hauptknopf („Weiter“, „Weiter mit allen“,
  // „Spiel starten“), wo es keinen gibt die gewählte Kachel, sonst die erste Kachel
  const VORSCHLAG = ["[data-tv-fokus]", "#starten", "#schritt-weiter", "#schritt-inhalt [aria-pressed='true']", "#schritt-inhalt button:not(.galerie-pfeil)"];
  const vorschlag = () => {
    for (const sel of VORSCHLAG) {
      const e = [...document.querySelectorAll(sel)].find((x) => !x.disabled && sichtbar(x));
      if (e) return e;
    }
    return null;
  };
  // TV: Ziffern an den Kacheln (1–9) und am Hauptknopf (0) – dieselbe Auswahl wie die Zifferntasten unten
  const kachelnJetzt = () => [...document.querySelectorAll("#schritt-inhalt button:not(.galerie-pfeil)")].filter((e) => !e.disabled && sichtbar(e));
  const hauptknopf = () => ["#schritt-weiter", "#starten"].map((s) => document.querySelector(s)).find((e) => e && !e.disabled && sichtbar(e));
  const zifferMarken = () => {
    if (!fernseher || !document.querySelector("#schritt-inhalt")) return;
    const soll = new Map(kachelnJetzt().slice(0, 9).map((e, i) => [e, String(i + 1)]));
    const knopf = hauptknopf();
    if (knopf) soll.set(knopf, "0");
    for (const e of document.querySelectorAll("[data-ziffer]")) if (!soll.has(e)) e.removeAttribute("data-ziffer");
    for (const [e, z] of soll) if (e.dataset.ziffer !== z) e.dataset.ziffer = z;
    const assistent = document.querySelector("#assistent");
    if (assistent && !document.querySelector(".ziffern-hinweis")) {
      assistent.after(el("p", { class: "ziffern-hinweis", "aria-hidden": "true" },
        "Fernbedienung: ", el("b", { text: "1" }), el("b", { text: "2" }), el("b", { text: "3" }), " … wählt die Kachel · ", el("b", { text: "0" }), " = Weiter / Start"));
    }
  };
  let geplant = 0;
  const fokusHalten = () => {
    geplant = 0;
    zifferMarken();
    const aktiv = document.activeElement;
    if (!tasten || (aktiv && aktiv !== document.body && aktiv.isConnected && sichtbar(aktiv))) return;
    const ziel = vorschlag();
    if (!ziel) return;
    ziel.focus({ preventScroll: true, focusVisible: true });
    ziel.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const planen = () => (geplant ||= setTimeout(fokusHalten, 120));
  new MutationObserver(planen).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  addEventListener("load", planen);

  // Zifferntasten 1–9 wählen im Setup direkt die n-te Kachel, 0 drückt „Weiter“ (Jahrzehnte, Genres, Start) –
  // sie kommen auch bei TV-Browsern an, deren Pfeiltasten nur einen Mauszeiger schieben
  document.addEventListener("keydown", (ev) => {
    if (!/^[0-9]$/.test(ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey || ev.defaultPrevented) return;
    if (document.activeElement?.matches?.("input, textarea, select")) return;
    const ziel = ev.key === "0" ? hauptknopf() : kachelnJetzt()[Number(ev.key) - 1];
    if (!ziel) return;
    ev.preventDefault();
    tasten = true;
    ziel.focus({ preventScroll: true, focusVisible: true });
    ziel.scrollIntoView({ block: "nearest", inline: "nearest" });
    ziel.click();
  });

  // Zurück-Taste der Fernbedienung (webOS 461, Tizen 10009, Android TV „GoBack“) – im Setup ein Schritt zurück
  document.addEventListener("keydown", (ev) => {
    const zurueck = ev.keyCode === 461 || ev.keyCode === 10009 || ev.key === "GoBack" || ev.key === "BrowserBack";
    if (!zurueck) return;
    const knopf = document.querySelector("#schritt-zurueck");
    if (knopf && sichtbar(knopf)) {
      ev.preventDefault();
      knopf.click();
    }
  });
})();

/**
 * Sicherheitsabfrage im Knopf selbst (statt confirm(), das eingebettete Browser oft still unterdrücken):
 * erster Klick fragt nach, zweiter Klick innerhalb von 4 s führt aus.
 */
// Zurück-Knopf auf jeder Seite außer der Startseite und dem Hauptbildschirm (dort führt das Logo zurück):
// in #zurueck-platz (im Rahmen), sonst unten auf der Seite
if (!["/", "/index.html", "/host.html"].includes(location.pathname)) {
  const knopf = el("a", { class: "knopf zweit zurueck", href: "/" }, el("span", { text: "‹ Zurück" }));
  const platz = document.querySelector("#zurueck-platz");
  if (platz) platz.append(knopf);
  else document.querySelector("main")?.append(el("div", { class: "zurueck-reihe" }, knopf));
}

/** Klick aufs Logo oder „Zurück“ während eines Spiels: erst warnen, beim zweiten Klick verlassen. */
function logoSchutz(laeuft, vorher) {
  for (const link of document.querySelectorAll(".marke-start, .zurueck")) verlassenSchutz(link, laeuft, vorher);
}
function verlassenSchutz(link, laeuft, vorher) {
  const text = link.querySelector("span");
  if (!text) return;
  const alt = text.textContent;
  let bereit = null;
  link.addEventListener("click", async (e) => {
    if (!laeuft()) return;
    e.preventDefault();
    if (!bereit) {
      text.textContent = vorher ? "Spiel abbrechen? Nochmal klicken" : "Spiel verlassen? Nochmal klicken";
      link.classList.add("nachfrage");
      bereit = setTimeout(() => {
        bereit = null;
        text.textContent = alt;
        link.classList.remove("nachfrage");
      }, 4000);
      return;
    }
    clearTimeout(bereit);
    try {
      await vorher?.();
    } finally {
      location.href = "/";
    }
  });
}

function zweiterKlick(knopf, frage, aktion) {
  let bereit = null;
  const text = knopf.textContent;
  knopf.addEventListener("click", async () => {
    if (!bereit) {
      knopf.textContent = frage;
      knopf.classList.add("nachfrage");
      bereit = setTimeout(() => {
        bereit = null;
        knopf.textContent = text;
        knopf.classList.remove("nachfrage");
      }, 4000);
      return;
    }
    clearTimeout(bereit);
    bereit = null;
    knopf.disabled = true;
    try {
      await aktion();
      knopf.textContent = text;
    } catch (e) {
      knopf.textContent = `Fehler: ${e.message}`;
      setTimeout(() => (knopf.textContent = text), 4000);
    } finally {
      knopf.disabled = false;
      knopf.classList.remove("nachfrage");
    }
  });
  return knopf;
}

// Credits unten rechts, GitHub (öffentliches Repo) unten links – auf jeder Seite
const GITHUB_PFAD = "M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z";
document.addEventListener("DOMContentLoaded", () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const pfad = document.createElementNS(ns, "path");
  pfad.setAttribute("d", GITHUB_PFAD);
  pfad.setAttribute("fill", "currentColor");
  svg.append(pfad);
  document.body.append(
    el(
      "div",
      { class: "credits" },
      el("a", { href: "/impressum.html", text: "Impressum" }),
      el("a", { href: "/datenschutz.html", text: "Datenschutz" }),
      el("a", { href: "/nutzungsbedingungen.html", text: "AGB" }),
      el("a", { href: "/cookies.html", text: "Cookies" }),
      el("span", { class: "live-zahl", title: "Spiele gerade live · App-Version · Gerät (tv, tb = Tablet, sp = Smartphone, pc)", "aria-hidden": "true" }),
    ),
    el("a", { class: "github-link", href: "https://github.com/WTK1611/hityear", target: "_blank", rel: "noopener", "aria-label": "Quellcode auf GitHub", title: "Quellcode auf GitHub (Open Source, nicht kommerziell)", tabindex: "-1" }, svg),
  );
});

// Erkanntes Gerät, kurz: tv (Fernseher, auch ?tv=1), tb (Tablet), sp (Smartphone), pc (Laptop/Desktop) –
// dieselben Regeln, nach denen die App Hintergrund, Sparmodus und Handy-Ansicht wählt
function geraetKuerzel() {
  if (fernseher) return "tv";
  if (matchMedia("(pointer: coarse)").matches) return Math.min(screen.width, screen.height) <= 500 ? "sp" : "tb";
  return "pc";
}

// Hinter „Cookies“: Spiele gerade live, App-Version (aus /healthz) und erkanntes Gerät, jede Minute neu
document.addEventListener("DOMContentLoaded", () => {
  const holen = () => {
    if (document.hidden) return;
    fetch("/healthz").then((r) => r.json()).then((d) => {
      const zahl = document.querySelector(".live-zahl");
      if (zahl && Number.isFinite(d.spiele)) zahl.textContent = [d.spiele, d.version, geraetKuerzel()].filter((x) => x !== undefined && x !== "").join(" · ");
    }).catch(() => {});
  };
  holen();
  setInterval(holen, 60_000);
});

// ---------- Statistik (Matomo, nur nach Einwilligung) ----------
// Ohne Matomo-Einstellung auf dem Server: kein Banner, nichts geladen. Mit: einmal fragen, Antwort im lokalen Speicher.
const STATISTIK = "hy_statistik"; // "ja" | "nein"
async function statistikStarten() {
  let cfg = {};
  try {
    cfg = await (await fetch("/api/statistik")).json();
  } catch {
    return;
  }
  if (!cfg.url || !cfg.id) return;
  statistikStarten.cfg = cfg;
  const wahl = speicher(STATISTIK);
  if (wahl === "ja") matomoLaden(cfg);
  else if (wahl !== "nein") statistikBanner();
}
function matomoLaden(cfg) {
  if (window._paq) return;
  const paq = (window._paq = []);
  // nur Seite ohne Parameter zählen: Raumcodes und Einladungs-Token bleiben draußen
  paq.push(["setCustomUrl", location.origin + location.pathname]);
  paq.push(["setReferrerUrl", ""]);
  paq.push(["trackPageView"]);
  paq.push(["enableLinkTracking"]);
  paq.push(["setTrackerUrl", `${cfg.url}/matomo.php`]);
  paq.push(["setSiteId", cfg.id]);
  document.head.append(el("script", { src: `${cfg.url}/matomo.js`, async: true }));
}
function statistikWaehlen(ja) {
  speicher(STATISTIK, ja ? "ja" : "nein");
  $(".statistik-banner")?.remove();
  const stand = $("#statistik-stand");
  if (stand) stand.textContent = ja ? "Du hast der Statistik zugestimmt." : "Du hast die Statistik abgelehnt.";
  if (ja) return statistikStarten.cfg && matomoLaden(statistikStarten.cfg);
  // Widerruf: Matomo-Cookies löschen und ohne Matomo neu laden
  const domains = ["", `; domain=${location.hostname}`, `; domain=.${location.hostname}`];
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (/^_pk_|^mtm_/.test(name)) for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d}`;
  }
  if (window._paq) location.reload();
}
function statistikBanner() {
  if ($(".statistik-banner")) return;
  document.body.append(
    el("div", { class: "statistik-banner", role: "dialog", "aria-label": "Statistik" },
      el("p", {},
        el("b", { text: "Darf HitYear mitzählen?" }), " ",
        el("span", { text: "Mit deiner Zustimmung zählen wir anonym mit Matomo auf unserem eigenen Server, welche Seiten genutzt werden. Dafür setzt Matomo Cookies. Ohne Zustimmung läuft alles genauso." }), " ",
        el("a", { href: "/cookies.html", text: "Mehr erfahren" }),
      ),
      el("div", { class: "statistik-knoepfe" },
        el("button", { type: "button", class: "zweit", text: "Ablehnen", onclick: () => statistikWaehlen(false) }),
        el("button", { type: "button", text: "Zustimmen", onclick: () => statistikWaehlen(true) }),
      ),
    ),
  );
}
document.addEventListener("DOMContentLoaded", () => {
  void statistikStarten();
  // Cookie-Seite: Einwilligung jederzeit ändern
  const knopf = $("#statistik-aendern");
  const stand = $("#statistik-stand");
  if (stand) stand.textContent = speicher(STATISTIK) === "ja" ? "Du hast der Statistik zugestimmt." : speicher(STATISTIK) === "nein" ? "Du hast die Statistik abgelehnt." : "Du hast noch nicht entschieden.";
  if (knopf) knopf.addEventListener("click", () => statistikBanner());
});

// Geräteprotokoll für Darstellungsprobleme (z. B. TV-Browser): einmal pro Seitenaufruf, nur Technik
setTimeout(() => {
  try {
    const css = (x) => (window.CSS && CSS.supports(x) ? "1" : "0");
    const kann = [
      `clamp:${css("width: clamp(1px, 2px, 3px)")}`, `aspect:${css("aspect-ratio: 1")}`, `gap:${css("gap: 1px")}`,
      `inset:${css("inset: 0")}`, `backdrop:${css("backdrop-filter: blur(1px)") || css("-webkit-backdrop-filter: blur(1px)")}`,
      `font:${document.fonts && document.fonts.check ? (document.fonts.check('16px "Nunito"') ? "1" : "0") : "?"}`,
      `wake:${"wakeLock" in navigator ? 1 : 0}`, `audio:${window.AudioContext || window.webkitAudioContext ? 1 : 0}`,
    ].join(" ");
    fetch("/api/geraet", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ seite: location.pathname, groesse: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, kann, ua: navigator.userAgent }),
    }).catch(() => {});
  } catch {
    /* egal */
  }
}, 3000);

// ---------- Fernseher (Querformat ab 3:2): ganze Ansicht ohne Scrollen ----------
// Seiten mit <main data-einpassen> werden per CSS-zoom verkleinert, bis der Inhalt in die Fensterhöhe passt.
// Nicht auf Touch-Geräten (Handy quer) – dort darf gescrollt werden.
document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector("main[data-einpassen]");
  if (!main || !("zoom" in main.style)) return;
  const tv = matchMedia("(min-aspect-ratio: 3/2) and (min-width: 900px) and (not (pointer: coarse))");
  const FUSS = 30; // Fußzeile (Impressum …) unten frei lassen
  let zoom = 1;
  let geplant = 0;
  // Unterkante des Inhalts = Oberkante einer leeren Marke direkt hinter main (im TV-Modus ohne Innenabstand unten,
  // siehe app.css). Die Marke selbst ist nicht gezoomt: Ältere Chromium-Browser (viele Fernseher, vor Chrome 128)
  // liefern für ein gezoomtes Element ungezoomte Maße – dann schrumpfte der Zoom Schritt für Schritt bis 0.35.
  const marke = document.createElement("div");
  marke.setAttribute("aria-hidden", "true");
  main.after(marke);
  const unterkante = () => marke.getBoundingClientRect().top + scrollY;
  const einpassen = () => {
    geplant = 0;
    let ziel = 1;
    main.classList.toggle("tv-ansicht", tv.matches);
    if (tv.matches) {
      const u = unterkante();
      if (!u) return;
      ziel = Math.min(1, Math.max(0.35, (zoom * (innerHeight - FUSS)) / u)); // 0.35: 6 volle Zeitstrahle (20 Karten) auch bei 960×540 CSS-Pixeln
    }
    if (Math.abs(ziel - zoom) < 0.01) return;
    zoom = ziel;
    main.style.zoom = zoom === 1 ? "" : String(zoom);
    // zoom ändert auch die Breite und damit den Umbruch: noch einmal nachmessen
    planen();
  };
  const planen = () => (geplant ||= requestAnimationFrame(einpassen));
  addEventListener("resize", planen);
  tv.addEventListener?.("change", planen);
  new ResizeObserver(planen).observe(main);
  new MutationObserver(planen).observe(main, { childList: true, subtree: true });
  document.fonts?.ready.then(planen);
  planen();
});

// Handys nur hochkant: im Browser lässt sich das Drehen nicht sperren – im Querformat deckt ein Hinweis die Seite ab
// (CSS .drehen-hinweis). Als installierte App klappt die echte Sperre, Tablets und Fernseher bleiben frei.
// Ausnahme: der Host (Spielfeld) darf quer – host.js stellt ihn dann wie auf dem Fernseher dar.
(() => {
  if (location.pathname.startsWith("/host")) return;
  const hinweis = el("div", { class: "drehen-hinweis", "aria-live": "polite" },
    el("div", { class: "drehen-handy", "aria-hidden": "true", text: "📱" }),
    el("p", { text: "Bitte halte dein Handy hochkant." }));
  document.body.append(hinweis);
  const handy = matchMedia("(pointer: coarse) and (max-width: 500px), (pointer: coarse) and (max-height: 500px)");
  if (handy.matches) screen.orientation?.lock?.("portrait").catch(() => {});
})();

// Tasten-Test für Fernseher: ?tasten zeigt Browser-Kennung, Bildschirm und die zuletzt gedrückten Tasten
if (new URLSearchParams(location.search).has("tasten")) {
  const box = el("pre", { class: "tasten-test" });
  const zeilen = [];
  const zeigen = () => {
    box.textContent = `TV-Modus: ${fernseher ? "ja" : "nein"}${tvVonHand ? ` (von Hand: ${tvVonHand})` : ""} · langsam: ${gemessenLangsam ? "ja" : "nein"} · wie TV: ${wieTv ? "ja" : "nein"}\n${navigator.userAgent}\n` +
      `Bildschirm ${screen.width}×${screen.height}, Fenster ${innerWidth}×${innerHeight}, Zeiger ${matchMedia("(pointer: fine)").matches ? "fein" : matchMedia("(pointer: coarse)").matches ? "grob" : "keiner"}\n\n` +
      (zeilen.length ? zeilen.join("\n") : "Noch keine Taste empfangen – bitte Pfeiltasten, OK und Ziffern drücken.");
  };
  // Gedrückte Tasten (nur keydown) gehen auch an den Server, damit sie ohne Foto im Log stehen
  const gemeldet = [];
  let melden = 0;
  const senden = (warum) => fetch("/api/geraet", {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ seite: location.pathname, groesse: `${innerWidth}x${innerHeight}@${devicePixelRatio} screen:${screen.width}x${screen.height} tv:${fernseher ? 1 : 0} langsam:${gemessenLangsam ? 1 : 0}`, kann: warum, ua: navigator.userAgent, tasten: gemeldet.join(" ") }),
  }).catch(() => {});
  for (const art of ["keydown", "keyup"]) {
    addEventListener(art, (ev) => {
      zeilen.unshift(`${art === "keydown" ? "▼" : "▲"} key=${ev.key} code=${ev.code} keyCode=${ev.keyCode}`);
      zeilen.length = Math.min(zeilen.length, 12);
      zeigen();
      if (art !== "keydown") return;
      gemeldet.push(`${ev.key}/${ev.keyCode}`);
      gemeldet.splice(0, Math.max(0, gemeldet.length - 40));
      clearTimeout(melden);
      melden = setTimeout(() => senden("tasten"), 11_000);
    }, true);
  }
  zeigen();
  setTimeout(() => senden("start"), 1500);
  document.body.append(box);
}
