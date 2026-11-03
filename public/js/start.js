"use strict";

// große Wörter der Startkacheln notfalls verkleinern, damit lange Übersetzungen nicht über den Rand laufen
function startTitelEinpassen() {
  for (const g of document.querySelectorAll(".start-gross")) {
    g.style.fontSize = "";
    const platz = g.closest(".start-karte").clientWidth * 0.84;
    const breite = g.getBoundingClientRect().width;
    if (breite > platz) g.style.fontSize = `${26 * platz / breite}cqw`;
  }
}
startTitelEinpassen();
document.fonts?.ready.then(startTitelEinpassen);

(async () => {
  let rolle = await anmeldungPruefen();
  // Einstellungen nur für den Admin; anmelden per Dreifachklick auf die Karten oben
  $("#einstellungen").classList.toggle("versteckt", rolle !== "admin");
  $(".platten").addEventListener("click", (e) => {
    if (e.detail === 3) adminAnmelden();
  });
  function adminAnmelden() {
    if ($("#admin-anmeldung")) return;
    const angemeldet = rolle === "admin";
    const feld = el("input", { type: "password", autocomplete: "current-password", placeholder: "Passwort", "aria-label": "Passwort", required: "" });
    const meldung = el("p", { class: "fehler", role: "alert" });
    const zu = () => huelle.remove();
    // schon Admin → abmelden statt Passwort
    const abmelden = async () => {
      await api("/api/logout", {}).catch(() => {});
      rolle = (await api("/api/ich").catch(() => ({}))).rolle ?? null;
      $("#einstellungen").classList.add("versteckt");
      zu();
    };
    const form = el("form", { class: "zugang-karte box" },
      el("div", { class: "zugang-schloss", "aria-hidden": "true", text: "🔑" }),
      el("h2", { text: "Admin" }),
      angemeldet ? el("p", { class: "leise", text: "Du bist als Admin angemeldet." }) : feld,
      meldung,
      el("div", { class: "reihe" },
        angemeldet ? el("button", { class: "gross", type: "button", text: "Abmelden", onclick: abmelden }) : el("button", { class: "gross", type: "submit", text: "Anmelden" }),
        el("button", { class: "zweit", type: "button", text: "Abbrechen", onclick: zu })),
    );
    const huelle = el("div", { class: "zugang", id: "admin-anmeldung", role: "dialog", "aria-modal": "true", "aria-label": "Admin" }, form);
    huelle.addEventListener("click", (ev) => ev.target === huelle && zu());
    huelle.addEventListener("keydown", (ev) => ev.key === "Escape" && zu());
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      meldung.textContent = "";
      try {
        const { rolle: r } = await api("/api/login", { passwort: feld.value });
        if (r !== "admin") throw new Error("Passwort falsch.");
        rolle = r;
        zu();
        $("#einstellungen").classList.remove("versteckt");
        konfetti(60, $(".platten"));
      } catch (err) {
        meldung.textContent = err.message;
        form.classList.remove("wackeln");
        void form.offsetWidth;
        form.classList.add("wackeln");
        feld.select();
      }
    });
    document.body.append(huelle);
    (angemeldet ? form.querySelector("button") : feld).focus();
  }
  const weiter = new URLSearchParams(location.search).get("weiter");
  // nur auf dieselbe Seite weiter („/\evil.com“ machen Browser sonst zu „//evil.com“)
  if (weiter) {
    const ziel = new URL(weiter, location.origin);
    if (ziel.origin === location.origin) return void (location.href = ziel.pathname + ziel.search + ziel.hash);
  }
  // Vor dem Wechsel prüfen, ob es das Spiel gibt – sonst landet man auf einer leeren Seite
  $("#beitreten-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("#raumcode").value.trim().toUpperCase();
    const meldung = $("#code-fehler");
    meldung.textContent = "";
    if (code.length !== 4) return void (meldung.textContent = "Der Code hat 4 Zeichen – er steht groß auf dem Bildschirm des Gastgebers.");
    const knopf = e.submitter ?? $("#beitreten-form button");
    knopf.disabled = true;
    try {
      const r = await fetch(`/api/raum?code=${encodeURIComponent(code)}`);
      if (r.status === 404) throw new Error(`Kein Spiel mit dem Code ${code} gefunden – vertippt?`);
      if (!r.ok) throw new Error("Gerade nicht erreichbar – bitte gleich nochmal.");
      // „voll“ oder „vorbei“ entscheidet die Spielerseite – wer schon dabei war, kommt so wieder hinein
      const { code: echt } = await r.json();
      location.href = "/spielen.html?raum=" + encodeURIComponent(echt || code);
    } catch (err) {
      meldung.textContent = err.message;
      $("#raumcode").select();
      vibrieren(60);
    } finally {
      knopf.disabled = false;
    }
  });
  $("#raumcode").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    $("#code-fehler").textContent = "";
  });

})();

