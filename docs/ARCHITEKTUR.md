# Zeitstrahl – Technologie und Architektur

Stand: 31.10.2026 · gilt für den MVP in diesem Repo

## 1. Überblick

```
 Handys (1–6)            Host-Bildschirm (TV/Laptop)        Admin (Browser)
 /spielen.html           /host.html                         /admin.html
      │  WebSocket + HTTPS      │                                  │
      └───────────────┬─────────┴──────────────────────────────────┘
                      ▼
        Caddy (eigener, Profil „eigener-proxy“) oder Block im vorhandenen Proxy · TLS
                      │  127.0.0.1:3700
                      ▼
 ┌──────────────── Docker-Container „party-music“ ────────────────┐
 │ Node.js 22 (TypeScript ohne Build)                            │
 │  ├─ HTTP: statische Seiten, JSON-API, Audio, Cover, QR        │
 │  ├─ Socket.IO: Räume, Spielzustand pro Client gefiltert       │
 │  ├─ Spiel-Engine (reine Zustandsmaschine, server-autoritativ) │
 │  ├─ Bibliothek: Scan, Tags, Jahresermittlung, Stapel          │
 │  ├─ MusicBrainz-Abgleich (Hintergrund, 1 Anfrage/s)           │
 │  └─ Audio: ffmpeg schneidet Ausschnitte (ohne Metadaten)      │
 │ SQLite (node:sqlite) + Ausschnitt-Cache  → Volume /daten      │
 │ Musik (nur lesen)                         → /opt/party-music/musik │
 └───────────────────────────────────────────────────────────────┘
                      ▲ rsync (musik-sync.sh)
                 Mac mit der Musiksammlung
```

## 2. Technologie

