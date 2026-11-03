# 🎵 HitYear – Music Party Game

**English** · [Deutsch](README.de.md)

![HitYear home page: "When did the song come out?" with join and create buttons](docs/bilder/startseite.jpg)

**When did the song come out?** A clip plays, everyone listens, and each player places the song on their phone into their own timeline by release year. The first to get enough cards in the right spot wins.

- 1–6 players, each on their own phone: scan the QR code or type the room code. No app. Optionally a shared password protects the whole app; the QR code lets guests in without it.
- One main screen (TV, laptop, projector) shows the QR code, the music player, all players and the reveal.
- Music comes as 30-second previews that the browser streams **directly from Deezer** (Apple Music as a fallback) – the server stores no music. Optionally your own collection, from which the server cuts short clips.
- Interface in 🇩🇪 Deutsch, 🇬🇧 English, 🇫🇷 Français, 🇮🇹 Italiano, 🇪🇸 Español and 🇧🇷 Português (Brasil).

Repo: <https://github.com/WTK1611/hityear> · License: [PolyForm Noncommercial 1.0.0](LICENSE.md) (free to use, modify and share – **not commercially**) · [Contributions welcome](CONTRIBUTING.md)

## Screenshots

| Main screen: choosing a deck | Phone |
|---|---|
| ![Deck selection on the main screen](docs/bilder/host-decks.jpg) | ![Phone view](docs/bilder/handy.jpg) |

---

## How to play

1. **Start:** Every player gets one face-up starting card (a song with its year) on their timeline.
2. **Listen:** After a countdown (3 · 2 · 1) a clip plays on all devices at the same moment.
3. **Place:** Tap the gap in your timeline where the song belongs and confirm. Same year as a neighbouring card counts as correct.
4. **Reveal:** Title, artist, year and cover appear. Whoever was right adds the card to their timeline.
5. **Bonus stars ⭐ (optional):** After the year, also guess the artist and/or the title. Each hit earns a star.
6. **Winning:** The first player to reach the target (10, 15 or 20 cards) wins right away. On a tie the ⭐ decide; if those are equal too, the leaders win together.
7. After the reveal the game moves on automatically after 10 seconds. There is no skipping, so everyone sees the reveal equally long.

### Lobby settings

| Setting | Options |
|---|---|
| Cards to win | 10 · 15 · 20 |
| Music plays … | **Party in the room** (on the main screen) · **Online** (on every phone) |
| Time to place | until everyone has chosen · until the clip ends |
| Whose turn? | everyone at once · one player at a time |
| Round ends (everyone at once) | when everyone has tapped · 5 s later · with the first answer |
| Not guessed | show or hide the answer; the song comes back later or not |
| What do you guess? | year only · + title · + artist · + both |
| Deck | whole library or a custom deck |
| Tolerance per player | exact · ±1 · ±2 · ±3 · ±5 years (for kids or beginners) |
| AI bots | fill free seats up to 6 with bots; the app rolls name and strength (easy, medium, pro) |

---

## Features

| Area | What it does |
|---|---|
| **Joining** | 4-character room code (S/5, Z/2, B/8 mix-ups are tolerated) or QR code with an invite token; camera scan on the home page |
| **In sync** | Server-authoritative state, shared start time on the server clock, clock sync via ping, state counter checked every 2 s with a liveness reply (no reply → reconnect at once), targeted re-check at reveal and next song, handshake before every song change (at most 10 s “Waiting for …”), notice when the connection drops |
| **Phone performance** | The heavy animated background runs only on the main screen; phones get a calm static gradient without blur (the heavy background froze iPhones for 10–27 s at every song change) |
| **Debugging** | Devices report page freezes, disconnects and missing replies to the server log (`[diagnose]`, `[verbindung]`, `[bereit]`) |
| **Legal** | Legal notice, privacy policy, terms of use, footer links, one-time cookie notice (no tracking) |
| **Main screen** | QR code, spinning record that shakes to the bass, equalizer, progress bar, player grid with live status (thinking, placed, guessing), result banners with stars, “+1” animations, confetti, leaderboard |
| **Phone** | Tappable personal timeline, countdown, guided guessing (year → artist → title), vibration, screen stays awake (Wake Lock) |
| **TV-friendly** | Bundled font (Nunito), SVG icons instead of special characters, overscan margins, remote-control navigation (arrow keys + OK) |
| **Anti-cheat** | Clips without metadata behind one-time URLs; title and year only reach devices with the reveal |
| **Audio** | Previews streamed directly from Deezer (Apple Music as a fallback) with a source badge; for own files: random start at 20–60 % of the song, fade in/out, loudness normalisation (`loudnorm`) |
| **Library** | Apple/Deezer previews as entries (no files), optional scan of own files (MP3, M4A, FLAC, OGG, Opus), year from manual entry > song list (original year) > tag or Apple/Deezer > year-end charts, review list, duplicates, exclude songs |
| **Decks** | Build custom decks; import Deezer/Apple Music playlists or your own song lists (CSV) |
| **Trivia** | Your own stories per song |
| **Languages** | 6 languages; flag switcher at the top right of the home page, otherwise the browser language |
| **App feel** | Web app manifest and icons (add to home screen) |

---

## Architecture

