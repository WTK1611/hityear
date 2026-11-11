"use strict";
// Website und installierte App teilen dieselben Seiten. Nur die App hat eine explizite Serveradresse.
const appKonfiguration = window.HITYEAR_APP ?? null;
const appServer = appKonfiguration ? new URL(appKonfiguration.server).origin : null;
const appBereit = window.HitYearNative?.bereit ?? Promise.resolve();
const medienAdressen = new Map();

function serverAdresse(pfad) {
  if (!appServer) return pfad;
  if (typeof pfad !== "string" || !pfad.startsWith("/") || pfad.startsWith("//")) throw new Error("Ungültiger Serverpfad.");
  const ziel = new URL(pfad, appServer);
  if (ziel.origin !== appServer) throw new Error("Ungültiger Serverpfad.");
  return ziel.href;
}

function appScanKnopf(meldung) {
  if (!appServer || !window.HitYearNative) return null;
  const knopf = el("button", { type: "button", class: "zweit app-scannen", text: "QR-Code scannen", onclick: async () => {
    knopf.disabled = true;
    meldung.textContent = "";
    try {
      const wert = await window.HitYearNative.scannen();
      if (!wert) return;
      const ziel = einladungsZiel(wert);
      if (ziel) location.assign(ziel);
      else meldung.textContent = "Raum nicht gefunden. Code prüfen.";
    } catch {
      meldung.textContent = "Kein Zugriff auf die Kamera. Erlaube die Kamera oder gib den Code ein.";
    } finally { knopf.disabled = false; }
  } });
  return knopf;
}

async function serverAnfrage(pfad, optionen = {}) {
  if (!appServer) return fetch(pfad, optionen);
  await appBereit;
  const header = new Headers(optionen.headers);
  header.set("X-Hityear-App", "1");
  const sitzung = window.HitYearNative?.sitzung;
  if (sitzung) header.set("Authorization", `Bearer ${sitzung}`);
  try {
    const res = await fetch(serverAdresse(pfad), { ...optionen, headers: header, credentials: "omit" });
    if (res.status === 401 && pfad !== "/api/login" && window.HitYearNative?.sitzung === sitzung) {
      medienAdressen.clear();
      await window.HitYearNative?.sitzungSetzen(null);
    }
    if (res.ok && (pfad === "/api/login" || pfad === "/api/einladung")) {
      const d = await res.clone().json();
      if (d.appSitzung) {
        medienAdressen.clear();
        await window.HitYearNative?.sitzungSetzen(d.appSitzung);
      }
    }
    return res;
  } finally {
    if (pfad === "/api/logout") {
      medienAdressen.clear();
      await window.HitYearNative?.sitzungSetzen(null);
    }
  }
}

async function medienAdresse(pfad, erneuern = false) {
  if (!appServer || !pfad?.startsWith("/api/")) return pfad;
  if (erneuern) medienAdressen.delete(pfad);
  const alt = medienAdressen.get(pfad);
  if (alt?.bis > Date.now()) return alt.url;
  const res = await serverAnfrage("/api/app/medien", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pfad }),
  });
  if (!res.ok) throw new Error("Hörprobe konnte nicht geladen werden.");
  const d = await res.json();
  const url = serverAdresse(d.url);
  medienAdressen.set(pfad, { url, bis: Date.now() + 4 * 60_000 });
  return url;
}

function medienSetzen(element, pfad) {
  element.dataset.medienPfad = pfad;
  if (!appServer) { element.src = pfad; return; }
  medienAdresse(pfad).then((url) => {
    if (element.dataset.medienPfad === pfad) element.src = url;
  }, () => element.dispatchEvent(new Event("error")));
}

/** Nur eigene Einladungslinks oder das registrierte App-Schema dürfen innerhalb der App navigieren. */
function einladungsZiel(wert) {
  try {
    const url = new URL(wert);
    const eigen = url.origin === (appServer ?? location.origin);
    const kurz = eigen && /^\/s\/([A-Za-z0-9]{4,6})\.([A-Za-z0-9_-]{6,32})$/.exec(url.pathname);
    if (kurz) return `/spielen.html?raum=${kurz[1].toUpperCase()}&einladung=${kurz[2]}`;
    if (!(eigen && url.pathname === "/spielen.html") && !(url.protocol === "hityear:" && url.hostname === "join" && !url.username && !url.password)) return null;
    const raum = url.searchParams.get("raum") ?? "";
    const einladung = url.searchParams.get("einladung");
    if (!/^[A-Za-z0-9]{4,6}$/.test(raum) || (einladung !== null && !/^[A-Za-z0-9_-]{6,32}$/.test(einladung))) return null;
    return `/spielen.html?raum=${raum.toUpperCase()}${einladung ? `&einladung=${einladung}` : ""}`;
  } catch { return null; }
}

if (appServer) {
  document.documentElement.classList.add("native-app");
  addEventListener("hityear:link", (ev) => {
    const ziel = einladungsZiel(ev.detail);
    if (ziel) location.assign(ziel);
  });
  // Die lokal eingebaute Oberfläche bleibt auch bei einem nicht erreichbaren Server verständlich.
  addEventListener("unhandledrejection", (ev) => {
    if (!(ev.reason instanceof TypeError) || !/fetch|network|load/i.test(ev.reason.message)) return;
    ev.preventDefault();
    if (document.querySelector(".app-verbindung")) return;
    const box = document.createElement("div");
    box.className = "box audio-hilfe app-verbindung";
    box.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.textContent = "Keine Verbindung zum Server.";
    const knopf = document.createElement("button");
    knopf.textContent = "Erneut versuchen";
    knopf.onclick = () => location.reload();
    box.append(text, knopf);
    document.body.append(box);
  });
}

for (const bild of document.querySelectorAll("[data-server-src]")) {
  if (!(appServer && bild.closest(".qr-start"))) medienSetzen(bild, bild.dataset.serverSrc);
}