| Ebene | Wahl | Warum |
|---|---|---|
| Laufzeit | **Node.js ≥ 22.18** | führt TypeScript direkt aus (Type Stripping), kein Build-Schritt; `node:sqlite` eingebaut |
| Sprache | TypeScript (strict, `erasableSyntaxOnly`) | Typprüfung mit `tsc --noEmit`, läuft trotzdem ohne Kompilat |
| Echtzeit | **Socket.IO 4** | Räume, Reconnect, Fallback auf Polling, Acks |
| HTTP | `node:http` (ohne Framework) | wenige Routen, volle Kontrolle über Header/Range |
| Datenbank | **SQLite** über `node:sqlite` (WAL) | ein Prozess, eine Datei, keine nativen Pakete |
| Tags | `music-metadata` | MP3/M4A/FLAC/OGG/Opus, Cover, Dauer |
| Audio | **ffmpeg** (libmp3lame, loudnorm, afade) | Ausschnitte, Lautheit angleichen, Metadaten entfernen |
| QR-Code | `qrcode` (SVG, serverseitig) | keine Fremd-Requests im Browser |
| Jahre | **MusicBrainz-API** + Jahrescharts-CSV | Originaljahr statt Remaster-/Compilation-Jahr |
| Frontend | HTML + CSS + Vanilla JS (keine Bundler) | klein, schnell auf alten Handys, CSP ohne `unsafe-inline` |
| Betrieb | **Docker Compose**, eigener Bereich `/opt/party-music` | getrennt von anderen Diensten, einfache Updates |
| TLS | eigener Caddy (`party-music-caddy`) oder Block im vorhandenen Proxy | automatisches HTTPS (Let's Encrypt) |
| Tests | `node:test`, E2E mit `socket.io-client`, Playwright | ohne zusätzliche Test-Frameworks |

## 3. Module (`src/`)

| Datei | Aufgabe |
|---|---|
| `server.ts` | HTTP-Server, Routen, Sicherheits-Header, Start (Charts laden, Räume wiederherstellen, Scan) |
| `game.ts` | Spielregeln als reine Funktionen: beitreten, starten, Karte legen, nächster Zug, Stechen, Sicht ohne Geheimnisse |
| `raeume.ts` | Socket.IO-Ereignisse, Rollen (Host/Spieler), Zustand pro Client filtern, Snapshot in SQLite |
| `bibliothek.ts` | Ordner-Scan (inkrementell), Jahresregeln, Chart-Abgleich, Stapel ziehen (wenig Wiederholung) |
| `musicbrainz.ts` | Abgleich im Hintergrund, frühestes passendes `first-release-date` |
| `audio.ts` | Startpunkt wählen, ffmpeg-Ausschnitt, opake Einmal-Token, Cache-Begrenzung |
| `vorschau.ts` | Aktuelle Vorschau-Links, Ersatzsuche und HEAD-Prüfung ohne Mediendownload |
| `deckpruefung.ts` | Gemeinsame Vorabprüfung ausgewählter Decks, höchstens zwei Songs gleichzeitig |
| `auth.ts` | Passwort-Login, HMAC-Cookie, Login-Rate-Limit, Client-IP hinter Proxy |
| `db.ts` / `config.ts` / `normalisieren.ts` | Schema, Umgebungsvariablen, Text-Normalisierung |

## 4. Datenmodell (SQLite)

Bei der Deck-Auswahl startet im Hintergrund eine Prüfung der bereits zugeordneten Streaming-Songs.
Die Lobby zeigt ausschließlich Fortschritt und Summen, keine verdeckten Songdaten. Neue Treffer aus
dem bestehenden Nachladen fehlender Deck-Einträge werden ebenfalls geprüft. Ein Deckwechsel verwirft
noch nicht begonnene Arbeit, soweit kein anderer Raum das Deck nutzt. Der Spielstart wartet nicht
auf das gesamte Deck; bei großen Listen kann die Prüfung während des Spiels weiterlaufen.

Die Prüfung verwendet HEAD-Anfragen mit Zeitlimit und prüft jedes Weiterleitungsziel gegen die
Musikdienst-Domains. Defekte Links werden neu aufgelöst; ersatzweise wird nach Interpret und Titel
gesucht. Es werden keine Hörproben heruntergeladen oder gespeichert. Bestätigt fehlende Vorschauen
werden für fünf Minuten nicht neu in den Stapel aufgenommen und aus noch ungespielten Karten entfernt.
Timeouts, Drosselung und nicht unterstützte HEAD-Anfragen gelten als unklar und sperren keine Songs.
Prüfergebnisse werden nur kurz im Speicher wiederverwendet; die Link-Erneuerung beim Abspielen bleibt
maßgeblich, da eine Vorabprüfung weder spätere Ausfälle noch die Verbindung des Endgeräts garantieren kann.

- `songs`: Pfad, Tags, Dauer, `tag_jahr`, `mb_jahr`, `chart_jahr`/`chart_platz`, `manuell_jahr`, daraus `jahr` + `jahr_quelle`, Prüfflag mit Grund, ausgeschlossen
- `gespielt`: Song-ID + Zeitpunkt (gegen Wiederholungen über mehrere Spiele)
- `spiele`: kompletter Spielzustand als JSON (überlebt Neustarts, nach 2 Tagen gelöscht)

**Jahresregel:** manuell > MusicBrainz (wenn ≤ Tag-Jahr) > Tag-Jahr > Chartjahr. Größere Abweichungen landen in der Prüfliste.

## 5. Ablauf eines Zugs

1. Server zieht die nächste Karte, erzeugt per ffmpeg einen Ausschnitt und ein zufälliges Token.
2. Nur das Wiedergabegerät (Host **oder** aktiver Spieler) bekommt `/api/audio/<token>`. Titel, Jahr und Song-ID bleiben auf dem Server.
3. Der aktive Spieler tippt eine Lücke an → `spieler:legen {position}`.
4. Der Server prüft (gleiches Jahr zählt, Toleranz pro Spieler), entwertet das Token und sendet die Auflösung an alle.
5. „Weiter“ (Host oder aktiver Spieler). Am Rundenende wird der Sieg geprüft; bei Gleichstand gibt es ein Stechen.

## 6. Sicherheit und Datenschutz

- Privater Kreis: Mitspieler-Passwort, separates Admin-Passwort, Cookie `HttpOnly`/`SameSite=Lax`/`Secure`
- Login-Rate-Limit (10 Versuche / 10 min pro IP). Die IP kommt nur aus dem rechten `X-Forwarded-For`-Eintrag.
- Anti-Cheat: keine Metadaten im Ausschnitt, Einmal-URLs, Cover erst nach der Auflösung
- CSP ohne Inline-Skripte, `X-Frame-Options: DENY`, `noindex` + `robots.txt`
- Container: read-only, `cap_drop: ALL`, `no-new-privileges`, nur `127.0.0.1:3700`, Speicher-/CPU-Limit
- Secrets nur in `/opt/party-music/.env` (600); in Produktion startet der Dienst ohne sie nicht
- Keine Nutzerkonten, keine personenbezogenen Daten außer frei gewählten Spielernamen

## 7. Betrieb auf netcup

| Thema | Lösung |
|---|---|
| Verzeichnis | `/opt/party-music/{app,musik,.env,docker-compose.yml}` |
| Ausrollen | `deploy/ausrollen.sh` (rsync + `docker compose up -d --build` + Healthcheck) |
| Musik | `deploy/musik-sync.sh ~/Music/…` → Neustart → inkrementeller Scan |
| HTTPS | Block aus `deploy/proxy/` in den vorhandenen Caddy/nginx übernehmen |
| Ressourcen | ab 2 vCPU / 4 GB RAM; Speicher ≈ 7 MB pro Song + ≤ 2 GB Cache |
| Backup | Volume `zeitstrahl_daten` (Jahre, Korrekturen); die Musik liegt im Original auf dem Mac |
| Logs | `docker logs party-music` (rotiert, 3 × 10 MB) |

## 8. Grenzen und nächste Schritte

- Ausgelegt auf **einen** Prozess und wenige gleichzeitige Räume. Für mehr Last bräuchte es Redis für Socket.IO und Rate-Limit.
- Backlog: Token/eigene Joker-Regel, „Höher oder tiefer“ (Chartplatz), Künstlerbild (Wikidata/Commons mit Lizenz), Song-Geschichte, Liedtext aus Tags, Statistik am Ende, PWA, Englisch
- Charts 1954–1976 fehlen noch (Quellen in `docs/QUELLEN.md`)