```
 Phones (1–6)            Main screen (TV/laptop)            Library (browser)
 /spielen.html           /host.html                         /admin.html
      │  Socket.IO + HTTPS      │                                  │
      └───────────────┬─────────┴──────────────────────────────────┘
                      ▼
              Reverse proxy (e.g. Caddy) · TLS
                      ▼
 ┌──────────────── Docker container ─────────────────────────────┐
 │ Node.js ≥ 22.18 (runs TypeScript directly, no build)           │
 │  ├─ HTTP: pages, JSON API, audio (range), covers, QR           │
 │  ├─ Socket.IO: rooms, state filtered per device                │
 │  ├─ Game engine: pure state machine (game.ts)                  │
 │  ├─ Library: scan, tags, year detection, decks                 │
 │  ├─ Previews: redirect to Apple Music/Deezer (nothing stored)  │
 │  └─ ffmpeg: clips without metadata (own files only)            │
 │ SQLite (node:sqlite, WAL) + clip cache → volume /daten         │
 │ Music (read-only) → /musik                                     │
 └────────────────────────────────────────────────────────────────┘
```

| Layer | Choice |
|---|---|
| Server | Node.js ≥ 22.18, TypeScript (strict, no build step), plain `node:http` |
| Real time | Socket.IO 4 with connection state recovery (2 min) and a 5 s ping |
| Data | SQLite via `node:sqlite` |
| Audio | ffmpeg (libmp3lame, loudnorm, afade) |
| Frontend | HTML, CSS and vanilla JS without a bundler; translations in `public/js/i18n.js` |
| Operations | Docker Compose behind a reverse proxy; deployment via GitHub Actions |

### Modules (`src/`)

| File | Purpose |
|---|---|
| `server.ts` | HTTP server, routes, security headers, startup |
| `game.ts` | Game rules as pure functions (join, start, place, guess, score, win) |
| `raeume.ts` | Socket.IO events, roles, turn schedule, bots, snapshots in SQLite |
| `bibliothek.ts` | Scan, year rules, chart matching, drawing the deck |
| `audio.ts` | Cutting clips, one-time tokens, cache |
| `apple.ts`, `deezer.ts` | Online previews |
| `listen.ts`, `playlist.ts` | Song lists and decks |
| `auth.ts`, `bestenliste.ts`, `db.ts`, `config.ts`, `normalisieren.ts` | Login, leaderboard, schema, configuration, text matching |

### Frontend (`public/`)

| File | Purpose |
|---|---|
| `index.html` + `js/start.js` | Home page: enter code, scan QR, create game, language switcher |
| `host.html` + `js/host.js` | Main screen: lobby, player, players, reveal |
| `spielen.html` + `js/spielen.js` | Phone: join, place, guess |
| `admin.html` + `js/admin.js` | Library, decks (German only) |
| `js/gemeinsam.js` | Shared building blocks: socket, clock sync, player, equalizer, countdown, remote control |
| `js/i18n.js` | Languages: translates every text on the page via a table (German → target language) |

The source code, comments and identifiers are in German. More detail (German): [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

---

## Run locally

Requirements: Node.js ≥ 22.18 and `ffmpeg`.

```bash
npm install
npm run testmusik   # test songs into ./musik (or put your own music there)
npm run dev         # http://localhost:3700
```

Checks:

```bash
npm run typecheck && npm test
```

## Operations

- Docker image from the `Dockerfile`, Compose file under `deploy/`. Configuration comes from a `.env` (template: [`deploy/.env.example`](deploy/.env.example)); `deploy/ausrollen.sh` creates it with random values on first run.
- The container only listens on `127.0.0.1`; the game is public only via HTTPS behind a reverse proxy.
- Deployment: push to `main` → GitHub Actions checks (`typecheck`, `test`) and deploys via SSH. SSH key and host key live only in the repository secrets.
- Year-end charts (optional, improve year detection) are **not** part of the repo. Put a CSV `charts*.csv` with the columns `year,pos,artist,title` into the `charts` folder next to the Compose file (mounted as `/charts`), or locally as `data/jahrescharts.csv`.
- Copy music to the server with `rsync` (`deploy/musik-sync.sh`); the service rescans automatically.
- Password gate: `ZEITSTRAHL_ZUGANG=passwort` in the `.env` → the app only works after entering `ZEITSTRAHL_PASSWORT` (at least 8 characters); otherwise API, audio and the real-time connection are blocked. QR invites and the legal pages stay open.

## Contributing

Contributions are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md). Rules in short:

- Code, comments and commit messages in **German**, identifiers too (`spielerEntfernen`, `zugVorbereiten`).
- No build steps and no frontend frameworks: TypeScript runs directly in Node, the frontend is vanilla JS.
- Game rules belong in `game.ts` as pure functions, with tests in `test/`.
- The server decides everything. Devices only receive what they may see (`sicht()`).
- Write new UI texts in German and add them for every language in `public/js/i18n.js`.
- Never put passwords, keys or `.env` contents into the repo, commits or logs.
- Before every push: `npm run typecheck && npm test`.

## Legal (short version, not legal advice)

- Previews come from Apple Music and Deezer under their developer terms: **non-commercial and private use only**. Do not add features that store, record or circumvent previews.
- Own files: use only music you own legally. **No music files or chart data are part of this repository.**
- Only short clips are served, never whole files; pages are `noindex`.
- The name and logo “HitYear” are not covered by the license; no third-party trademarks.
- Font Nunito under the [SIL Open Font License](public/fonts/OFL.txt).

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): you may use, modify and share the code freely for **non-commercial** purposes (private, education, clubs, non-profit). For commercial use please ask first: hityear@tobis.io.

© 2026 Tobias Kurig (medienguru.de)
