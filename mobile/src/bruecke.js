import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from "@capacitor/barcode-scanner";

let sitzung = null;
const bereit = Preferences.get({ key: "hityear-sitzung" }).then((d) => { sitzung = d.value; });
window.HitYearNative = {
  bereit,
  get sitzung() { return sitzung; },
  async sitzungSetzen(wert) {
    sitzung = wert;
    if (wert) await Preferences.set({ key: "hityear-sitzung", value: wert });
    else await Preferences.remove({ key: "hityear-sitzung" });
  },
  async vibrieren(dauer) { if (Capacitor.isNativePlatform()) await Haptics.vibrate({ duration: Math.min(1000, dauer) }); },
  async scannen() {
    const text = (s) => window.t?.(s) ?? s;
    try {
      const ergebnis = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: text("Halte die Kamera auf den QR-Code."),
        cancelButtonAccessibilityLabel: text("Abbrechen"),
      });
      return ergebnis.ScanResult;
    } catch (err) {
      if (err.code === "OS-PLUG-BARC-0006") return null;
      throw err;
    }
  },
};

if (Capacitor.isNativePlatform()) {
  // Der Startlink wird erst ausgeliefert, wenn alle gemeinsamen Seitenskripte bereit sind.
  const link = (url) => {
    const senden = () => window.dispatchEvent(new CustomEvent("hityear:link", { detail: url }));
    if (document.readyState === "complete") senden();
    else window.addEventListener("load", senden, { once: true });
  };
  App.addListener("appUrlOpen", ({ url }) => link(url));
  App.getLaunchUrl().then((d) => {
    // Mehrseitige Oberfläche: derselbe Kaltstart-Link darf nach der Navigation nicht erneut öffnen.
    if (d?.url && sessionStorage.getItem("hityear-startlink") !== d.url) {
      sessionStorage.setItem("hityear-startlink", d.url);
      link(d.url);
    }
  });
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("hityear:aktiv"));
  });
  App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) history.back(); else App.exitApp(); });
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest?.("a[href]");
    if (!a) return;
    const ziel = new URL(a.href);
    if ((ziel.protocol === location.protocol && ziel.host === location.host) || !/^https?:$/.test(ziel.protocol)) return;
    ev.preventDefault();
    Browser.open({ url: ziel.href }).catch(() => {});
  });
}
