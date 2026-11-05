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
    if (code.length !== 4) {
      meldung.textContent = code ? "Der Code hat 4 Zeichen – er steht groß auf dem Bildschirm des Gastgebers." : "Bitte zuerst den Code eingeben.";
      const form = e.currentTarget;
      form.classList.remove("wackeln");
      void form.offsetWidth;
      form.classList.add("wackeln");
      return void $("#raumcode").focus();
    }
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
  // Spielcodes sind lateinisch (A–Z, Ziffern). Mit kyrillischer, griechischer, japanischer, arabischer … Tastatur kämen sonst
  // gar keine Zeichen an: gleich aussehende Buchstaben werden zum lateinischen Gegenstück, Vollbreiten-Zeichen (Japanisch) und
  // arabisch-indische Ziffern zu normalen. Bleibt etwas übrig, das sich nicht lesen lässt, gibt es den Hinweis zum Umschalten.
  const GLEICH = {
    А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X", Ѕ: "S", І: "I", Ј: "J", Ү: "Y",
    Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
  };
  const codeLatein = (s) => s.normalize("NFKC").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xF))
    .replace(/./gu, (z) => GLEICH[z] ?? z);
  $("#raumcode").addEventListener("input", (e) => {
    const lesbar = codeLatein(e.target.value);
    const sauber = lesbar.replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const fremd = /[^\sA-Z0-9]/u.test(lesbar.replace(/[\p{P}\p{S}]/gu, ""));
    if (e.target.value !== sauber) e.target.value = sauber;
    $("#code-fehler").textContent = fremd ? "Der Code hat nur lateinische Buchstaben (A–Z) und Ziffern – bitte die Tastatur umschalten 🌐" : "";
  });

})();

