"use strict";

// Dateien, die auf die Seite gezogen werden, nie im Browser öffnen/abspielen –
// gilt sofort beim Laden, noch vor der Anmeldung.
for (const typ of ["dragover", "drop"]) window.addEventListener(typ, (e) => e.preventDefault());

// Zwei Bereiche: „Decks“ und „Musik & Songs prüfen“ (per #decks / #musik, Standard Decks)
function bereichZeigen() {
  const b = location.hash === "#musik" ? "musik" : "decks";
  for (const x of document.querySelectorAll("[data-bereich]")) x.classList.toggle("versteckt", x.dataset.bereich !== b);
  for (const a of document.querySelectorAll("[data-reiter]")) a.setAttribute("aria-current", String(a.dataset.reiter === b));
}
window.addEventListener("hashchange", bereichZeigen);
document.addEventListener("DOMContentLoaded", bereichZeigen);
bereichZeigen();

(async () => {
  // nur der Admin (Dreifachklick auf die Karten der Startseite) – sonst zurück zum Start
  if ((await anmeldungPruefen()) !== "admin") return void location.replace("/");
  $("#abmelden").addEventListener("click", async (e) => {
    e.preventDefault();
    await api("/api/logout", {}).catch(() => {});
    location.href = "/";
  });
  const fehler = (t) => ($("#fehler").textContent = t || "");

  async function status() {
    try {
      const s = await api("/api/admin/status");
      const b = s.bibliothek;
      $("#stand").textContent = `${b.songs} Dateien · ${b.mitJahr} spielbar · ${b.pruefen} in der Prüfliste · ${b.chartHits} Chart-Hits · Ordner ${s.musikOrdner}`;
      let text = "";
      let wert = null;
      if (s.scan.laeuft) {
        text = `Einlesen läuft: ${s.scan.verarbeitet}/${s.scan.gefunden} …`;
        wert = s.scan.gefunden ? s.scan.verarbeitet / s.scan.gefunden : 0;
      } else if (s.scan.beendet) {
        text = `Zuletzt eingelesen: ${new Date(s.scan.beendet).toLocaleString("de-DE")} – ${s.scan.neu} neu, ${s.scan.entfernt} entfernt, ${s.scan.fehler} Fehler.`;
      }
      if (s.apple?.laeuft) {
        text = `Online-Vorschauen für „${s.apple.deck}“: ${s.apple.erledigt}/${s.apple.offen} · ${s.apple.neu} neu · ${s.apple.ohneTreffer} ohne Treffer …`;
        wert = s.apple.offen ? s.apple.erledigt / s.apple.offen : 0;
      } else if (s.apple?.offen) {
        text += ` Online-Vorschauen für „${s.apple.deck}“: ${s.apple.neu} neu${s.apple.deezer ? ` (davon ${s.apple.deezer} von Deezer)` : ""}, ${s.apple.ohneTreffer} ohne Treffer, ${s.apple.fehler} Fehler.`;
        if (s.apple.letzterFehler) text += ` Letzter Fehler: ${s.apple.letzterFehler}`;
      }
      $("#fortschritt").textContent = text;
      $("#balken").classList.toggle("versteckt", wert === null);
      if (wert !== null) $("#balken").value = wert;
      $("#scan").disabled = s.scan.laeuft;
      appleLaeuft = Boolean(s.apple?.laeuft);
      $("#fehlend-apple").disabled = appleLaeuft;
      for (const k of document.querySelectorAll(".apple-holen")) k.disabled = appleLaeuft;
      return s.scan.laeuft || Boolean(s.apple?.laeuft);
    } catch (err) {
      fehler(err.message);
      return false;
    }
  }

  let laeuft = false;
  let runden = 0;
  async function abfragen() {
    const aktiv = await status();
    if (aktiv) {
      laeuft = true;
      // während Apple-Vorschauen geholt werden: offene Deckliste alle ~6 s auffrischen (neue werden grün)
      if (offenesFehlend && ++runden % 3 === 0) fehlend(offenesFehlend, false);
      setTimeout(abfragen, 2000);
    } else if (laeuft) {
      laeuft = false;
      liste();
      listen();
      if (offenesFehlend) fehlend(offenesFehlend, false);
    }
  }

  async function speichern(id, daten) {
    fehler("");
    try {
      await api(`/api/admin/songs/${id}`, daten);
      await liste();
      status();
    } catch (err) {
      fehler(err.message);
    }
  }

  async function liste() {
    const q = new URLSearchParams({ filter: $("#filter").value, q: $("#suche").value });
    const songs = await api(`/api/admin/songs?${q}`);
    $("#liste").replaceChildren(
      ...(songs.length
        ? songs.map((s) => {
            const eingabe = el("input", { type: "number", min: 1900, max: 2100, value: s.manuell_jahr ?? "", placeholder: s.jahr ?? "—", "aria-label": "Jahr" });
            eingabe.addEventListener("change", () => speichern(s.id, { manuellJahr: eingabe.value }));
            return el(
              "tr",
              {},
              el("td", {}, el("strong", { text: s.titel_anzeige }), el("br"), el("span", { class: "leise", text: s.interpret }), el("br"), el("span", { class: "leise klein", text: s.pfad })),
              el("td", { text: s.tag_jahr ?? "—" }),
              el("td", { text: s.mb_geprueft ? s.mb_jahr ?? "kein Treffer" : "…" }),
              el("td", { text: s.chart_jahr ? `${s.chart_jahr} (#${s.chart_platz})` : "—" }),
              el("td", {}, eingabe, el("div", { class: "leise klein", text: s.jahr ? `${s.jahr} · ${s.jahr_quelle}` : "" })),
              el("td", { class: "klein", text: s.pruef_grund ?? "" }),
              el(
                "td",
                {},
                s.jahr && !s.manuell_jahr ? el("button", { class: "zweit", text: "Passt", onclick: () => speichern(s.id, { bestaetigen: true }) }) : null,
                " ",
                el("button", {
                  class: "zweit",
                  text: s.ausgeschlossen ? "Wieder rein" : "Ausschließen",
                  onclick: () => speichern(s.id, { ausgeschlossen: !s.ausgeschlossen }),
                }),
                el("div", { class: "tabelle-deck" }, ...deckAuswahl(s.id)),
              ),
            );
          })
        : [el("tr", {}, el("td", { colspan: 7, class: "leise", text: "Keine Einträge." }))]),
    );
  }

  $("#scan").addEventListener("click", async () => {
    await api("/api/admin/scan", {});
    abfragen();
  });
  $("#filter").addEventListener("change", liste);
  let t;
  $("#suche").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(liste, 300);
  });

  // ---------- Decks ----------
  const ART = { datei: "Liste", katalog: "Songliste", playlist: "Playlist", eigen: "eigenes Deck" };
  const AUDIO = { apple: "30-s-Vorschau (Apple oder Deezer)", dateien: "Eigene Songs" };
  let offenesFehlend = null;
  let appleLaeuft = false;

  function audioWahl(l) {
    const wahl = el("select", {
      "aria-label": `Musik für ${l.name}`,
      onchange: async () => {
        fehler("");
        try {
          await api(`/api/admin/listen/${l.id}/audio`, { audio: wahl.value });
          await listen();
          if (offenesFehlend?.id === l.id) fehlend(decks.find((d) => d.id === l.id) ?? l, false);
        } catch (err) {
          fehler(err.message);
        }
      },
    }, ...Object.entries(AUDIO).map(([wert, text]) => el("option", { value: wert, text, selected: wert === l.audio })));
    return wahl;
  }
  let decks = [];
  let offenesDeck = null;
  let geladen = false;

  async function listen() {
    const vorher = decks.filter((d) => d.quelle === "eigen").map((d) => d.id).join();
    decks = await api("/api/admin/listen");
    // neue/gelöschte eigene Decks → Auswahl „Ins Deck“ in Tabelle und Karten auffrischen
    if (vorher !== decks.filter((d) => d.quelle === "eigen").map((d) => d.id).join() && geladen) liste();
    $("#listen").replaceChildren(
      ...(decks.length
        ? decks.map((l) => {
            const quote = l.gesamt ? Math.round((100 * l.treffer) / l.gesamt) : 0;
            const balken = el("i");
            balken.style.width = `${quote}%`;
            return el(
              "tr",
              {},
              el("td", {}, el("strong", { text: l.name }), el("span", { class: "art-chip", text: ART[l.quelle] ?? l.quelle })),
              el("td", {}, audioWahl(l)),
              el("td", {}, `${l.treffer} / ${l.gesamt} (${quote} %)`, el("div", { class: "fortschritt" }, balken)),
              el(
                "td",
                {},
                l.quelle === "eigen"
                  ? el("button", { class: "zweit", text: "Songs bearbeiten", onclick: () => editorOeffnen(l.id) })
                  : el("button", { class: "zweit", text: "Songs zeigen", onclick: () => fehlend(l) }),
                " ",
                l.audio !== "dateien" && l.treffer < l.gesamt
                  ? el("button", { class: "zweit apple-holen", text: "Fehlende online laden", disabled: appleLaeuft, onclick: () => appleHolen(l) })
                  : null,
                " ",
                l.quelle !== "datei"
                  ? zweiterKlick(
                      el("button", { class: "gefahr", text: "Löschen", title: "Die Songs selbst bleiben in der Bibliothek." }),
                      "Wirklich löschen?",
                      async () => {
                        await api(`/api/admin/decks/${l.id}/loeschen`, {});
                        if (offenesDeck === l.id) editorSchliessen();
                        listen();
                        katalog();
                      },
                    )
                  : null,
              ),
            );
          })
        : [el("tr", {}, el("td", { colspan: 4, class: "leise", text: "Noch keine Decks." }))]),
    );
  }
  async function fehlend(l, hinscrollen = true) {
    const alle = await api(`/api/admin/listen/${l.id}/songs`);
    const fehlen = alle.filter((e) => !e.songId).length;
    offenesFehlend = l;
    $("#fehlend").classList.remove("versteckt");
    $("#fehlend-titel").textContent = `${l.name}: ${alle.length - fehlen} vorhanden, ${fehlen} fehlen · Quelle: ${AUDIO[l.audio] ?? l.audio}`;
    $("#fehlend-apple").classList.toggle("versteckt", l.audio === "dateien" || !fehlen);
    const HERKUNFT = { datei: "✓ eigener Song", apple: "✓ Apple Music", deezer: "✓ Deezer" };
    $("#fehlend-liste").replaceChildren(
      ...alle.map((e) =>
        el("tr", { class: e.songId ? "vorhanden" : "fehlt" },
          el("td", { text: e.interpret }),
          el("td", { text: e.titel }),
          el("td", { text: e.jahr ?? "—" }),
          el("td", { class: "status", text: e.songId ? HERKUNFT[e.quelle] : "fehlt" }),
        ),
      ),
    );
    if (hinscrollen) $("#fehlend").scrollIntoView({ behavior: "smooth" });
  }
  // fehlende Songs eines Decks im Hintergrund als Apple-Vorschau holen (Liste öffnet sich und wird live grün)
  async function appleHolen(l) {
    fehler("");
    try {
      await fehlend(l); // Liste gleich zeigen – sie wird während der Suche live grün
      await api(`/api/admin/listen/${l.id}/apple-ergaenzen`, {});
      appleLaeuft = true;
      for (const k of document.querySelectorAll(".apple-holen")) k.disabled = true;
      abfragen();
    } catch (err) {
      fehler(err.message);
    }
  }
  $("#fehlend-apple").addEventListener("click", () => offenesFehlend && appleHolen(offenesFehlend));

  $("#playlist-neu").addEventListener("submit", async (e) => {
    e.preventDefault();
    fehler("");
    const link = $("#playlist-link").value.trim();
    if (!link) return;
    const knopf = e.submitter ?? $("#playlist-neu button");
    knopf.disabled = true;
    knopf.textContent = "Lädt …";
    try {
      const r = await api("/api/admin/decks/playlist", { link });
      $("#playlist-link").value = "";
      await listen();
      const neu = decks.find((d) => d.id === r.id);
      if (neu) fehlend(neu);
    } catch (err) {
      fehler(err.message);
    } finally {
      knopf.disabled = false;
      knopf.textContent = "Playlist als Deck hinzufügen";
    }
  });
  $("#deck-neu").addEventListener("submit", async (e) => {
    e.preventDefault();
    fehler("");
    const name = $("#deck-name").value.trim();
    if (!name) return;
    try {
      const r = await api("/api/admin/decks", { name });
      $("#deck-name").value = "";
      await listen();
      editorOeffnen(r.id);
    } catch (err) {
      fehler(err.message);
    }
  });

  // Editor für eigene Decks
  let bibliothekTreffer = [];
  async function editorOeffnen(id) {
    offenesDeck = id;
    $("#fehlend").classList.add("versteckt");
    $("#deck-editor").classList.remove("versteckt");
    await editorLaden();
    bibliothekSuchen();
    $("#deck-editor").scrollIntoView({ behavior: "smooth" });
  }
  function editorSchliessen() {
    offenesDeck = null;
    $("#deck-editor").classList.add("versteckt");
  }
  let imDeck = new Set();
  async function editorLaden() {
    const d = await api(`/api/admin/decks/${offenesDeck}`);
    $("#editor-name").value = d.name;
    $("#editor-titel").textContent = `${d.name}: ${d.eintraege.length} Songs`;
    imDeck = new Set(d.eintraege.map((e) => e.songId).filter(Boolean));
    $("#editor-im-deck").replaceChildren(
      ...(d.eintraege.length
        ? d.eintraege.map((e) =>
            el(
              "li",
              {},
              el("span", {}, el("strong", { text: e.titel }), " · ", e.interpret, el("span", { class: "leise", text: e.jahr ? ` · ${e.jahr}` : "" }), e.songId ? null : el("span", { class: "art-chip", text: "fehlt" })),
              e.songId ? el("button", { class: "zweit", text: "Entfernen", onclick: () => deckAendern({ weg: [e.songId] }) }) : null,
            ),
          )
        : [el("li", { class: "leise" }, "Noch leer – rechts Songs suchen und hinzufügen.")]),
    );
    bibliothekZeigen();
  }
  async function deckAendern(daten) {
    fehler("");
    try {
      await api(`/api/admin/decks/${offenesDeck}/songs`, daten);
      await editorLaden();
      listen();
    } catch (err) {
      fehler(err.message);
    }
  }
  async function bibliothekSuchen() {
    const q = new URLSearchParams({ filter: "alle", q: $("#editor-suche").value, jahrzehnt: $("#editor-jahrzehnt").value });
    bibliothekTreffer = (await api(`/api/admin/songs?${q}`)).filter((s) => !s.ausgeschlossen);
    bibliothekZeigen();
  }
  function bibliothekZeigen() {
    const offen = bibliothekTreffer.filter((s) => !imDeck.has(s.id));
    $("#editor-alle").textContent = `Alle ${offen.length} Treffer hinzufügen`;
    $("#editor-alle").disabled = !offen.length;
    $("#editor-bibliothek").replaceChildren(
      ...(bibliothekTreffer.length
        ? bibliothekTreffer.map((s) =>
            el(
              "li",
              {},
              el("span", {}, el("strong", { text: s.titel_anzeige }), " · ", s.interpret, el("span", { class: "leise", text: s.jahr ? ` · ${s.jahr}` : "" })),
              imDeck.has(s.id)
                ? el("span", { class: "leise klein", text: "im Deck" })
                : el("button", { class: "zweit", text: "+ Hinzufügen", onclick: () => deckAendern({ hinzu: [s.id] }) }),
            ),
          )
        : [el("li", { class: "leise" }, "Keine Songs gefunden.")]),
    );
  }
  let suchT;
  $("#editor-suche").addEventListener("input", () => {
    clearTimeout(suchT);
    suchT = setTimeout(bibliothekSuchen, 300);
  });
  $("#editor-jahrzehnt").addEventListener("change", bibliothekSuchen);
  $("#editor-alle").addEventListener("click", () => deckAendern({ hinzu: bibliothekTreffer.filter((s) => !imDeck.has(s.id)).map((s) => s.id) }));
  $("#editor-umbenennen").addEventListener("click", async () => {
    const name = $("#editor-name").value.trim();
    if (!name) return;
    await api(`/api/admin/decks/${offenesDeck}/umbenennen`, { name });
    await editorLaden();
    listen();
  });
  $("#editor-zu").addEventListener("click", editorSchliessen);
  katalog();

  // ---------- Ergebnis-Karten (übernommene Vorschauen) ----------
  const QUELLE = { musicbrainz: "MusicBrainz", tag: "Datei-Tag", liste: "Songliste", charts: "Jahrescharts", manuell: "von dir eingetragen" };

  function dauer(s) {
    return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
  }
  const chip = (text, art = "") => el("span", { class: `marke-chip ${art}`, text });

  function karteFuer(name) {
    const karte = el("div", { class: "upload" }, el("div", { class: "cover", text: "♪" }), el("div", {}, el("h3", { text: name }), el("p", { class: "leise klein", text: "wartet …" })));
    $("#uploads").prepend(karte);
    return karte;
  }

  function zeigeErgebnis(karte, a, status) {
    const cover = a.hatCover ? el("img", { class: "cover", src: `/api/cover/${a.id}?admin=1`, alt: "" }) : el("div", { class: "cover", text: "♪" });
    const chips = [];
    if (status === "vorhanden") chips.push(chip("schon in der Bibliothek – nicht erneut abgelegt", "warn"));
    if (a.quelle === "apple") chips.push(chip(`${/deezer\.com/.test(a.appleUrl ?? "") ? "Deezer" : "Apple"}-Vorschau · 30 s`, "gut"));
    if (a.tagJahr) chips.push(chip(`${a.quelle === "apple" ? "Apple/Deezer" : "Tag"} ${a.tagJahr}`));
    if (a.chartPlatz) chips.push(chip(`Charts ${a.chartJahr} · Platz ${a.chartPlatz}`, "gut"));
    for (const l of a.listen) chips.push(chip(`${l.name}${l.jahr ? ` (${l.jahr})` : ""}`, "gut"));
    if (a.doppelt) chips.push(chip(`doppelt: ${a.doppelt.interpret} – ${a.doppelt.titel}`, "warn"));

    const jahrFeld = el("input", { type: "number", min: 1900, max: 2100, placeholder: a.jahr ?? "Jahr", "aria-label": "Jahr korrigieren" });
    const aktion = async (pfad, daten, danach) => {
      fehler("");
      try {
        await api(pfad, daten);
        if (danach) return danach();
        zeigeErgebnis(karte, await api(`/api/admin/analyse/${a.id}`), "neu");
        status_();
      } catch (err) {
        fehler(err.message);
      }
    };
    karte.classList.toggle("fehlt", !a.jahr);
    karte.dataset.id = a.id;
    karte.replaceChildren(
      cover,
      el(
        "div",
        {},
        el("div", { class: "reihe" },
          el("div", {}, el("h3", { text: a.titel }), el("div", { class: "leise", text: [a.interpret, a.album, dauer(a.dauerS)].filter(Boolean).join(" · ") })),
          el("div", { class: "jahr-rechts" },
            el("div", { class: "jahr-gross", text: a.jahr ?? "?" }),
            el("div", { class: "leise klein", text: a.jahr ? QUELLE[a.jahrQuelle] ?? a.jahrQuelle : "kein Jahr gefunden" }),
          ),
        ),
        el("div", { class: "zeile" }, chips),
        a.pruefen && a.pruefGrund ? el("p", { class: "klein", text: `Bitte prüfen: ${a.pruefGrund}` }) : null,
        steckbrief(a),
        el("div", { class: "aktionen" },
          jahrFeld,
          el("button", { class: "zweit", text: "Jahr setzen", onclick: () => jahrFeld.value && aktion(`/api/admin/songs/${a.id}`, { manuellJahr: jahrFeld.value }) }),
          a.jahr && a.pruefen ? el("button", { class: "zweit", text: "Passt", onclick: () => aktion(`/api/admin/songs/${a.id}`, { bestaetigen: true }) }) : null,
          el("button", { class: "gefahr", text: "Entfernen", onclick: () => entfernen(a.id) }),
          ...deckAuswahl(a.id),
        ),
      ),
    );
  }

  // Entfernen: alle Karten dieses Songs verschwinden (auch „schon vorhanden“-Karten); schon weg = erledigt
  async function entfernen(id) {
    fehler("");
    try {
      await api(`/api/admin/vorschau/${id}/entfernen`, {});
    } catch (err) {
      if (err.status !== 404) return fehler(err.message);
    }
    for (const k of document.querySelectorAll(`#uploads .upload[data-id="${id}"]`)) k.remove();
    const rest = document.querySelectorAll("#uploads .upload").length;
    $("#uploads-titel").textContent = `Hochgeladen (${rest})`;
    $("#uploads-titel").classList.toggle("versteckt", !rest);
    status_();
    liste();
    listen();
  }

  /** Alle Infos zum Song: Titel, Künstler, Jahr, Genre, Album, Fakten. */
  function steckbrief(a) {
    const angabe = (name, wert) => [el("dt", { text: name }), el("dd", { class: wert ? "" : "leise", text: wert || "–" })];
    return el("div", { class: "steckbrief" },
      el("dl", {},
        ...angabe("Titel", a.titel),
        ...angabe("Künstler", a.interpret),
        ...angabe("Jahr", a.jahr ? String(a.jahr) : ""),
        ...angabe("Genre", a.genre),
        ...angabe("Album", a.album),
        ...angabe("Dauer", dauer(a.dauerS)),
      ),
      a.fakten?.length
        ? el("div", {}, el("h4", { text: "Hintergrund" }), el("ul", { class: "fakten-liste" }, a.fakten.map((f) => el("li", { text: f }))))
        : null,
    );
  }

  // übernommenen Song direkt in ein eigenes Deck legen
  function deckAuswahl(songId) {
    const eigene = decks.filter((d) => d.quelle === "eigen");
    if (!eigene.length) return [];
    const wahl = el("select", { "aria-label": "Deck" }, ...eigene.map((d) => el("option", { value: d.id, text: d.name })));
    wahl.classList.add("deck-wahl");
    const knopf = el("button", {
      class: "zweit",
      text: "Ins Deck",
      onclick: async () => {
        fehler("");
        try {
          await api(`/api/admin/decks/${wahl.value}/songs`, { hinzu: [songId] });
          knopf.textContent = "✓ im Deck";
          knopf.disabled = true;
          listen();
        } catch (err) {
          fehler(err.message);
        }
      },
    });
    wahl.addEventListener("change", () => { knopf.textContent = "Ins Deck"; knopf.disabled = false; });
    return [wahl, knopf];
  }

  const status_ = () => status();
  $("#apple-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#apple-suche").value.trim();
    if (q.length < 2) return;
    fehler("");
    $("#apple-stand").textContent = "Suche bei Apple Music …";
    $("#apple-treffer").replaceChildren();
    try {
      const treffer = await api(`/api/admin/apple/suche?${new URLSearchParams({ q })}`);
      const deezer = treffer.length && treffer.every((t) => t.quelle === "deezer");
      $("#apple-stand").textContent = !treffer.length
        ? "Weder Apple Music noch Deezer haben dazu eine Vorschau."
        : deezer
          ? `Apple Music kennt den Song nicht – ${treffer.length} Treffer bei Deezer`
          : `${treffer.length} Treffer mit Vorschau`;
      $("#apple-treffer").replaceChildren(...treffer.map(appleZeile));
    } catch (err) {
      $("#apple-stand").textContent = "";
      fehler(err.message);
    }
  });

  function appleZeile(t) {
    const knopf = el("button", {
      class: "zweit",
      text: "Übernehmen",
      onclick: async () => {
        fehler("");
        knopf.disabled = true;
        knopf.textContent = "lädt …";
        try {
          const d = await api("/api/admin/apple/uebernehmen", { trackId: t.trackId, quelle: t.quelle });
          knopf.textContent = d.status === "neu" ? "✓ übernommen" : "✓ schon da";
          zeigeErgebnis(karteFuer(d.song.titel), d.song, d.status);
          $("#uploads-titel").classList.remove("versteckt");
          listen();
          status_();
        } catch (err) {
          knopf.disabled = false;
          knopf.textContent = "Übernehmen";
          fehler(err.message);
        }
      },
    });
    return el("li", {},
      t.cover ? el("img", { class: "cover", src: t.cover, alt: "", loading: "lazy" }) : el("div", { class: "cover", text: "♪" }),
      el("div", {},
        el("strong", { text: t.titel }),
        el("div", { class: "leise klein", text: [t.interpret, t.album, t.jahr, t.quelle === "deezer" ? "Deezer" : null].filter(Boolean).join(" · ") }),
        el("audio", { controls: true, preload: "none", src: t.vorschau }),
      ),
      knopf,
    );
  }

  await listen(); // Decks zuerst – für „Ins Deck“ in Karten und Tabelle
  await liste();
  geladen = true;
  abfragen();
})();