// ---------- Sprachumschalter (nur hier auf der Startseite) ----------
(() => {
  const FLAGGEN = {
    de: '<rect width="30" height="10" fill="#000"/><rect y="10" width="30" height="10" fill="#dd0000"/><rect y="20" width="30" height="10" fill="#ffce00"/>',
    en: '<rect width="30" height="30" fill="#012169"/><path d="M0 0L30 30M30 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0L30 30M30 0L0 30" stroke="#c8102e" stroke-width="2"/><path d="M15 0V30M0 15H30" stroke="#fff" stroke-width="10"/><path d="M15 0V30M0 15H30" stroke="#c8102e" stroke-width="6"/>',
    fr: '<rect width="10" height="30" fill="#0055a4"/><rect x="10" width="10" height="30" fill="#fff"/><rect x="20" width="10" height="30" fill="#ef4135"/>',
    it: '<rect width="10" height="30" fill="#009246"/><rect x="10" width="10" height="30" fill="#fff"/><rect x="20" width="10" height="30" fill="#ce2b37"/>',
    es: '<rect width="30" height="30" fill="#aa151b"/><rect y="7.5" width="30" height="15" fill="#f1bf00"/>',
    "pt-BR": '<rect width="30" height="30" fill="#009c3b"/><path d="M15 4L28 15L15 26L2 15Z" fill="#ffdf00"/><circle cx="15" cy="15" r="6.5" fill="#002776"/><path d="M8.7 13.6Q15 12 21.4 16" stroke="#fff" stroke-width="1.3" fill="none"/>',
  };
  const flagge = (code) => {
    const s = el("span", { class: "flagge", "aria-hidden": "true" });
    s.innerHTML = `<svg viewBox="0 0 30 30">${FLAGGEN[code]}</svg>`;
    return s;
  };
  const liste = el("div", { class: "sprache-liste", role: "radiogroup", "aria-label": "Sprache wählen", hidden: true },
    ...SPRACHEN.map((s) => el("button", {
      type: "button", role: "radio", lang: s.code, "aria-checked": String(s.code === SPRACHE),
      onclick: () => (s.code === SPRACHE ? zu() : spracheSetzen(s.code)),
    }, flagge(s.code), s.name)));
  const knopf = el("button", { type: "button", class: "sprache-knopf", "aria-haspopup": "true", "aria-expanded": "false", title: "Sprache wählen", "aria-label": "Sprache wählen" }, flagge(SPRACHE));
  const zu = () => {
    liste.hidden = true;
    knopf.setAttribute("aria-expanded", "false");
  };
  knopf.addEventListener("click", (e) => {
    e.stopPropagation();
    liste.hidden = !liste.hidden;
    knopf.setAttribute("aria-expanded", String(!liste.hidden));
    if (!liste.hidden) liste.querySelector('[aria-checked="true"]')?.focus();
  });
  document.addEventListener("click", (e) => !liste.contains(e.target) && zu());
  document.addEventListener("keydown", (e) => e.key === "Escape" && zu());
  $(".marke").append(el("div", { class: "sprache" }, knopf, liste));
})();

