# CLAUDE.md – party-music (Zeitstrahl)

Hinweise für Claude Code (und andere Agenten) zu diesem Repo. Antworten und Commits auf Deutsch.

## Öffentliches Repo

Das Repo ist öffentlich (PolyForm Noncommercial 1.0.0). Deshalb gehören **keine** Serveradressen, Host-Keys,
Passwörter, Schlüssel, Musikdateien oder Chartdaten ins Repo, in Commits oder Logs.

- Server- und Betriebsdetails (Host, SSH, Ausrollen, Regeln auf dem Server) stehen in `CLAUDE.local.md` – lokal, nicht versioniert.
- Betriebsnotizen liegen unter `docs/lokal/` (ebenfalls nicht versioniert).
- Ausrollen lokal: `ZEITSTRAHL_SSH=<ssh-alias> ./deploy/ausrollen.sh`; über GitHub Actions nach Push auf `main`.
- Vor jedem Commit: `npm run typecheck && npm test`.
