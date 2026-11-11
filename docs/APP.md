# HitYear für Android und iOS

Die native App verwendet Capacitor 8 und dieselben Vanilla-JS-Seiten wie die Website. HTML, CSS, Schriften, JavaScript und Socket.IO liegen im App-Paket. Räume, Spielstände, Bibliothek und Hörproben benötigen weiterhin den laufenden HitYear-Server. Die Website braucht weiterhin keinen Build-Schritt.

## Stand der ersten Umsetzung

- Android-Projekt: `mobile/android`, Android 8.0 (API 26) oder neuer.
- iOS-Projekt: `mobile/ios/App/App.xcodeproj`, iOS 15 oder neuer, Swift Package Manager.
- App-ID: `app.hityear.mobile`, Anzeigename: HitYear, erste Testversion: 0.1.0.
- Eigene App-Sitzungen ohne Drittanbieter-Cookies; Website-Anmeldung bleibt erhalten.
- Native QR-Kamera, Haptik, externe Links im Systembrowser, Android-Zurück-Taste, Wiederverbindung nach Rückkehr in die App.
- Einladungen aus QR-Codes und `hityear://join?raum=ABCD&einladung=…` werden geprüft und innerhalb der App geöffnet.
- Icons und Startbilder stammen aus dem vorhandenen HitYear-Logo.
- Kein Offline-Spiel und kein Herunterladen von Hörproben. Die erste native Version lädt kein Matomo.

**Vor der Nutzung gegen den öffentlichen Spielserver müssen auch die Backend-Änderungen dieser Umsetzung ausgerollt sein.** Ein neues App-Paket allein reicht für App-Anmeldung und geschützte Medien nicht aus. Diese Anleitung ist keine Bestätigung eines Deployments oder einer Store-Veröffentlichung.

## Vorbereiten

Voraussetzungen: Node.js ab 22.18; Android Studio mit SDK 36 und JDK 21 bzw. für iOS ein Mac mit Xcode 26 oder neuer.

```sh
npm ci
npm --prefix mobile ci
npm run mobile:sync
```

`mobile:sync` baut `mobile/www`, bündelt nur die native Plugin-Brücke und kopiert die Dateien in beide nativen Projekte. Es wird keine entfernte Website als Startseite konfiguriert. Die Standard-API-Origin ist `https://hityear.app`. Bei geänderten Webdateien vor jedem nativen Build erneut synchronisieren.

```sh
npm --prefix mobile run android
npm --prefix mobile run ios
```

Android Studio öffnet das Android-Projekt, Xcode das iOS-Projekt. Auf Windows lässt sich der Android-Build nach `mobile:sync` mit `mobile\android\gradlew.bat assembleDebug` starten.

### Android-Testdatei

```sh
npm --prefix mobile run build:android
```

Ergebnis: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Das ist eine Debug-App zum Testen. Für Google Play braucht es später ein signiertes Release-App-Bundle, einen privaten Upload-Schlüssel und das Play-Console-Konto. Signaturen gehören nicht ins Repo.

### iOS

In Xcode das Team für `app.hityear.mobile` auswählen und auf einem Simulator oder angeschlossenen iPhone starten. Ein Simulator-Build benötigt keine Distributionssignatur:

```sh
xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Für TestFlight/App Store sind ein Apple-Developer-Team, ein App-Store-Connect-Eintrag und signiertes Archiv nötig. Unter Linux kann das iOS-Projekt vorbereitet, aber nicht mit Xcode kompiliert oder auf einem iPhone getestet werden.

## Server und Anmeldung

`ZEITSTRAHL_APP_ORIGINS` erlaubt standardmäßig genau `capacitor://localhost` (iOS) und `https://localhost` (Android). Zusätzliche Entwicklungs-Origins werden kommasepariert ausdrücklich eingetragen; keine Wildcard. Keine CORS-Credentials.

App-Login und QR-Einladung liefern eine HMAC-signierte, zweckgebundene Sitzung mit maximal 14 Tagen Laufzeit. Die App speichert sie mit Capacitor Preferences und sendet sie als `Authorization: Bearer …` bzw. im Socket.IO-Handshake. Preferences ist geräteinterner App-Speicher, kein verschlüsselter Schlüsselbund. Die Android-App nimmt nicht am automatischen Backup teil. Abmelden entfernt die lokale Sitzung; wie bei den bisherigen Browser-Sitzungen gibt es keine serverseitige Einzelwiderrufsliste. Ein Wechsel des Sitzungsschlüssels beendet alle Sitzungen.