// Zeitstrahl zum Zuschauen: Fünf zufällige Jahre echter Songs (generisches Cover, ohne Titel) fliegen nacheinander zwischen die
// Jahrzehnt-Karten und reihen sich nach Jahr ein – wie beim Einsortieren im Spiel. Damit alles in die Reihe passt,
// werden alle Karten schmaler (--b). Danach räumen sich die Cover weg und eine neue Runde beginnt.
// Bewegt werden nur transform/opacity und die Breite weniger Elemente, damit es auch auf Handys billig bleibt.
(async () => {
  const reihe = document.querySelector(".held .platten");
  if (!reihe || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let songs = [];
  try {
    songs = await (await fetch("/api/schaufenster")).json();
  } catch {
    return;
  }
  if (!Array.isArray(songs) || !songs.length) return;
  const ANZAHL = 5;
  const karten = [...reihe.children];
  // Farbe und Takt der Karten hängen per :nth-child an der Position – vor dem Einfügen festhalten
  for (const k of karten) {
    const st = getComputedStyle(k);
    k.style.background = st.backgroundColor;
    k.style.animationDelay = st.animationDelay;
  }
  // unsichtbarer Anker am Ende der Reihe (früher die Titelzeile)
  const zeile = el("span", { class: "flug-titel", "aria-hidden": "true" });
  reihe.append(zeile);
  const warten = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const sichtbar = () => new Promise((ok) => (document.hidden ? document.addEventListener("visibilitychange", ok, { once: true }) : ok()));
  const handy = matchMedia("(max-width: 760px)");
  // Kartenbreite so wählen, dass n Elemente in die Reihe passen
  const breite = (n) => {
    const luecke = parseFloat(getComputedStyle(reihe).columnGap) || 8;
    const voll = Math.min(54, innerWidth * 0.09);
    // Handy: Karten behalten ihre Größe, die Reihe wächst links und rechts aus dem Bildschirm
    // (dort doppelt so groß wie die Desktop-Formel, sonst sind die Cover winzig)
    if (handy.matches) return reihe.style.setProperty("--b", `${Math.min(84, innerWidth * 0.18)}px`);
    reihe.style.setProperty("--b", `${Math.max(18, Math.min(voll, (reihe.clientWidth - luecke * (n - 1)) / n))}px`);
  };
  reihe.classList.add("mit-covern");
  breite(karten.length);
  // Generisches Cover statt echter Plattenhülle: nichts wird bei Apple/Deezer geladen, bevor jemand spielt.
  // Farbe nach Jahr, dazu eines von vier Mustern (Platte, Streifen, Sonne, Punkte).
  const MUSTER = ["platte", "streifen", "sonne", "punkte"];
  const coverMalen = (song, nr) => new Promise((ok) => {
    const g = 160;
    const c = document.createElement("canvas");
    c.width = c.height = g;
    const x = c.getContext("2d");
    if (!x) return ok(null);
    const h = farbton(song.jahr);
    const verlauf = x.createLinearGradient(0, 0, g, g);
    verlauf.addColorStop(0, `hsl(${h} 90% 60%)`);
    verlauf.addColorStop(1, `hsl(${h + 60} 85% 42%)`);
    x.fillStyle = verlauf;
    x.fillRect(0, 0, g, g);
    x.fillStyle = x.strokeStyle = "rgba(255, 255, 255, 0.28)";
    const muster = MUSTER[(song.jahr + nr) % MUSTER.length];
    if (muster === "platte") {
      x.fillStyle = "#160c26";
      x.beginPath(); x.arc(g / 2, g / 2, g * 0.4, 0, 7); x.fill();
      x.strokeStyle = "rgba(255, 255, 255, 0.14)"; x.lineWidth = 2;
      for (const r of [0.33, 0.27, 0.21]) { x.beginPath(); x.arc(g / 2, g / 2, g * r, 0, 7); x.stroke(); }
      x.fillStyle = `hsl(${h + 30} 95% 62%)`;
      x.beginPath(); x.arc(g / 2, g / 2, g * 0.13, 0, 7); x.fill();
      x.fillStyle = "#160c26";
      x.beginPath(); x.arc(g / 2, g / 2, g * 0.025, 0, 7); x.fill();
    } else if (muster === "streifen") {
      for (let i = 0; i < 5; i++) x.fillRect(0, g * (0.12 + i * 0.17), g, g * 0.07);
    } else if (muster === "sonne") {
      x.beginPath(); x.arc(g / 2, g * 0.62, g * 0.3, 0, 7); x.fill();
      x.fillStyle = "rgba(22, 12, 38, 0.35)";
      for (let i = 0; i < 4; i++) x.fillRect(0, g * (0.6 + i * 0.09), g, g * 0.035);
    } else {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(g * (0.17 + i * 0.22), g * (0.17 + j * 0.22), g * 0.06, 0, 7); x.fill(); }
    }
    // Note als Wiedererkennung
    x.fillStyle = "rgba(255, 255, 255, 0.92)";
    x.font = `900 ${g * 0.22}px system-ui, sans-serif`;
    x.textAlign = "right";
    x.textBaseline = "top";
    if (muster !== "platte") x.fillText("♪", g * 0.92, g * 0.06);
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = c.toDataURL("image/png");
  });
  const einordnen = async (song, nr) => {
    const img = await coverMalen(song, nr);
    if (!img) return false;
    img.alt = "";
    const d = Math.min(karten.length - 1, Math.max(0, Math.floor((song.jahr - 1950) / 10)));
    // hinter die Jahrzehnt-Karte, zwischen schon einsortierte Cover desselben Jahrzehnts nach Jahr
    let vor = karten[d + 1] ?? zeile;
    for (let e = karten[d].nextElementSibling; e && e !== karten[d + 1] && e !== zeile; e = e.nextElementSibling) {
      if (Number(e.dataset.jahr) > song.jahr) {
        vor = e;
        break;
      }
    }
    const cover = el("span", { class: "flug-cover", "aria-hidden": "true", "data-jahr": String(song.jahr) }, img, el("b", { text: String(song.jahr) }));
    breite(karten.length + nr);
    reihe.insertBefore(cover, vor);
    requestAnimationFrame(() => cover.classList.add("offen"));
    const seite = Math.random() < 0.5 ? -1 : 1;
    await img.animate(
      [
        { transform: `translate(${seite * 200}px, -160px) rotate(${seite * 40}deg) scale(0.4)`, opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: "translate(0, 5px) rotate(-4deg) scale(1.1)", offset: 0.8 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 1000, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    ).finished;
    return true;
  };
  // Runde beenden: Cover verblassen, ihre Lücken schließen sich, die Karten werden wieder breiter
  const aufraeumen = async () => {
    const cover = [...reihe.querySelectorAll(".flug-cover")];
    await Promise.all(cover.map((c) => c.firstChild.animate([{ opacity: 1 }, { transform: "translateY(-30px) scale(0.5)", opacity: 0 }], { duration: 500, easing: "ease-in", fill: "forwards" }).finished));
    for (const c of cover) c.classList.remove("offen");
    breite(karten.length);
    await warten(550);
    for (const c of cover) c.remove();
  };
  await warten(1200);
  for (;;) {
    let nr = 0;
    for (const song of [...songs].sort(() => Math.random() - 0.5)) {
      if (nr >= ANZAHL) break;
      await sichtbar();
      if (await einordnen(song, nr + 1)) nr++;
      await warten(1600);
    }
    if (!nr) return;
    await warten(2500);
    await sichtbar();
    await aufraeumen();
    await warten(800);
  }
})();