// ---------- Sprachumschalter (nur hier auf der Startseite) ----------
(() => {
  // vereinfachte runde Flaggen (viewBox 30×30); Arabisch: Schriftzeichen statt einer Landesflagge
  const FLAGGEN = {
    de: '<rect y="0.00" width="30" height="10.10" fill="#000"/><rect y="10.00" width="30" height="10.10" fill="#dd0000"/><rect y="20.00" width="30" height="10.10" fill="#ffce00"/>',
    en: '<rect width="30" height="30" fill="#012169"/><path d="M0 0L30 30M30 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0L30 30M30 0L0 30" stroke="#c8102e" stroke-width="2"/><path d="M15 0V30M0 15H30" stroke="#fff" stroke-width="10"/><path d="M15 0V30M0 15H30" stroke="#c8102e" stroke-width="6"/>',
    fr: '<rect x="0.00" width="10.10" height="30" fill="#0055a4"/><rect x="10.00" width="10.10" height="30" fill="#fff"/><rect x="20.00" width="10.10" height="30" fill="#ef4135"/>',
    it: '<rect x="0.00" width="10.10" height="30" fill="#009246"/><rect x="10.00" width="10.10" height="30" fill="#fff"/><rect x="20.00" width="10.10" height="30" fill="#ce2b37"/>',
    es: '<rect width="30" height="30" fill="#aa151b"/><rect y="7.5" width="30" height="15" fill="#f1bf00"/>',
    "pt-BR": '<rect width="30" height="30" fill="#009c3b"/><path d="M15 4L28 15L15 26L2 15Z" fill="#ffdf00"/><circle cx="15" cy="15" r="6.5" fill="#002776"/><path d="M8.7 13.6Q15 12 21.4 16" stroke="#fff" stroke-width="1.3" fill="none"/>',
    "pt-PT": '<rect width="12" height="30" fill="#046a38"/><rect x="12" width="18" height="30" fill="#da291c"/><circle cx="12" cy="15" r="5.5" fill="#ffe900"/><rect x="9.5" y="12" width="5" height="6.5" rx="1.5" fill="#da291c" stroke="#fff" stroke-width="0.8"/>',
    nl: '<rect y="0.00" width="30" height="10.10" fill="#ae1c28"/><rect y="10.00" width="30" height="10.10" fill="#fff"/><rect y="20.00" width="30" height="10.10" fill="#21468b"/>',
    pl: '<rect y="0.00" width="30" height="15.10" fill="#fff"/><rect y="15.00" width="30" height="15.10" fill="#dc143c"/>',
    tr: '<rect width="30" height="30" fill="#e30a17"/><circle cx="12.5" cy="15" r="7" fill="#fff"/><circle cx="14.3" cy="15" r="5.6" fill="#e30a17"/><path d="M19.2 15l4.6-1.5-2.8 3.9V12.6l2.8 3.9z" fill="#fff"/>',
    ru: '<rect y="0.00" width="30" height="10.10" fill="#fff"/><rect y="10.00" width="30" height="10.10" fill="#0039a6"/><rect y="20.00" width="30" height="10.10" fill="#d52b1e"/>',
    uk: '<rect y="0.00" width="30" height="15.10" fill="#0057b7"/><rect y="15.00" width="30" height="15.10" fill="#ffd700"/>',
    sv: '<rect width="30" height="30" fill="#006aa7"/><rect x="9" width="5" height="30" fill="#fecc00"/><rect y="12.5" width="30" height="5" fill="#fecc00"/>',
    nb: '<rect width="30" height="30" fill="#ba0c2f"/><rect x="8" width="7" height="30" fill="#fff"/><rect y="11.5" width="30" height="7" fill="#fff"/><rect x="10" width="3" height="30" fill="#00205b"/><rect y="13.5" width="30" height="3" fill="#00205b"/>',
    da: '<rect width="30" height="30" fill="#c8102e"/><rect x="9" width="5" height="30" fill="#fff"/><rect y="12.5" width="30" height="5" fill="#fff"/>',
    fi: '<rect width="30" height="30" fill="#fff"/><rect x="9" width="5" height="30" fill="#002f6c"/><rect y="12.5" width="30" height="5" fill="#002f6c"/>',
    cs: '<rect y="0.00" width="30" height="15.10" fill="#fff"/><rect y="15.00" width="30" height="15.10" fill="#d7141a"/><path d="M0 0L15 15L0 30Z" fill="#11457e"/>',
    sk: '<rect y="0.00" width="30" height="10.10" fill="#fff"/><rect y="10.00" width="30" height="10.10" fill="#0b4ea2"/><rect y="20.00" width="30" height="10.10" fill="#ee1c25"/><rect x="6" y="9" width="8" height="11" rx="2" fill="#ee1c25" stroke="#fff" stroke-width="1"/><rect x="9.25" y="11" width="1.5" height="7" fill="#fff"/><rect x="7.5" y="13" width="5" height="1.5" fill="#fff"/>',
    hu: '<rect y="0.00" width="30" height="10.10" fill="#ce2939"/><rect y="10.00" width="30" height="10.10" fill="#fff"/><rect y="20.00" width="30" height="10.10" fill="#477050"/>',
    ro: '<rect x="0.00" width="10.10" height="30" fill="#002b7f"/><rect x="10.00" width="10.10" height="30" fill="#fcd116"/><rect x="20.00" width="10.10" height="30" fill="#ce1126"/>',
    bg: '<rect y="0.00" width="30" height="10.10" fill="#fff"/><rect y="10.00" width="30" height="10.10" fill="#00966e"/><rect y="20.00" width="30" height="10.10" fill="#d62612"/>',
    el: '<rect width="30" height="30" fill="#0d5eaf"/><rect y="3.33" width="30" height="3.34" fill="#fff"/><rect y="10.00" width="30" height="3.34" fill="#fff"/><rect y="16.67" width="30" height="3.34" fill="#fff"/><rect y="23.33" width="30" height="3.34" fill="#fff"/><rect width="16.7" height="16.7" fill="#0d5eaf"/><rect x="6.7" width="3.3" height="16.7" fill="#fff"/><rect y="6.7" width="16.7" height="3.3" fill="#fff"/>',
    hr: '<rect y="0.00" width="30" height="10.10" fill="#ff0000"/><rect y="10.00" width="30" height="10.10" fill="#fff"/><rect y="20.00" width="30" height="10.10" fill="#171796"/><rect x="11" y="9" width="8" height="10" fill="#fff" stroke="#ff0000" stroke-width="0.6"/><rect x="11" y="9" width="2" height="2" fill="#ff0000"/><rect x="15" y="9" width="2" height="2" fill="#ff0000"/><rect x="13" y="11" width="2" height="2" fill="#ff0000"/><rect x="17" y="11" width="2" height="2" fill="#ff0000"/><rect x="11" y="13" width="2" height="2" fill="#ff0000"/><rect x="15" y="13" width="2" height="2" fill="#ff0000"/><rect x="13" y="15" width="2" height="2" fill="#ff0000"/><rect x="17" y="15" width="2" height="2" fill="#ff0000"/><rect x="11" y="17" width="2" height="2" fill="#ff0000"/><rect x="15" y="17" width="2" height="2" fill="#ff0000"/>',
    sr: '<rect y="0.00" width="30" height="10.10" fill="#c6363c"/><rect y="10.00" width="30" height="10.10" fill="#0c4076"/><rect y="20.00" width="30" height="10.10" fill="#fff"/><rect x="7" y="9" width="8" height="11" rx="2" fill="#c6363c" stroke="#fff" stroke-width="1"/><rect x="10.25" y="11" width="1.5" height="7" fill="#fff"/><rect x="8.5" y="13" width="5" height="1.5" fill="#fff"/>',
    sq: '<rect width="30" height="30" fill="#e41e20"/><path d="M15 7l2.6 3.6 4.4-2.2-1.8 4.8 3.4 2.6-4.2 1.2-.6 4.6-3.8-2.8-3.8 2.8-.6-4.6-4.2-1.2 3.4-2.6-1.8-4.8 4.4 2.2z" fill="#000"/>',
    ca: '<rect width="30" height="30" fill="#fcdd09"/><rect y="3.33" width="30" height="3.34" fill="#da121a"/><rect y="10.00" width="30" height="3.34" fill="#da121a"/><rect y="16.67" width="30" height="3.34" fill="#da121a"/><rect y="23.33" width="30" height="3.34" fill="#da121a"/>',
    ja: '<rect width="30" height="30" fill="#fff"/><circle cx="15" cy="15" r="7.5" fill="#bc002d"/>',
    he: '<rect width="30" height="30" fill="#fff"/><rect y="4" width="30" height="3.5" fill="#0038b8"/><rect y="22.5" width="30" height="3.5" fill="#0038b8"/><path d="M15 9.6l4.7 8.1h-9.4z M15 20.4l-4.7-8.1h9.4z" fill="none" stroke="#0038b8" stroke-width="1.3"/>',
    ar: '<rect width="30" height="30" fill="#007a3d"/><text x="15" y="20.5" font-size="15" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">ع</text>',
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
  // ▼ blättert um die sichtbaren 8 Sprachen weiter, am Ende zurück nach oben (Maus, Touch, Zifferntaste 9)
  const mehr = el("button", { type: "button", class: "sprache-mehr", tabindex: "-1", "aria-hidden": "true", text: "▼" });
  mehr.addEventListener("click", (e) => {
    e.stopPropagation();
    const amEnde = liste.scrollTop + liste.clientHeight >= liste.scrollHeight - 4;
    liste.scrollTo({ top: amEnde ? 0 : liste.scrollTop + liste.clientHeight - 40, behavior: "smooth" });
  });
  // ▲ oben: erscheint, sobald gescrollt ist, und blättert zurück
  const hoch = el("button", { type: "button", class: "sprache-mehr sprache-hoch", tabindex: "-1", "aria-hidden": "true", text: "▲", hidden: true });
  hoch.addEventListener("click", (e) => {
    e.stopPropagation();
    const ziel = liste.scrollTop - liste.clientHeight + 40;
    liste.scrollTo({ top: ziel < 60 ? 0 : ziel, behavior: "smooth" }); // kurz vor oben: ganz nach oben, dann schließt 0 wieder
  });
  liste.addEventListener("scroll", () => {
    mehr.textContent = liste.scrollTop + liste.clientHeight >= liste.scrollHeight - 4 ? "▲" : "▼";
    hoch.hidden = liste.scrollTop < 12;
  }, { passive: true });
  liste.prepend(hoch);
  liste.append(mehr);
  const knopf = el("button", { type: "button", class: "sprache-knopf", "aria-haspopup": "true", "aria-expanded": "false", title: "Sprache wählen", "aria-label": "Sprache wählen" }, flagge(SPRACHE));
  const zu = () => {
    // Fokus stand im Menü (Fernbedienung/Tastatur): zurück auf die Flagge, sonst wäre er weg
    if (!liste.hidden && liste.contains(document.activeElement)) knopf.focus({ focusVisible: true });
    liste.hidden = true;
    knopf.setAttribute("aria-expanded", "false");
  };
  knopf.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!liste.hidden) return zu();
    liste.hidden = false;
    knopf.setAttribute("aria-expanded", "true");
    liste.querySelector('[aria-checked="true"]')?.focus({ focusVisible: true });
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
  // Sparmodus (TV, alte Geräte): die Reihe bleibt stehen – fliegende Cover kosten dort zu viel Rechenzeit
  if (!reihe || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("sparsam")) return;
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
