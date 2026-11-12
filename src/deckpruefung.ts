// Gemeinsame, begrenzte Warteschlange für die ausgewählten Decks aller Räume.
// Keine Songdetails im Fortschritt; Ergebnisse leben nur kurz im Arbeitsspeicher.
export interface Pruefergebnis {
  art: "bereit" | "fehlt" | "unklar";
  bis: number;
}

export class DeckPruefung {
  private auswahl = new Map<string, string>();
  private listen = new Map<string, string[]>();
  private ergebnisse = new Map<string, Pruefergebnis>();
  private inArbeit = new Set<string>();
  private wartend: string[] = [];
  private songIds: (deck: string) => string[];
  private pruefen: (song: string) => Promise<Pruefergebnis>;
  private melden: (deck: string) => void;

  constructor(
    songIds: (deck: string) => string[],
    pruefen: (song: string) => Promise<Pruefergebnis>,
    melden: (deck: string) => void,
  ) {
    this.songIds = songIds;
    this.pruefen = pruefen;
    this.melden = melden;
  }

  waehlen(raum: string, deck: string | null): void {
    // Einen laufenden Durchgang auch bei sehr großen Decks zu Ende bringen.
    // Nach Abschluss darf eine erneute Auswahl veraltete Ergebnisse auffrischen.
    if (deck && !this.stand(deck)?.laeuft) {
      for (const id of this.songIds(deck)) {
        if ((this.ergebnisse.get(id)?.bis ?? Infinity) <= Date.now()) this.ergebnisse.delete(id);
      }
    }
    if (deck) this.auswahl.set(raum, deck);
    else this.auswahl.delete(raum);
    this.aktualisieren();
  }

  aktualisieren(): void {
    const aktiv = new Set(this.auswahl.values());
    for (const deck of this.listen.keys()) if (!aktiv.has(deck)) this.listen.delete(deck);
    for (const deck of aktiv) this.listen.set(deck, [...new Set(this.songIds(deck))]);
    const benoetigt = new Set([...this.listen.values()].flat());
    for (const [id, e] of this.ergebnisse) if (e.bis <= Date.now() && !benoetigt.has(id)) this.ergebnisse.delete(id);
    // Deckwechsel verwirft noch nicht gestartete Arbeit. Überschneidungen nur einmal prüfen.
    this.wartend = [...benoetigt].filter(id => !this.ergebnisse.has(id) && !this.inArbeit.has(id));
    this.weiter();
  }

  fehlt(id: string): boolean {
    const e = this.ergebnisse.get(id);
    return Boolean(e && e.bis > Date.now() && e.art === "fehlt");
  }

  stand(deck: string) {
    const ids = this.listen.get(deck);
    if (!ids?.length) return null;
    const fertig = ids.map(id => this.ergebnisse.get(id)).filter((e): e is Pruefergebnis => Boolean(e));
    return {
      gesamt: ids.length, geprueft: fertig.length, laeuft: fertig.length < ids.length,
      bereit: fertig.filter(e => e.art === "bereit").length,
      fehlt: fertig.filter(e => e.art === "fehlt").length,
      unklar: fertig.filter(e => e.art === "unklar").length,
    };
  }

  private weiter(): void {
    while (this.inArbeit.size < 2 && this.wartend.length) {
      const id = this.wartend.shift()!;
      this.inArbeit.add(id);
      void Promise.resolve().then(() => this.pruefen(id)).catch((): Pruefergebnis => ({ art: "unklar", bis: Date.now() + 60_000 })).then(e => {
        this.ergebnisse.set(id, e);
        this.inArbeit.delete(id);
        for (const [deck, ids] of this.listen) if (ids.includes(id)) this.melden(deck);
        this.weiter();
      });
    }
  }
}
