"use strict";
// ---------- Sprachen ----------
// Quelltexte bleiben Deutsch. Dieses Skript übersetzt alles, was auf der Seite landet (Text, Platzhalter,
// aria-label, title) – auch Texte, die erst später per JS oder vom Server kommen.
// Die Übersetzungen liegen je Sprache in /js/sprachen/<code>.js (Schlüssel = deutscher Text). Geladen wird nur die
// gewählte Sprache, direkt nach diesem Skript und noch vor den Seitenskripten – so bleibt die Seite auf TVs und
// alten Handys schlank. Schlüssel mit {0}, {1} … sind Muster: die eingesetzten Teile werden selbst wieder übersetzt.

// Reihenfolge = Reihenfolge im Menü; die ersten neun haben am TV eine Zifferntaste
const SPRACHEN = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "es", name: "Español" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "pt-PT", name: "Português (Portugal)" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "sv", name: "Svenska" },
  { code: "nb", name: "Norsk" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "cs", name: "Čeština" },
  { code: "sk", name: "Slovenčina" },
  { code: "hu", name: "Magyar" },
  { code: "ro", name: "Română" },
  { code: "bg", name: "Български" },
  { code: "el", name: "Ελληνικά" },
  { code: "hr", name: "Hrvatski" },
  { code: "sr", name: "Srpski" },
  { code: "sq", name: "Shqip" },
  { code: "ca", name: "Català" },
  { code: "ja", name: "日本語" },
  { code: "he", name: "עברית" },
  { code: "ar", name: "العربية" },
];

/** Sprachkürzel des Browsers (z. B. „pt-PT“, „no“, „iw“) → unser Code, sonst null */
function spracheZuCode(tag) {
  const l = String(tag ?? "").toLowerCase();
  const genau = SPRACHEN.find((s) => s.code.toLowerCase() === l);
  if (genau) return genau.code;
  const kurz = l.slice(0, 2);
  if (kurz === "pt") return "pt-BR";
  if (kurz === "no" || kurz === "nn") return "nb";
  if (kurz === "iw") return "he";
  if (kurz === "sh" || kurz === "bs") return "hr";
  return SPRACHEN.find((s) => s.code === kurz)?.code ?? null;
}

const SPRACHE = (() => {
  // ?lang=tr im Link wählt die Sprache und merkt sie (zum Teilen oder für den Fernseher)
  const ausLink = spracheZuCode(new URLSearchParams(location.search).get("lang"));
  try {
    if (ausLink) localStorage.setItem("zs_sprache", ausLink);
    const gewaehlt = localStorage.getItem("zs_sprache");
    if (SPRACHEN.some((s) => s.code === gewaehlt)) return gewaehlt;
  } catch {
    /* privates Fenster */
    if (ausLink) return ausLink;
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = spracheZuCode(l);
    if (code) return code;
  }
  return "de";
})();

function spracheSetzen(code) {
  try {
    localStorage.setItem("zs_sprache", code);
  } catch {
    /* egal */
  }
  // ein ?lang= im Link würde die neue Wahl sonst gleich wieder überschreiben
  const url = new URL(location.href);
  url.searchParams.delete("lang");
  location.replace(url);
}

const UEBERSETZER = { genau: new Map(), muster: [], aktiv: false };

/** Aufruf aus /js/sprachen/<code>.js: Tabelle Deutsch → Sprache übernehmen und die Seite übersetzen. */
function uebersetzungLaden(tabelle) {
  const flucht = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [de, ziel] of Object.entries(tabelle)) {
    if (!ziel) continue;
    if (/\{\d\}/.test(de)) {
      const quelle = "^" + flucht(de).replace(/\\\{(\d)\\\}/g, "(?<p$1>.+?)") + "$";
      UEBERSETZER.muster.push({ re: new RegExp(quelle, "s"), ziel, gewicht: de.replace(/\{\d\}/g, "").length });
    } else if (ziel !== de) UEBERSETZER.genau.set(de, ziel);
  }
  UEBERSETZER.muster.sort((a, b) => b.gewicht - a.gewicht); // spezifischere Muster zuerst
  UEBERSETZER.aktiv = true;
  seiteUebersetzen();
}

/** Text übersetzen (Deutsch → aktuelle Sprache). Unbekanntes bleibt, wie es ist. */
function t(text, tiefe = 0) {
  if (!UEBERSETZER.aktiv || typeof text !== "string") return text;
  const s = text.trim();
  if (!s || !/\p{L}/u.test(s)) return text;
  const treffer = UEBERSETZER.genau.get(s);
  if (treffer !== undefined) return text.replace(s, treffer);
  if (tiefe > 2) return text;
  for (const { re, ziel } of UEBERSETZER.muster) {
    const m = re.exec(s);
    if (!m) continue;
    const neu = ziel.replace(/\{(\d)\}/g, (_, i) => t(m.groups[`p${i}`] ?? "", tiefe + 1));
    return text.replace(s, neu);
  }
  return text;
}

// ---------- Seite automatisch übersetzen ----------
function seiteUebersetzen() {
  const ATTRIBUTE = ["placeholder", "aria-label", "title", "alt"];
  const zuletzt = new WeakMap(); // Knoten → zuletzt gesetzter Text (verhindert Schleifen)
  const textKnoten = (n) => {
    if (zuletzt.get(n) === n.nodeValue) return;
    const p = n.parentNode;
    if (p && (p.nodeName === "SCRIPT" || p.nodeName === "STYLE")) return;
    // translate="no": bleibt, wie es ist (Wortmarke, fertige Posttexte)
    if (p?.closest?.('[translate="no"]')) return;
    const neu = t(n.nodeValue);
    zuletzt.set(n, neu);
    if (neu !== n.nodeValue) n.nodeValue = neu;
  };
  const attribute = (e) => {
    if (e.closest('[translate="no"]')) return;
    for (const a of ATTRIBUTE) {
      const v = e.getAttribute(a);
      if (!v) continue;
      const neu = t(v);
      if (neu !== v) e.setAttribute(a, neu);
    }
  };
  const baum = (wurzel) => {
    if (wurzel.nodeType === 3) return textKnoten(wurzel);
    if (wurzel.nodeType !== 1) return;
    attribute(wurzel);
    const gang = document.createTreeWalker(wurzel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = gang.nextNode(); n; n = gang.nextNode()) n.nodeType === 3 ? textKnoten(n) : attribute(n);
  };
  baum(document.documentElement);
  new MutationObserver((liste) => {
    for (const m of liste) {
      if (m.type === "characterData") textKnoten(m.target);
      else if (m.type === "attributes") attribute(m.target);
      else for (const n of m.addedNodes) baum(n);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTE });
}

document.documentElement.lang = SPRACHE;
// Sprachdatei synchron nachladen: Sie läuft direkt nach diesem Skript und vor allen Seitenskripten
// (gleiche Herkunft, also auch mit der Content-Security-Policy erlaubt)
if (SPRACHE !== "de") document.write(`<script src="/js/sprachen/${SPRACHE}.js"><\/script>`);
