# Mitmachen bei HitYear

Schön, dass du mitmachen willst. Issues und Pull Requests sind willkommen – Fehlerberichte, Übersetzungen, neue Ideen.

## Regeln

- Code, Kommentare, Commits und Bezeichner auf **Deutsch** (`spielerEntfernen`, `zugVorbereiten`). Issues und PRs gern auch auf Englisch.
- Kein Build-Schritt, keine Frontend-Frameworks: TypeScript läuft direkt in Node, das Frontend ist Vanilla-JS.
- Spielregeln gehören als reine Funktionen in `src/game.ts` und bekommen Tests in `test/`.
- Der Server entscheidet alles; Geräte bekommen nur, was sie sehen dürfen.
- Neue Texte auf Deutsch schreiben und in jeder Datei unter `public/js/sprachen/` ergänzen (29 Sprachen; `test/i18n.test.ts` prüft, dass keiner fehlt).
- Vor jedem Push: `npm run typecheck && npm test` (und `npm run test:e2e`, wenn `ffmpeg` installiert ist).
- Keine Passwörter, Schlüssel, `.env`-Inhalte, Musikdateien oder Chartdaten ins Repo.

## Lizenz deiner Beiträge

Mit einem Pull Request stimmst du zu, dass dein Beitrag unter der [PolyForm Noncommercial License 1.0.0](LICENSE.md)
veröffentlicht wird, so wie das übrige Projekt. Du bestätigst, dass du die Rechte an deinem Beitrag hast.

## Was nicht hierher gehört

- Funktionen, die Hörproben oder Cover speichern, mitschneiden oder umgehen – Apple Music und Deezer erlauben nur das direkte Streaming.
- Werbung, Tracking ohne Einwilligung, Bezahlfunktionen.

---

# Contributing (English)

Issues and pull requests are welcome. Code, comments, commits and identifiers are in **German**; issues and PRs may be in English.
No build step, no frontend frameworks. Game rules live in `src/game.ts` as pure functions with tests in `test/`.
New UI texts go into every file in `public/js/sprachen/` (29 languages; `test/i18n.test.ts` checks that none is missing). Run `npm run typecheck && npm test` before pushing.
By opening a pull request you agree that your contribution is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md) like the rest of the project.
