/**
 * Sperrliste für Spielcodes: keine 4er-Codes, die sich in einer der Spielsprachen (de, en, fr, it, es, pt) als
 * anstößiges Wort lesen lassen. Codes bestehen aus CODE_ZEICHEN (raeume.ts, ohne O/I/S/Z/B/0/1/8); Ziffern werden
 * beim Lesen aber oft als Buchstaben gesehen (5 = S, 3 = E, 4 = A …) und beim Beitritt verzeiht der Server S/5, Z/2.
 * Deshalb wird jeder Code in allen „Lesarten“ geprüft und gesperrt, wenn ein Eintrag irgendwo darin vorkommt.
 * Einträge mit 2–3 Zeichen sperren alle Codes, die sie enthalten (z. B. „SEX“ → SEXA, ASEX …).
 */

// Ziffer → Buchstaben, als die man sie lesen kann (mehrere Lesarten möglich)
const LESARTEN: Record<string, string[]> = {
  "0": ["0", "O"], "1": ["1", "I", "L"], "8": ["8", "B"], "2": ["2", "Z"], "3": ["3", "E"], "4": ["4", "A"], "5": ["5", "S"], "6": ["6", "G", "B"], "7": ["7", "T"], "9": ["9", "G"],
};

/** Gesperrte Wörter und Wortanfänge nach Kategorie (Großbuchstaben, Umlaute aufgelöst). */
export const SPERRLISTE: Record<string, readonly string[]> = {
  sex: [
    "SEX", "SEXE", "SEXO", "SESSO", "FUCK", "FUK", "FCK", "CUNT", "KUNT", "TWAT", "CLIT", "CUM", "DICK", "DIK", "COCK", "KOCK",
    "PUSS", "PUSY", "ANAL", "ANUS", "TITS", "TITT", "TETA", "NUDE", "NACKT", "GEIL", "FICK", "FIK", "PORN", "PRNO", "XXX",
    "MILF", "DILF", "HURE", "SLUT", "WHOR", "HOE", "PUTA", "PUTE", "PUTO", "BITE", "FIGA", "POLLA", "CAZZ", "CAZZO", "CONO",
    "CULO", "WANK", "JIZZ", "RAPE", "PEDO", "PAED", "LOLI", "INZEST", "INCEST", "FOTZ", "MUSCH", "WIXX", "WIX", "WICHS",
    "BLOWJ", "BJ69", "69",
  ],
  gewalt: [
    "KILL", "MORD", "MURD", "MORT", "TOT", "TOD", "TOET", "GUN", "BOMB", "AMOK", "TERR", "JIHAD", "DSCHI", "SUIC", "SUIZ",
    "MATA", "MUERT", "SHOOT", "STAB", "HANG", "FOLTER", "BLUT", "GORE",
  ],
  krieg: ["WAR", "KRIEG", "KRIG", "GUERR", "GUER", "NUKE", "PANZ", "WAFF", "INVAS"],
  rassismus: [
    "NEGR", "NEGER", "NIGG", "NIG", "NGGR", "NGR", "NIGA", "COON", "KIKE", "KYKE", "CHNK", "CHINK", "GOOK", "JAP", "PAKI",
    "SPIC", "SPIK", "WOP", "WOG", "KANAK", "KANK", "ZIGEU", "GYPS", "GYP", "JUDE", "JUD", "KAFR", "KAFIR", "HOMO", "FAG",
    "DYKE", "TRANNY", "TRNY", "TARD", "SPAST", "SPAS", "MONGO", "KRAUT", "KRAU", "POLAK", "ARYA", "ARIER",
  ],
  nationalitaeten: ["USA", "RUS", "UKR", "ISR", "PAL", "IRAN", "IRAK", "IRAQ", "CHN", "PRC", "ARAB", "TURK", "JEW", "ZION", "KURD", "GAZA"],
  rechtsextremismus: [
    "NAZI", "NAZ", "SS", "HH", "KKK", "NSDA", "NSU", "HEIL", "SIEG", "HITL", "ZOG", "RAHOW", "WPWW", "REICH", "HAKEN", "HKKR",
    "FUHR", "FUEHR", "GAS", "SKIN",
    // Zahlencodes der Szene (18 = A.H., 88 = H.H., 14 Words, 28 = B&H) – heute nicht im Code-Alphabet, aber für später
    "18", "88", "14", "28", "1488",
  ],
  politik: [
    "AFD", "NPD", "CDU", "CSU", "SPD", "FDP", "BSW", "DKP", "KPD", "SED", "MLPD", "OVP", "FPO", "SVP", "PIS", "VOX", "GOP",
    "MAGA", "TRUMP", "TRUM", "TRMP", "PUTIN", "PUTN", "PUTI", "BIDN", "MERZ", "HAMAS", "HAMA", "IDF", "PKK", "RAF", "IRA",
    "ETA", "ACAB", "ANTIFA", "ANTF", "STASI", "STAS", "PSOE",
  ],
  drogen: ["WEED", "METH", "COKE", "KOKS", "CRACK", "CRAK", "LSD", "THC", "HASH", "HASCH", "DOPE", "DRUG", "HEROI", "KOKA"],
  beleidigung: [
    "HASS", "HATE", "ARSCH", "ARSC", "ARSE", "ASS", "DUMM", "DEPP", "FOTZE", "LUDER", "MERD", "MRD", "CACA", "KACK", "KAKA",
    "SHIT", "SCHEI", "PISS", "PERRA", "CABR", "MERDA", "VAFF", "STRNZ", "PQP", "NTM", "TWAT", "LOSER", "SUCK", "SUKA", "BLYAT",
    "BLYA", "PENDEJ", "CHUP", "CRAP", "DAMN", "FAGG", "BITCH", "BTCH", "WTF", "STFU", "KYS", "MF", "MOFO", "MFKR", "1312", "187",
  ],
  tod: ["DEAD", "DEATH", "DIED", "RIP", "666", "SATAN", "TEUFEL"],
  // Marken und Sender: kein Code soll wie Werbung oder eine Kooperation aussehen
  marken: [
    "NIKE", "ADID", "PUMA", "REEB", "FILA", "AUDI", "BMW", "VW", "FORD", "OPEL", "SEAT", "FIAT", "JEEP", "KIA", "TESL", "TSLA",
    "APPL", "SONY", "LEGO", "IKEA", "AMZN", "AMAZ", "META", "UBER", "LIDL", "ALDI", "EDEK", "REWE", "DHL", "UPS", "FEDX", "KFC",
    "MCD", "IBM", "AMD", "AWS", "VISA", "AMEX", "ZARA", "GUCC", "DIOR", "PRADA", "COLA", "PEPS", "NETF", "SPOT", "DEEZ", "HBO",
    "CNN", "BBC", "ARD", "ZDF", "RTL", "SKY", "EBAY", "XBOX", "WII", "SEGA", "NVDA", "MSFT", "GOOG", "YHOO", "TKTK", "SNAP",
    "SHEL", "ESSO", "ARAL", "BP", "HUAW", "XIAO", "SMSG",
  ],
};

const EINTRAEGE = [...new Set(Object.values(SPERRLISTE).flat())];

/** Alle Lesarten eines Codes (Ziffern als Ziffer oder als ähnlicher Buchstabe). */
export function lesarten(code: string): string[] {
  let varianten = [""];
  for (const z of code.toUpperCase()) {
    const moeglich = LESARTEN[z] ?? [z];
    varianten = varianten.flatMap((v) => moeglich.map((m) => v + m));
  }
  return varianten;
}

/** true, wenn der Code in einer Lesart einen Eintrag der Sperrliste enthält. */
export function codeGesperrt(code: string): boolean {
  return lesarten(code).some((v) => EINTRAEGE.some((e) => v.includes(e)));
}
