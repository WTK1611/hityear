"use strict";

(async () => {
  // Einladungslink aus dem QR-Code: einmal einlösen, dann aus der Adresse entfernen
  const params = new URLSearchParams(location.search);
  const einladung = params.get("einladung");
  if (einladung) {
    try {
      await api("/api/einladung", { raum: params.get("raum"), einladung });
    } catch (err) {
      $("#fehler").textContent = err.message;
    }
    params.delete("einladung");
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }
  await anmeldungPruefen();
  const code = (new URLSearchParams(location.search).get("raum") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (!code) return void (location.href = "/");
  const SITZUNG = `zs_spieler_${code}`;
  const socket = verbinden();
  const audio = audioSpieler();
  const startsongAudio = audioSpieler(); // eigener Spieler: der erste Song lädt derweil schon
  let autoGestartet = null;
  let countdownFuer = null;
  let zustand = null;
  let gewaehlt = null;
  let frisch = false; // Lücke gerade angetippt → kurz aufploppen
  let letzteAufloesung = null;
  let startTimer = null;
  let vorTimer = null;
  // Höhe der fixierten oberen Box (EQ) → das Rateformular klebt direkt darunter
  new ResizeObserver(([e]) => $("#spiel").style.setProperty("--box-h", `${Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.target.offsetHeight)}px`)).observe($("#spiel > .box"));
  let tippZuletzt = null;
  let tippTimer = null;
  let tippVorher = null; // wer beim letzten Zeichnen schon getippt hatte (für den Pop neuer Tipps)

  /** Unten am Rand: die anderen Mitspieler, mit ✓ sobald sie getippt haben, der neueste mit Namen. */
  function tippStandZeigen(z, ich, zeigen) {
    const box = $("#tipp-stand");
    const andere = z.spieler.filter((p) => p.id !== ich.id && (z.einstellungen.modus === "alle" || p.id === z.aktiv));
    box.classList.toggle("versteckt", !zeigen || !andere.length);
    const gelegt = new Set(z.gelegt ?? []);
    const neu = tippVorher ? andere.filter((p) => gelegt.has(p.id) && !tippVorher.has(p.id)) : [];
    tippVorher = zeigen ? gelegt : null;
    if (!zeigen || !andere.length) return;
    box.querySelector(".tipp-avatare").replaceChildren(...andere.map((p) => {
      const fertig = gelegt.has(p.id);
      return el("span", { class: `tipp-avatar ${fertig ? "fertig" : ""} ${neu.includes(p) ? "neu" : ""}` },
        el("span", { class: "tipp-bild" }, avatarEl(p)),
        el("span", { class: "tipp-name", text: p.name.split(" ")[0] }));
    }));
    const fertig = andere.filter((p) => gelegt.has(p.id)).length;
    const text = box.querySelector(".tipp-text");
    // der neueste Tipp bleibt 3 s mit Namen und leuchtend stehen
    if (neu.length) tippZuletzt = { name: neu.at(-1).name, um: Date.now() };
    const frisch = tippZuletzt && Date.now() - tippZuletzt.um < 3000;
    text.classList.toggle("frisch", Boolean(frisch));
    text.textContent = frisch ? `${tippZuletzt.name} hat getippt · ${fertig} von ${andere.length}`
      : fertig === andere.length ? "Alle haben getippt" : `${fertig} von ${andere.length} haben getippt`;
    clearTimeout(tippTimer);
    if (frisch) tippTimer = setTimeout(() => zustand === z && darstellen(), 3000 - (Date.now() - tippZuletzt.um) + 20);
  }
  let rateFuer = null;
  let rateSchritt = "interpret"; // geführte Eingabe: „interpret“ → „titel“ (je nach Einstellung nur einer davon)
  /** Welche Rate-Schritte nach dem Jahr folgen (Einstellung „ratenWas“) */
  const rateSchritte = (e) => (!e?.raten ? [] : e.ratenWas === "titel" ? ["titel"] : e.ratenWas === "interpret" ? ["interpret"] : ["interpret", "titel"]);
  $("#b-code").textContent = code;
  // Equalizer: echt, wenn der Song auf diesem Handy läuft – sonst tanzt er im Takt mit (Klasse „takt“)
  const eq = equalizerEl(audio.element);
  $("#eq-handy").replaceWith(eq);
  playerBinden(audio.element, { leiste: $("#t-leiste"), jetzt: $("#t-jetzt"), ende: $("#t-ende"), knopf: $("#abspielen"), animiert: [eq] });
  $("#name").value = speicher("zs_name") || "";
  // Countdowns (Zeit zum Einordnen, nächster Song) oben rechts neben dem Logo statt im Rahmen
  // davor der eigene Stand: gesammelte Karten / Ziel und (wenn mitgeraten wird) die Sterne
  const stand = el("div", { class: "marke-stand versteckt", "aria-live": "polite" },
    el("span", { class: "weiter-label", text: "Dein Stand" }),
    el("span", { class: "stand-werte" }, el("span", { class: "stand-karten" }), el("span", { class: "stand-sterne" })));
  $(".marke").append(stand, el("div", { class: "marke-uhr", "aria-live": "off" }, $("#frist"), $("#weiter")));
  const standZeigen = (z, ich) => {
    stand.classList.toggle("versteckt", !ich);
    if (!ich) return;
    stand.querySelector(".stand-karten").textContent = `${ich.zeitstrahl.length}/${z.einstellungen.zielKarten}`;
    const sterne = ich.punkte ?? 0;
    const mitSternen = Boolean(z.einstellungen.raten) || sterne > 0;
    stand.querySelector(".stand-sterne").textContent = mitSternen ? `⭐ ${sterne}` : "";
    stand.querySelector(".stand-sterne").classList.toggle("versteckt", !mitSternen);
  };

  // „Keine Verbindung“ meldet schon das gelbe Banner (gemeinsam.js) – nicht doppelt zeigen
  const fehler = (t) => ($("#fehler").textContent = t === "Keine Verbindung zum Server." ? "" : t || "");
  const zeigen = (id) => {
    for (const s of ["#beitreten", "#warten", "#spiel", "#ende"]) $(s).classList.toggle("versteckt", s !== id);
  };

  // Raum geschlossen: Meldung zeigen und nach 5 s zur Startseite (kommt in der Zeit kein Zustand, ist er wirklich weg)
  let zurStartseite = 0;
  function spielBeendet() {
    speicher(SITZUNG, null);
    zustand = null;
    zeigen("#ende");
    $("#sieger-avatare").replaceChildren();
    $("#ende-knoepfe").classList.add("versteckt");
    document.querySelector(".zurueck-reihe")?.classList.remove("versteckt");
    $("#ende-titel").textContent = "Spiel wurde beendet";
    $("#ende-text").textContent = "Gleich geht’s zur Startseite …";
    clearTimeout(zurStartseite);
    zurStartseite = setTimeout(() => (location.href = "/"), 5000);
  }

  // Gastgeber spielt auf diesem Gerät mit: mit seiner Host-Sitzung bekommt diese Verbindung auch die Host-Rechte
  // (Start, Revanche) – die Knöpfe dafür zeigt darstellen(), sobald der Zustand „host“ meldet
  async function alsHostVerbinden() {
    let h = null;
    try { h = JSON.parse(speicher("zs_host") || "null"); } catch { /* kaputter Eintrag */ }
    if (h?.code !== code) return;
    try {
      await socket.anfrage("host:verbinden", h);
    } catch {
      /* Host-Sitzung gehört zu einem alten Raum – dann eben nur Spieler */
      return;
    }
    // „Allein üben“: der Start-Knopf am Gastgeber-Gerät hat hierher geschickt – nach dem Beitreten geht es gleich los
    if (speicher(`zs_solo_start_${code}`)) {
      speicher(`zs_solo_start_${code}`, null);
      socket.anfrage("host:starten").catch((err) => fehler(err.message));
    }
  }

  async function wiederBeitreten() {
    const sitzung = speicher(SITZUNG);
    if (!sitzung) return zeigen("#beitreten");
    try {
      await socket.anfrage("spieler:beitreten", { code, sitzung });
      await alsHostVerbinden();
    } catch (err) {
      // Raum gibt es nicht mehr (geschlossen, während das Handy weg war, oder Server neu gestartet)
      if (/Raum nicht gefunden/.test(err.message)) return spielBeendet();
      speicher(SITZUNG, null);
      fehler(err.message);
      zeigen("#beitreten");
    }
  }

  logoSchutz(() => zustand && zustand.phase !== "lobby" && zustand.phase !== "ende");

  socket.on("connect", () => {
    $("#status").textContent = "";
    wiederBeitreten();
  });
  socket.on("connect_error", (e) => {
    if (String(e.message).includes("angemeldet")) location.href = "/?weiter=" + encodeURIComponent(location.pathname + location.search);
  });
  socket.on("entfernt", () => {
    speicher(SITZUNG, null);
    zeigen("#ende");
    $("#sieger-avatare").replaceChildren();
    $("#ende-knoepfe").classList.add("versteckt");
    document.querySelector(".zurueck-reihe")?.classList.remove("versteckt");
    $("#ende-titel").textContent = "Du wurdest aus dem Raum entfernt.";
  });
  socket.on("beendet", spielBeendet);
  $("#bereit").addEventListener("click", async () => {
    try {
      await socket.anfrage("spieler:bereit", { bereit: !zustand?.spieler.find((p) => p.id === zustand.ich)?.bereit });
    } catch (err) {
      fehler(err.message);
    }
  });
  $("#host-starten").addEventListener("click", async () => {
    try {
      await socket.anfrage("host:starten");
    } catch (err) {
      fehler(err.message);
    }
  });
  $("#nochmal").addEventListener("click", async () => {
    try {
      await socket.anfrage("spieler:revanche");
    } catch (err) {
      fehler(err.message);
    }
  });
  zweiterKlick($("#verlassen"), "Wirklich verlassen? Nochmal tippen", async () => {
    try {
      await socket.anfrage("spieler:verlassen");
    } catch {
      /* Raum schon weg – trotzdem gehen */
    }
    speicher(SITZUNG, null);
    location.href = "/";
  });
  socket.on("zustand", (z) => {
    clearTimeout(zurStartseite); // doch wieder im Raum
    zustand = z;
    darstellen();
  });
  // Handy war im Hintergrund (Sperre, Tastatur) → sofort aktuellen Stand zeigen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && zustand) darstellen();
  });

  // Avatar-Auswahl (zuletzt gewählter vorbelegt, sonst zufällig)
  let avatar = AVATARE.includes(speicher("zs_avatar")) ? speicher("zs_avatar") : AVATARE[Math.floor(Math.random() * AVATARE.length)];
  const avatarKnoepfe = AVATARE.map((a) =>
    el("button", {
      type: "button", class: "avatar-knopf", text: a, role: "radio", "aria-label": `Avatar ${a}`,
      onclick: () => {
        avatar = a;
        for (const k of avatarKnoepfe) k.setAttribute("aria-checked", String(k.textContent === avatar));
      },
    }),
  );
  for (const k of avatarKnoepfe) k.setAttribute("aria-checked", String(k.textContent === avatar));
  $("#avatar-wahl").replaceChildren(...avatarKnoepfe);

  $("#beitreten-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    fehler("");
    const name = $("#name").value.trim();
    try {
      const r = await socket.anfrage("spieler:beitreten", { code, name, avatar });
      speicher(SITZUNG, r.sitzung);
      speicher("zs_name", name);
      speicher("zs_avatar", avatar);
      await alsHostVerbinden();
    } catch (err) {
      fehler(err.message);
    }
  });

  // Gastgeber spielt am Handy mit: quer (ab der Startkarte) zeigt das Handy das Spielfeld wie am Fernseher (host.html),
  // hochkant geht es dort zurück zu den eigenen Karten (host.js). Mitspieler bleiben hochkant (gemeinsam.js).
  const handyGeraet = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 500;
  const istQuer = () => (screen.orientation?.type ?? (Math.abs(Number(window.orientation)) === 90 ? "landscape" : "portrait")).startsWith("landscape");
  function spielfeldPruefen() {
    const frei = Boolean(handyGeraet && zustand?.host && zustand.phase !== "lobby");
    document.documentElement.classList.toggle("drehen-frei", frei);
    if (!frei || !istQuer()) return;
    try {
      sessionStorage.setItem("zs_spielfeld_quer", zustand.code);
    } catch {
      /* ohne Rückweg weiter */
    }
    location.replace("/host.html");
  }
  if (handyGeraet) {
    screen.orientation?.addEventListener?.("change", spielfeldPruefen);
    addEventListener("orientationchange", spielfeldPruefen);
  }

  function darstellen() {
    spielfeldPruefen();
    void wachHalten(Boolean(zustand && zustand.phase !== "ende")); // auch in der Lobby: sonst schläft das Handy vor dem Start ein
    document.querySelector(".zurueck-reihe")?.classList.remove("versteckt");
    const z = zustand;
    if (!z.ich) return zeigen("#beitreten");
    const ich = z.spieler.find((p) => p.id === z.ich);
    standZeigen(z, null); // nur während des Spiels (darunter wieder eingeblendet)
    if (!ich) return zeigen("#beitreten");

    if (z.phase === "lobby") {
      zeigen("#warten");
      document.querySelector(".zurueck-reihe")?.classList.remove("versteckt"); // in der Lobby wieder „Zurück“
      $("#w-name").textContent = ich.name;
      $("#w-spieler").replaceChildren(
        ...z.spieler.map((p) => el("div", { class: "spielerzeile" }, avatarEl(p), el("span", { class: "name", text: p.name }))),
      );
      // „Ich bin fertig“ wirkt nur auf dem Hauptbildschirm (grüner Rahmen + Wackeln), hier nur der Knopftext
      $("#bereit").textContent = ich.bereit ? "✓ Fertig – warte auf den Start" : "✅ Ich bin fertig";
      // der Gastgeber wartet auf niemanden: er startet selbst, „Zurück“ führt ihn in die Einrichtung
      $("#bereit").classList.toggle("versteckt", z.host);
      $("#host-starten").classList.toggle("versteckt", !z.host);
      document.querySelector(".zurueck")?.setAttribute("href", z.host ? "/host.html" : "/");
      return;
    }
    if (z.phase === "ende") {
      zeigen("#ende");
      const gewonnen = z.gewinner.includes(ich.id);
      $("#ende-titel").textContent = gewonnen ? "🏆 Du hast gewonnen!" : z.gewinner.length === 2 ? `${t(z.spieler.find((p) => p.id === z.gewinner[0])?.name)} & ${t(z.spieler.find((p) => p.id === z.gewinner[1])?.name)} gewinnen.` : `${z.gewinner.map((id) => z.spieler.find((p) => p.id === id)?.name).join(" & ")} gewinnt.`;
      $("#ende-text").textContent = `Du hast ${ich.zeitstrahl.length} Karten gesammelt (${ich.richtig} richtig, ${ich.falsch} daneben).`;
      $("#sieger-avatare").replaceChildren(...z.gewinner.map((id) => avatarEl(z.spieler.find((p) => p.id === id), true)));
      ranglisteZeichnen($("#rangliste"), z, ich.id);
      // nach dem Spiel: statt „Zurück“ die beiden Möglichkeiten
      $("#ende-knoepfe").classList.remove("versteckt");
      for (const k of document.querySelectorAll(".host-nur")) k.classList.toggle("versteckt", !z.host);
      document.querySelector(".zurueck-reihe")?.classList.add("versteckt");
      bestenlisteZeichnen($("#bestenliste"), z.bestenliste, [ich.name]);
      // erst die Runde; die Bestenliste (falls vorhanden) per Knopf
      const gibtBeste = Boolean(z.bestenliste?.length);
      $("#listen-wechsel").classList.toggle("versteckt", !gibtBeste);
      if (letzteAufloesung !== "ende") listeZeigen(false);
      else listeZeigen(bestenAn && gibtBeste);
      if (letzteAufloesung !== "ende") {
        letzteAufloesung = "ende";
        vibrieren(gewonnen ? [80, 60, 80, 60, 200] : 60);
        if (gewonnen) konfetti(220);
      }
      return;
    }

    zeigen("#spiel");
    standZeigen(z, ich);
    // Während des Spiels kein „Zurück“ – das wäre ein Abbruch (in Lobby und am Ende bleibt er)
    document.querySelector(".zurueck-reihe")?.classList.add("versteckt");
    // Neue Runde/neuer Song → Eingabe immer frisch beim Zeitstrahl beginnen (alte Rate-Eingabe weg)
    const rateRunde = `${z.runde}-${z.startUm}-${z.ausschnitt ?? ""}`;
    if (rateFuer !== rateRunde) {
      rateFuer = rateRunde;
      rateSchritt = rateSchritte(z.einstellungen)[0] ?? "interpret";
      $("#rate-interpret").value = $("#rate-titel").value = "";
      $("#raten-felder").classList.add("versteckt");
      if (document.activeElement?.closest?.("#raten-felder")) document.activeElement.blur();
      gewaehlt = null;
    }
    if (z.phase !== "hoeren") $("#raten-felder").classList.add("versteckt");
    // Modus „alle“: jeder (beim Stechen nur die Führenden) tippt gleichzeitig
    const alle = z.einstellungen.modus === "alle";
    const binDran = alle ? !z.stechen || z.stechen.includes(ich.id) : z.aktiv === ich.id;
    const aktiv = z.spieler.find((p) => p.id === z.aktiv);
    $("#runde").textContent = z.stechen ? `Stechen · Runde ${z.runde}` : `Runde ${z.runde}`;
    $("#wer").textContent = alle ? (binDran ? "Alle sind dran!" : "Stechen – schau zu") : binDran ? "Du bist dran!" : `${aktiv?.name ?? "?"} ist dran`;

    const hoeren = z.phase === "hoeren";
    hintergrundStimmung(z);
    if (hoeren) startsongZeigen(z.vorspiel, startsongAudio);
    const w = z.einstellungen.wiedergabe;
    const hierAudio = hoeren && Boolean(z.ausschnitt) && (w === "alle" || w === "solo" || (w === "spieler" && (alle || binDran)));
    audio.laden(hierAudio ? z.ausschnitt : null);
    $("#audio-box").classList.toggle("versteckt", !hierAudio);
    // Quellenhinweis schon während der Hörprobe (ohne Link – der würde den Titel verraten)
    $("#quelle-live").textContent = hoeren && z.quelle ? `🎧 Hörprobe: ${z.quelle}` : "";
    eq.classList.toggle("versteckt", !hoeren);
    eq.classList.toggle("takt", hoeren && !hierAudio);
    // neuer Ausschnitt → Countdown 3 · 2 · 1, dann spielt er von selbst
    if (hierAudio && audio.url && autoGestartet !== audio.url) {
      const url = (autoGestartet = audio.url);
      countdownAbspielen(audio, () => zustand?.phase === "hoeren" && audio.url === url, z.startUm);
    }
    // Musik läuft woanders (Host/anderes Handy) → trotzdem den Countdown zeigen
    if (hoeren && !hierAudio && z.startUm && countdownFuer !== z.startUm) {
      const startUm = (countdownFuer = z.startUm);
      countdownZeigen(startUm, () => zustand?.phase === "hoeren" && zustand.startUm === startUm);
    }

    $("#ergebnis").classList.toggle("versteckt", hoeren);
    // Oben neben dem Logo steht nur ein Countdown: 3 … 1 bis zum Song, dann die Zeit zum Einordnen,
    // ohne Frist (alle haben getippt) bis zur Auflösung
    const vorStart = hoeren && z.startUm ? lokal(z.startUm) - Date.now() : 0;
    clearTimeout(vorTimer);
    if (vorStart > 3000) {
      fristAnzeigen($("#frist"), {});
      vorTimer = setTimeout(() => zustand === z && darstellen(), vorStart - 3000 + 20);
    } else if (vorStart > 0) fristAnzeigen($("#frist"), { frist: z.startUm }, "Gleich geht's los");
    else if (hoeren && !z.frist && z.aufloesungUm) fristAnzeigen($("#frist"), { frist: z.aufloesungUm }, "Auflösung kommt");
    // die Frist hat 1 s Kulanz nach dem Songende → angezeigt wird 30 … 1 statt 31 … 1
    else fristAnzeigen($("#frist"), { frist: z.frist ? z.frist - 1000 : null });
    // „Nächster Song“ steht oben neben dem Logo: außerhalb der Auflösung leeren
    if (hoeren || !z.ergebnis) weiterCountdown($("#weiter"), {});
    if (!hoeren && z.ergebnis) {
      // Modus „alle“: eigenes Ergebnis (sonst das Sammel-Ergebnis ohne Spieler)
      const e = z.ergebnisse?.find((r) => r.spielerId === ich.id) ?? z.ergebnis;
      // nur bei neuer Auflösung neu bauen (sonst lädt das Cover bei jedem Zustand neu)
      const auf = `${z.runde}-${e.karte.songId}`;
      if ($("#e-karte").dataset.auf !== auf) {
        $("#e-karte").dataset.auf = auf;
        // falsch/nicht eingeordnet: Song kommt später wieder → nichts verraten
        $("#e-karte").replaceChildren(z.verdeckt ? el("div", { class: "aufloesung" }, el("div", { class: "aufloesung-cover platzhalter", text: "?" }), el("div", { class: "titel", text: "Der Song kommt später nochmal." })) : aufloesungEl(e.karte));
      }
      const wer = e.spielerId === ich.id ? "Du liegst" : e.spielerId ? `${aktiv?.name ?? "?"} liegt` : "Jemand liegt";
      const wohin = e.richtig ? "Karte geht in den Zeitstrahl." : z.einstellungen.nichtErraten === "weg" ? "Karte ist raus." : "Karte geht zurück in den Stapel.";
      $("#e-urteil").className = `urteil ${e.richtig ? "gut" : "schlecht"}`;
      $("#e-urteil").textContent = e.richtig
        ? `✓ ${wer} richtig! ${wohin}`
        : e.zeitUm
          ? falschText(ich, e, z.verdeckt) ?? `⏱ Zeit abgelaufen. ${wohin}`
          : falschText(ich, e, z.verdeckt) ?? `✗ Leider daneben. ${wohin}`;
      const b = e.bonus;
      $("#e-bonus").classList.toggle("versteckt", !b);
      if (b) {
        // je Rateschritt eine eigene Zeile: erraten (+1) oder nicht
        const zeile = (richtig, text) => el("span", { class: `bonus-zeile ${richtig ? "gut" : "schlecht"}`, text });
        $("#e-bonus").replaceChildren(...rateSchritte(z.einstellungen).map((w) => {
          const interpret = w === "interpret";
          const richtig = interpret ? b.interpretRichtig : b.titelRichtig;
          return zeile(richtig, interpret
            ? richtig ? "🎤 Künstler erraten · ⭐ +1" : "🎤 Künstler nicht erraten"
            : richtig ? "🎵 Titel erraten · ⭐ +1" : "🎵 Titel nicht erraten");
        }));
      }
      weiterCountdown($("#weiter"), z);
      const schluessel = `${z.runde}-${e.karte.songId}`;
      if (letzteAufloesung !== schluessel) {
        if (binDran) vibrieren(e.richtig ? [40, 40, 40] : 250);
        if (binDran && e.richtig) konfetti(90);
      }
      letzteAufloesung = schluessel;
    }

    const getippt = (z.gelegt ?? []).includes(ich.id);
    const entschieden = Boolean(z.aufloesungUm);
    const kurz = alle && z.einstellungen.warten === "alle5"; // Auflösung 5 s nach der letzten Eingabe
    const erster = alle && z.einstellungen.warten === "erster"; // Auflösung 5 s nach der ersten Eingabe, bis dahin darf jeder tippen
    $("#anleitung").textContent = !hoeren
      ? ""
      : erster && entschieden
        ? getippt ? "✓ Getippt! Auflösung in wenigen Sekunden." : "⚡ Schnell! Jemand hat schon getippt – noch 5 Sekunden."
      : getippt
        ? kurz
          ? entschieden ? "✓ Alle haben getippt – Auflösung in 5 Sekunden." : "✓ Getippt! Auflösung 5 Sekunden, nachdem alle getippt haben."
          : "✓ Getippt! Die Auflösung kommt, wenn der Song zu Ende ist."
        : entschieden
          ? kurz ? "Die Runde ist entschieden – Auflösung in 5 Sekunden." : "Die Runde ist entschieden – Auflösung, wenn der Song zu Ende ist."
          : binDran
            ? "Tippe in deinem Zeitstrahl auf die Lücke, in die der Song gehört – dann bestätigen."
            : "Schau zu und rate im Kopf mit.";

    // Auswahl erscheint auf allen Handys gleichzeitig: zur gemeinsamen Startzeit (nach dem Countdown)
    const bisStart = hoeren && z.startUm ? lokal(z.startUm) - Date.now() : 0;
    if (bisStart > 0) {
      clearTimeout(startTimer);
      startTimer = setTimeout(() => zustand === z && darstellen(), bisStart + 20);
      if (binDran && !getippt) $("#anleitung").textContent = "Hör genau hin …";
    }
    const darfLegen = hoeren && binDran && !getippt && (!entschieden || erster) && bisStart <= 0;
    if (!darfLegen) gewaehlt = null;
    // während des Countdowns stehen die Lücken schon da (noch gesperrt) – kein Umspringen zum Songstart
    const vorschau = hoeren && binDran && !getippt && (!entschieden || erster) && bisStart > 0;
    zeitstrahlZeichnen(ich, darfLegen, hoeren ? z.meinTipp ?? null : null, !hoeren && z.ergebnis?.richtig && z.ergebnis.spielerId === ich.id ? z.ergebnis.karte.songId : null, vorschau);
    $("#bestaetigen").classList.toggle("versteckt", !darfLegen && !vorschau);
    if (vorschau) $("#bestaetigen").disabled = true;
    // Solange der Song läuft, zeigt die Box nur den EQ: keine Kopfzeile, keine Anleitung
    $("#spiel").classList.toggle("nur-eq", hoeren);
    // Bei der Auflösung nur Cover und Ergebnis: ohne Kopfzeile und ohne Zeitstrahl
    $("#spiel").classList.toggle("nur-ergebnis", !hoeren && Boolean(z.ergebnis));
    // Option „raten“, geführt: 1. Jahr → dann Interpret und/oder Titel; neue Runde → von vorn
    const schritte = rateSchritte(z.einstellungen);
    const raten = schritte.length > 0;
    const gesamt = schritte.length + 1;
    $("#bestaetigen").textContent = raten ? "Jahr bestätigen ›" : "Hier einordnen ✓";
    if (darfLegen && raten) $("#anleitung").textContent = `Schritt 1 von ${gesamt}: Tippe auf die Lücke, in die der Song gehört – dann bestätigen.`;
    const raetNoch = hoeren && getippt && (z.raten ?? []).includes(ich.id);
    $("#raten-felder").classList.toggle("versteckt", !raetNoch);
    tippStandZeigen(z, ich, hoeren && bisStart <= 0);
    if (raetNoch) {
      const interpret = rateSchritt === "interpret";
      $("#anleitung").textContent = "✓ Jahr ist gemerkt – jetzt Zusatzpunkte sammeln (freiwillig).";
      $("#rate-schritt").textContent = `Schritt ${schritte.indexOf(rateSchritt) + 2} von ${gesamt}`;
      $("#rate-frage").textContent = interpret ? "🎤 Wer singt?" : "🎵 Wie heißt der Song?";
      $("#rate-interpret").classList.toggle("versteckt", !interpret);
      $("#rate-titel").classList.toggle("versteckt", interpret);
      rateKnopf();
      const feld = interpret ? $("#rate-interpret") : $("#rate-titel");
      // Fokus aufs Eingabefeld (nach dem Zeichnen, damit es sicher sichtbar ist) – die Tastatur geht gleich auf
      if (document.activeElement !== feld) {
        feld.focus({ preventScroll: true });
        requestAnimationFrame(() => document.activeElement !== feld && !feld.closest(".versteckt") && feld.focus({ preventScroll: true }));
      }
    }
    $("#bestaetigen").disabled = gewaehlt === null;
  }

  /** Knopf der geführten Eingabe: leer = überspringen, sonst bestätigen */
  function rateKnopf() {
    const feld = rateSchritt === "interpret" ? $("#rate-interpret") : $("#rate-titel");
    const letzter = rateSchritte(zustand?.einstellungen).at(-1) === rateSchritt;
    const was = rateSchritt === "interpret" ? "Interpret" : "Titel";
    $("#rate-weiter").textContent = feld.value.trim() ? `${was} bestätigen ${letzter ? "✓" : "›"}` : "Weiß ich nicht ›";
  }

  /** Falsch eingeordnet: was getippt war und wohin der Song gehört hätte (ohne Jahr, wenn er verdeckt bleibt). */
  function falschText(ich, e, verdeckt) {
    if (e.spielerId !== ich.id) return null;
    const keine = e.zeitUm || e.position < 0;
    const offen = typeof e.karte?.jahr !== "number" || verdeckt;
    if (keine && offen) return null;
    const tipp = keine ? "" : lueckenText(ich, e.position);
    if (offen) return `✗ Du hattest ${tipp} – das passt nicht.`;
    const j = e.karte.jahr;
    const i = ich.zeitstrahl.findIndex((k) => k.jahr > j);
    const richtig = lueckenText(ich, i < 0 ? ich.zeitstrahl.length : i);
    return keine ? `⏱ Keine Eingabe – ${j} gehört ${richtig}.` : `✗ Du hattest ${tipp} – ${j} gehört ${richtig}.`;
  }

  /** Lücke `i` als Text: „vor 1979“, „zwischen 1990 und 1993“, „nach 2018“ */
  function lueckenText(ich, i) {
    const links = ich.zeitstrahl[i - 1]?.jahr;
    const rechts = ich.zeitstrahl[i]?.jahr;
    return links === undefined ? `vor ${rechts}` : rechts === undefined ? `nach ${links}` : `zwischen ${links} und ${rechts}`;
  }

  /** tipp = schon getippte Lücke: bleibt bis zur Auflösung rot blinkend stehen */
  function zeitstrahlZeichnen(ich, darfLegen, tipp, neueSongId, vorschau = false) {
    const offen = darfLegen || vorschau;
    const teile = [];
    const getippt = (i) => el("div", { class: "luecke getippt", role: "status", text: `Dein Tipp: ${lueckenText(ich, i)}` });
    const luecke = (i) => {
      const text = lueckenText(ich, i);
      return el("button", {
        class: `luecke ${gewaehlt === i ? "gewaehlt" : ""} ${gewaehlt === i && frisch ? "frisch" : ""}`,
        type: "button",
        disabled: !darfLegen,
        text: gewaehlt === i ? `✓ ${text}` : text,
        onclick: () => {
          gewaehlt = i;
          vibrieren(15);
          frisch = true;
          darstellen();
          frisch = false;
        },
      });
    };
    ich.zeitstrahl.forEach((k, i) => {
      // zwischen zwei Karten desselben Jahres gibt es keinen Zwischenraum → keine Lücke (davor/danach zählt gleich)
      if (offen && ich.zeitstrahl[i - 1]?.jahr !== k.jahr) teile.push(luecke(i));
      else if (!offen && tipp === i) teile.push(getippt(i));
      teile.push(karteEl(k, k.songId === neueSongId ? "neu" : ""));
    });
    if (offen) teile.push(luecke(ich.zeitstrahl.length));
    else if (tipp === ich.zeitstrahl.length) teile.push(getippt(tipp));
    $("#zeitstrahl").replaceChildren(...teile);
  }

  $("#bestaetigen").addEventListener("click", async () => {
    if (gewaehlt === null) return;
    fehler("");
    const pos = gewaehlt;
    $("#bestaetigen").disabled = true;
    try {
      // mit „raten“ ist das Schritt 1: Jahr ist sicher gemerkt, Interpret und Titel folgen einzeln
      await socket.anfrage("spieler:legen", { position: pos, weiterRaten: Boolean(zustand?.einstellungen.raten) }); // Song läuft weiter bis zum Ende
    } catch (err) {
      fehler(err.message);
      $("#bestaetigen").disabled = false;
    }
  });
  for (const f of ["#rate-interpret", "#rate-titel"]) $(f).addEventListener("input", rateKnopf);
  $("#raten-felder").addEventListener("submit", async (e) => {
    e.preventDefault();
    fehler("");
    const knopf = $("#rate-weiter");
    knopf.disabled = true;
    try {
      const schritte = rateSchritte(zustand?.einstellungen);
      const naechster = schritte[schritte.indexOf(rateSchritt) + 1];
      const feld = rateSchritt === "interpret" ? $("#rate-interpret") : $("#rate-titel");
      await socket.anfrage("spieler:raten", { tipp: { [rateSchritt]: feld.value }, fertig: !naechster });
      if (naechster) {
        rateSchritt = naechster;
        vibrieren(15);
        darstellen();
      } else {
        vibrieren([30, 30, 30]);
        feld.blur();
      }
    } catch (err) {
      fehler(err.message);
      darstellen(); // Runde schon vorbei → zurück zum aktuellen Stand
    } finally {
      knopf.disabled = false;
    }
  });
  $("#abspielen").addEventListener("click", async () => {
    if (!audio.element.paused) return audio.stop();
    const weiter = audio.element.currentTime > 0 && !audio.element.ended;
    const ok = weiter ? await audio.element.play().then(() => true, () => false) : await audio.abspielen();
    if (!ok) fehler("Abspielen nicht möglich – bitte noch einmal tippen.");
  });
})();

// Endseite: zwischen „Beste der Runde“ und Bestenliste wechseln
let bestenAn = false;
function listeZeigen(beste) {
  bestenAn = beste;
  $("#ende-runde").classList.toggle("versteckt", beste);
  if (!$("#listen-wechsel").classList.contains("versteckt")) $("#bestenliste").classList.toggle("versteckt", !beste);
  for (const k of $("#listen-wechsel").querySelectorAll("button")) k.setAttribute("aria-selected", String((k.dataset.liste === "beste") === beste));
}
$("#listen-wechsel").addEventListener("click", (e) => {
  const k = e.target.closest("button[data-liste]");
  if (k) listeZeigen(k.dataset.liste === "beste");
});