Audio- und Bild-Elemente können keine eigenen Authorization-Header senden. Daher fordert die App für genau einen Medienpfad eine fünf Minuten gültige Freigabe an. Sie gilt nur für GET/HEAD und die signierten Query-Parameter. Ein solcher Link ersetzt keine API- oder Socket-Sitzung. Vorhandene Regeln zur Freigabe von Covern und Ausschnitten bleiben wirksam. Der ursprüngliche Ausschnittpfad bleibt für Spielaktionen erhalten. Hörproben werden direkt gestreamt; das App-Paket enthält keine Musik.

## Entwicklung und Tests

Für einen anderen Server beim Synchronisieren `HITYEAR_API_URL` setzen. Erlaubt sind HTTPS-Origins ohne Pfad, Passwort oder Query; HTTP ist ausschließlich für localhost, 127.0.0.1 und den Android-Emulatorhost 10.0.2.2 zugelassen. Native Release-Konfigurationen bleiben HTTPS-only; für Tests auf echten Geräten einen erreichbaren HTTPS-Testserver verwenden. Ein lokaler HTTP-Browserlauf ist mit dem App-Test möglich:

```sh
npm run typecheck
npm test
npm run test:e2e
npx playwright install chromium
npm run test:browser
npm run test:mobile
```

Alternativ `CHROMIUM_EXECUTABLE=/pfad/zu/chromium` setzen. Der App-Test liefert das echte gebündelte App-Webpaket auf einer eigenen Origin aus und prüft CORS, Anmeldung ohne Cookies, Website-Host + App-Gast, QR-Einladungsfluss, Socket.IO, geschützte Medien, erneuten Beitritt und Abmelden. Der Kamerascan wird dabei ersetzt; Audio-Hardware und native Plugins werden dadurch nicht auf echten Geräten getestet.

`.github/workflows/apps.yml` prüft auf Pull Requests das Webpaket und baut Android sowie einen unsignierten iOS-Simulatorstand. Die iOS-App wird außerdem im iPhone-Simulator installiert und gestartet; ein Bildschirmfoto und das Simulatorpaket werden als Build-Artefakt gespeichert. Dieses Paket läuft im Simulator auf einem Mac, nicht auf einem echten iPhone. Der Workflow verteilt keine App über die Stores. Icons bei einer Logoänderung mit `npm --prefix mobile run icons` neu erzeugen.

## Vor einer öffentlichen App-Verteilung

1. Backend bereitstellen und Android/iOS gegen denselben HTTPS-Server prüfen: neuer Raum, Einladung, komplette Runde, Gerätewechsel, Funkloch und Wiederverbindung.
2. Native Kamera mit erteilter/abgelehnter Berechtigung und Abbruch testen; Namen-/Codeeingabe bleibt verfügbar. iOS-Kamerahinweis und Privacy-Manifest sind vorbereitet.
3. Audio auf iPhone und Android prüfen: erster Play-Tipp, Songwechsel, Autoplay-Sperre, Bluetooth-Ausgabe, Unterbrechung durch Anruf und Rückkehr aus dem Hintergrund. Hintergrundwiedergabe ist nicht eingerichtet.
4. Einladungen bei geschlossenem und geöffnetem App-Prozess testen. HTTPS-Einladungen öffnen außerhalb des App-Scanners weiterhin die Website. Verifizierte Universal Links/App Links benötigen Apple-Team-ID und Android-Signatur-Fingerabdruck; erst damit die Domain-Dateien und Associated Domains ergänzen. Keine Platzhalter-Zertifikate veröffentlichen.
5. App-ID vor der ersten Store-Einreichung im gewünschten Entwicklerkonto prüfen; dann Signierung, Store-Screenshots, Datenschutzangaben und die Nutzung der Musikdienste für die native Veröffentlichung abschließen. Eine Store-Zulassung wurde nicht geprüft oder zugesichert.
