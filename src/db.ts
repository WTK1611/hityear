// SQLite über das in Node 22 eingebaute node:sqlite – keine nativen Pakete nötig.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

fs.mkdirSync(config.datenOrdner, { recursive: true });

export const db = new DatabaseSync(path.join(config.datenOrdner, "zeitstrahl.sqlite"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS songs (
    id           TEXT PRIMARY KEY,
    pfad         TEXT NOT NULL UNIQUE,
    mtime        INTEGER NOT NULL,
    groesse      INTEGER NOT NULL,
    titel        TEXT NOT NULL,
    titel_anzeige TEXT NOT NULL,
    interpret    TEXT NOT NULL,
    album        TEXT,
    dauer_ms     INTEGER NOT NULL DEFAULT 0,
    tag_jahr     INTEGER,
    mb_jahr      INTEGER,
    mb_geprueft  INTEGER NOT NULL DEFAULT 0,
    chart_jahr   INTEGER,
    chart_platz  INTEGER,
    manuell_jahr INTEGER,
    jahr         INTEGER,
    jahr_quelle  TEXT,
    pruefen      INTEGER NOT NULL DEFAULT 0,
    pruef_grund  TEXT,
    hat_cover    INTEGER NOT NULL DEFAULT 0,
    kompilation  INTEGER NOT NULL DEFAULT 0,
    ausgeschlossen INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS songs_jahr ON songs(jahr);

  CREATE TABLE IF NOT EXISTS gespielt (
    song_id   TEXT NOT NULL,
    zeitpunkt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS gespielt_song ON gespielt(song_id);

  -- Decks = welche Songs ins Spiel kommen. quelle: 'eigen' (aus der Bibliothek zusammengestellt),
  -- 'katalog' (importierte Songliste) oder 'playlist' (Abgleich über Interpret/Titel).
  CREATE TABLE IF NOT EXISTS decks (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    quelle   TEXT NOT NULL,
    herkunft TEXT,
    erstellt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deck_eintraege (
    deck_id TEXT NOT NULL,
    nr          INTEGER NOT NULL,
    interpret   TEXT NOT NULL,
    titel       TEXT NOT NULL,
    jahr        INTEGER,
    song_id     TEXT
  );
  CREATE INDEX IF NOT EXISTS deck_eintraege_deck ON deck_eintraege(deck_id);

  CREATE TABLE IF NOT EXISTS spiele (
    code      TEXT PRIMARY KEY,
    zustand   TEXT NOT NULL,
    geaendert INTEGER NOT NULL
  );
`);

// Spalten nachrüsten (bestehende Datenbanken)
const spalten = new Set((db.prepare("PRAGMA table_info(songs)").all() as Array<{ name: string }>).map((r) => r.name));
if (!spalten.has("geschichte")) db.exec("ALTER TABLE songs ADD COLUMN geschichte TEXT");
if (!spalten.has("listen_jahr")) db.exec("ALTER TABLE songs ADD COLUMN listen_jahr INTEGER");
if (!spalten.has("genre")) db.exec("ALTER TABLE songs ADD COLUMN genre TEXT");
if (!spalten.has("apple_url")) db.exec("ALTER TABLE songs ADD COLUMN apple_url TEXT");
if (!spalten.has("fakt")) db.exec("ALTER TABLE songs ADD COLUMN fakt TEXT");
if (!spalten.has("fakt_geholt")) db.exec("ALTER TABLE songs ADD COLUMN fakt_geholt INTEGER");
// Hintergrundfakten (Wikipedia) gibt es nicht mehr – gespeicherte entfernen
db.exec("UPDATE songs SET fakt = NULL, fakt_geholt = NULL WHERE fakt IS NOT NULL OR fakt_geholt IS NOT NULL");
// Cover-Link bei Apple/Deezer (Streaming: der Browser lädt das Cover direkt dort)
if (!spalten.has("cover_url")) db.exec("ALTER TABLE songs ADD COLUMN cover_url TEXT");
// Deezer ist die Hauptquelle: Apple-Einträge bekommen den passenden Deezer-Song dazu (Apple bleibt Ausweichquelle)
if (!spalten.has("deezer_id")) db.exec("ALTER TABLE songs ADD COLUMN deezer_id INTEGER");
if (!spalten.has("deezer_url")) db.exec("ALTER TABLE songs ADD COLUMN deezer_url TEXT");
if (!spalten.has("deezer_geprueft")) db.exec("ALTER TABLE songs ADD COLUMN deezer_geprueft INTEGER");
// Quelle je Deck (auch für CSV-Listen, die nicht in „decks“ stehen): apple (Vorschau) | dateien; altes „beide“ = apple
db.exec("CREATE TABLE IF NOT EXISTS deck_audio (id TEXT PRIMARY KEY, audio TEXT NOT NULL)");
// Einstellungen der ganzen Installation (z. B. Hörproben streamen oder speichern)
db.exec("CREATE TABLE IF NOT EXISTS einstellungen (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL)");
