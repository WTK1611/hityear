"use strict";
// ---------- Sprachen ----------
// Quelltexte bleiben Deutsch. Dieses Skript übersetzt alles, was auf der Seite landet (Text, Platzhalter,
// aria-label, title), über eine Tabelle – auch Texte, die erst später per JS oder vom Server kommen.
// Schlüssel mit {0}, {1} … sind Muster: die eingesetzten Teile werden selbst wieder übersetzt.

const SPRACHEN = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "es", name: "Español" },
  { code: "pt-BR", name: "Português (Brasil)" },
];

const SPRACHE = (() => {
  const codes = SPRACHEN.map((s) => s.code);
  let gewaehlt = null;
  try {
    gewaehlt = localStorage.getItem("zs_sprache");
  } catch {
    /* privates Fenster */
  }
  if (codes.includes(gewaehlt)) return gewaehlt;
  for (const l of navigator.languages ?? [navigator.language]) {
    const kurz = String(l).toLowerCase().slice(0, 2);
    if (kurz === "pt") return "pt-BR";
    if (codes.includes(kurz)) return kurz;
  }
  return "de";
})();

function spracheSetzen(code) {
  try {
    localStorage.setItem("zs_sprache", code);
  } catch {
    /* egal */
  }
  location.reload();
}

// [de, en, fr, it, es, pt-BR]
const UEBERSETZUNGEN = [
  // ---- allgemein / Startseite ----
  ["HitYear – Host", "HitYear – Host", "HitYear – Hôte", "HitYear – Host", "HitYear – Anfitrión", "HitYear – Anfitrião"],
  ["HitYear – Mitspielen", "HitYear – Play", "HitYear – Jouer", "HitYear – Gioca", "HitYear – Jugar", "HitYear – Jogar"],
  ["Zur Startseite", "To the home page", "Vers l'accueil", "Alla pagina iniziale", "A la página de inicio", "Para a página inicial"],
  ["QR-Code scannen", "Scan QR code", "Scanner le QR code", "Scansiona il QR code", "Escanear código QR", "Escanear QR code"],
  ["Halte die Kamera auf den QR-Code.", "Point the camera at the QR code.", "Pointe la caméra vers le QR code.", "Inquadra il QR code con la fotocamera.", "Apunta la cámara al código QR.", "Aponte a câmera para o QR code."],
  ["Abbrechen", "Cancel", "Annuler", "Annulla", "Cancelar", "Cancelar"],
  ["Wann kam der Song", "When did the song", "C'est sorti", "Quando è uscita", "¿Cuándo salió", "Quando saiu"],
  ["raus?", "come out?", "quand ?", "la canzone?", "la canción?", "a música?"],
  ["Hör rein und sortiere jeden Song in deinen eigenen Zeitstrahl. Wer zuerst genug Karten richtig liegen hat, gewinnt.",
    "Listen in and place every song on your own timeline. Whoever first gets enough cards right wins.",
    "Écoute et place chaque chanson sur ta propre frise chronologique. Le premier à avoir assez de cartes bien placées gagne.",
    "Ascolta e metti ogni canzone nella tua linea del tempo. Vince chi per primo ha abbastanza carte al posto giusto.",
    "Escucha y coloca cada canción en tu propia línea del tiempo. Gana quien primero tenga suficientes cartas bien colocadas.",
    "Ouça e coloque cada música na sua própria linha do tempo. Vence quem primeiro acertar cartas suficientes."],
  ["Gib den Spielcode vom erstellten Spiel ein oder scanne den QR-Code.", "Enter the code of the game that was created or scan the QR code.", "Saisis le code de la partie créée ou scanne le QR code.", "Inserisci il codice della partita creata o scansiona il QR code.", "Introduce el código de la partida creada o escanea el código QR.", "Digite o código do jogo criado ou escaneie o QR code."],
  ["Mitspielen", "Join the game", "Jouer", "Gioca", "Jugar", "Jogar"],
  ["Code eingeben", "Enter code", "Saisir le code", "Inserisci il codice", "Introduce el código", "Digite o código"],
  ["Los geht's!", "Let's go!", "C'est parti !", "Si parte!", "¡Vamos!", "Bora!"],
  ["oder", "or", "ou", "oppure", "o", "ou"],
  ["Den Code am Fernseher oder Laptop des Gastgebers.", "The code on the host's TV or laptop.", "Le code sur la télé ou l'ordi de l'hôte.", "Il codice sulla TV o sul portatile di chi ospita.", "El código en la tele o el portátil del anfitrión.", "O código na TV ou no notebook do anfitrião."],
  ["Kamera öffnen", "Open camera", "Ouvrir la caméra", "Apri la fotocamera", "Abrir cámara", "Abrir câmera"],
  ["Spiel leiten", "Host a game", "Animer une partie", "Conduci una partita", "Dirigir una partida", "Conduzir uma partida"],
  ["Öffne das am Fernseher oder Laptop.", "Open this on a TV or laptop.", "Ouvre ceci sur une télé ou un ordi.", "Aprilo sulla TV o sul portatile.", "Ábrelo en una tele o un portátil.", "Abra isto na TV ou no notebook."],
  ["Die Mitspieler scannen dort den QR-Code.", "Players scan the QR code there.", "Les joueurs y scannent le QR code.", "I giocatori scansionano lì il QR code.", "Los jugadores escanean allí el código QR.", "Os jogadores escaneiam o QR code lá."],
  ["Öffne das am Fernseher oder Laptop. Die Mitspieler scannen dort den QR-Code.", "Open this on a TV or laptop. Players scan the QR code there.", "Ouvre ceci sur une télé ou un ordi. Les joueurs y scannent le QR code.", "Aprilo sulla TV o sul portatile. I giocatori scansionano lì il QR code.", "Ábrelo en una tele o un portátil. Los jugadores escanean allí el código QR.", "Abra isto na TV ou no notebook. Os jogadores escaneiam o QR code lá."],
  ["Spiel erstellen", "Create game", "Créer une partie", "Crea partita", "Crear partida", "Criar partida"],
  ["Musik & Bibliothek", "Music & library", "Musique & bibliothèque", "Musica & libreria", "Música y biblioteca", "Música & biblioteca"],
  ["MP3s per Drag & Drop hochladen – Jahr, Charts und Songlisten werden automatisch ergänzt. In Decks legst du fest, welche Songs ins Spiel kommen.",
    "Upload MP3s via drag & drop – year, charts and song lists are added automatically. Decks decide which songs make it into the game.",
    "Glisse-dépose tes MP3 – année, classements et listes sont complétés automatiquement. Les decks définissent les chansons du jeu.",
    "Carica gli MP3 con il drag & drop – anno, classifiche e playlist si completano da soli. Nei mazzi scegli quali canzoni entrano nel gioco.",
    "Sube MP3 arrastrando y soltando: año, listas de éxitos y listas se completan solos. En los mazos decides qué canciones entran en el juego.",
    "Envie MP3 arrastando e soltando – ano, paradas e listas são preenchidos sozinhos. Nos decks você escolhe quais músicas entram no jogo."],
  ["🎵 Musik hochladen", "🎵 Upload music", "🎵 Importer de la musique", "🎵 Carica musica", "🎵 Subir música", "🎵 Enviar música"],
  ["Anmelden", "Log in", "Se connecter", "Accedi", "Iniciar sesión", "Entrar"],
  ["Abmelden", "Log out", "Se déconnecter", "Esci", "Cerrar sesión", "Sair"],
  ["Du bist als Admin angemeldet.", "You're logged in as admin.", "Tu es connecté en tant qu'admin.", "Hai effettuato l'accesso come admin.", "Has iniciado sesión como admin.", "Você entrou como admin."],
  ["🎵 Songs prüfen", "🎵 Check songs", "🎵 Vérifier les chansons", "🎵 Controlla le canzoni", "🎵 Revisar canciones", "🎵 Conferir músicas"],
  ["Songs und Jahre prüfen – Jahr, Charts und Songlisten werden automatisch ergänzt. In Decks legst du fest, welche Songs ins Spiel kommen.",
    "Check songs and years – year, charts and song lists are added automatically. Decks decide which songs make it into the game.",
    "Vérifie chansons et années – année, classements et listes sont complétés automatiquement. Les decks définissent les chansons du jeu.",
    "Controlla canzoni e anni – anno, classifiche e playlist si completano da soli. Nei mazzi scegli quali canzoni entrano nel gioco.",
    "Revisa canciones y años: año, listas de éxitos y listas se completan solos. En los mazos decides qué canciones entran en el juego.",
    "Confira músicas e anos – ano, paradas e listas são preenchidos sozinhos. Nos decks você escolhe quais músicas entram no jogo."],
  ["🗂️ Decks verwalten", "🗂️ Manage decks", "🗂️ Gérer les decks", "🗂️ Gestisci i mazzi", "🗂️ Gestionar mazos", "🗂️ Gerenciar decks"],
  ["Sprache wählen", "Choose language", "Choisir la langue", "Scegli la lingua", "Elegir idioma", "Escolher idioma"],
  ["Der Code hat 4 Zeichen – er steht groß auf dem Bildschirm des Gastgebers.", "The code has 4 characters – it's shown big on the host's screen.", "Le code a 4 caractères – il s'affiche en grand sur l'écran de l'hôte.", "Il codice ha 4 caratteri – è scritto in grande sullo schermo di chi ospita.", "El código tiene 4 caracteres: aparece en grande en la pantalla del anfitrión.", "O código tem 4 caracteres – aparece grande na tela do anfitrião."],
  ["Kein Spiel mit dem Code {0} gefunden – vertippt?", "No game found with code {0} – typo?", "Aucune partie avec le code {0} – faute de frappe ?", "Nessuna partita con il codice {0} – errore di battitura?", "No hay ninguna partida con el código {0}. ¿Error al escribir?", "Nenhuma partida com o código {0} – digitou errado?"],
  ["Gerade nicht erreichbar – bitte gleich nochmal.", "Not reachable right now – please try again in a moment.", "Injoignable pour l'instant – réessaie dans un instant.", "Al momento non raggiungibile – riprova tra poco.", "No disponible ahora mismo. Inténtalo de nuevo enseguida.", "Fora do ar agora – tente de novo daqui a pouco."],
  ["Dein Browser kann hier nicht scannen. Öffne einfach die Kamera-App deines Handys und richte sie auf den QR-Code – oder gib den Code ein.",
    "Your browser can't scan here. Just open your phone's camera app and point it at the QR code – or enter the code.",
    "Ton navigateur ne peut pas scanner ici. Ouvre l'appareil photo de ton téléphone et vise le QR code – ou saisis le code.",
    "Il tuo browser qui non può scansionare. Apri la fotocamera del telefono e inquadra il QR code – oppure inserisci il codice.",
    "Tu navegador no puede escanear aquí. Abre la cámara del móvil y apunta al código QR, o introduce el código.",
    "Seu navegador não consegue escanear aqui. Abra a câmera do celular e aponte para o QR code – ou digite o código."],
  ["Das ist kein Code für dieses Spiel.", "That's not a code for this game.", "Ce n'est pas un code pour ce jeu.", "Questo non è un codice per questo gioco.", "Ese no es un código de este juego.", "Esse não é um código deste jogo."],
  ["Kein Zugriff auf die Kamera. Erlaube die Kamera oder gib den Code ein.", "No camera access. Allow the camera or enter the code.", "Pas d'accès à la caméra. Autorise-la ou saisis le code.", "Nessun accesso alla fotocamera. Consentilo o inserisci il codice.", "Sin acceso a la cámara. Permítelo o introduce el código.", "Sem acesso à câmera. Permita a câmera ou digite o código."],
  ["by medienguru.de", "by medienguru.de", "par medienguru.de", "di medienguru.de", "por medienguru.de", "por medienguru.de"],
  ["‹ Zurück", "‹ Back", "‹ Retour", "‹ Indietro", "‹ Atrás", "‹ Voltar"],
  ["Spiel abbrechen? Nochmal klicken", "Quit the game? Click again", "Quitter la partie ? Clique encore", "Interrompere la partita? Clicca di nuovo", "¿Cancelar la partida? Haz clic otra vez", "Cancelar a partida? Clique de novo"],
  ["Spiel verlassen? Nochmal klicken", "Leave the game? Click again", "Quitter le jeu ? Clique encore", "Uscire dal gioco? Clicca di nuovo", "¿Salir del juego? Haz clic otra vez", "Sair do jogo? Clique de novo"],

  // ---- Host: Lobby ----
  ["QR-Code zum Beitreten", "QR code to join", "QR code pour rejoindre", "QR code per entrare", "Código QR para unirse", "QR code para entrar"],
  ["Scannen und direkt mitspielen – ohne Passwort. Oder den Link teilen:", "Scan and play right away – no password. Or share the link:", "Scanne et joue tout de suite – sans mot de passe. Ou partage le lien :", "Scansiona e gioca subito – senza password. Oppure condividi il link:", "Escanea y juega al instante, sin contraseña. O comparte el enlace:", "Escaneie e jogue na hora – sem senha. Ou compartilhe o link:"],
  ["🔗 Einladungslink teilen", "🔗 Share invite link", "🔗 Partager le lien d'invitation", "🔗 Condividi il link d'invito", "🔗 Compartir enlace de invitación", "🔗 Compartilhar link de convite"],
  ["Mitspieler", "Players", "Joueurs", "Giocatori", "Jugadores", "Jogadores"],
  ["Noch niemand da …", "Nobody here yet …", "Personne pour l'instant …", "Ancora nessuno …", "Todavía no hay nadie …", "Ninguém ainda …"],
  ["Noch niemand da … scannt den QR-Code!", "Nobody here yet … scan the QR code!", "Personne pour l'instant … scannez le QR code !", "Ancora nessuno … scansionate il QR code!", "Todavía no hay nadie … ¡escanead el código QR!", "Ninguém ainda … escaneiem o QR code!"],
  ["🤖 Mit KI-Bots auf 6 auffüllen", "🤖 Fill up to 6 with AI bots", "🤖 Compléter jusqu'à 6 avec des bots IA", "🤖 Completa fino a 6 con bot IA", "🤖 Completar hasta 6 con bots de IA", "🤖 Completar até 6 com bots de IA"],
  ["Freie Plätze übernehmen beim Start Bots – Name und Stärke würfelt die App.", "Bots take free seats at the start – the app rolls their name and strength.", "Au départ, des bots prennent les places libres – l'appli tire leur nom et leur niveau.", "All'inizio i bot occupano i posti liberi – nome e forza li sceglie l'app a caso.", "Al empezar, los bots ocupan los huecos libres: la app sortea nombre y nivel.", "No início, bots ocupam as vagas livres – o app sorteia nome e nível."],
  ["Beim Start kommen {0} Bot dazu – Name und Stärke würfelt die App.", "{0} bot will join at the start – the app rolls name and strength.", "{0} bot rejoindra la partie au départ – l'appli tire nom et niveau.", "All'inizio si aggiunge {0} bot – nome e forza li sceglie l'app.", "Al empezar se une {0} bot: la app sortea nombre y nivel.", "No início entra {0} bot – o app sorteia nome e nível."],
  ["Beim Start kommen {0} Bots dazu – Name und Stärke würfelt die App.", "{0} bots will join at the start – the app rolls names and strength.", "{0} bots rejoindront la partie au départ – l'appli tire noms et niveaux.", "All'inizio si aggiungono {0} bot – nomi e forza li sceglie l'app.", "Al empezar se unen {0} bots: la app sortea nombres y niveles.", "No início entram {0} bots – o app sorteia nomes e níveis."],
  ["Alle 6 Plätze sind belegt – es kommen keine Bots dazu.", "All 6 seats are taken – no bots will join.", "Les 6 places sont prises – aucun bot ne viendra.", "Tutti i 6 posti sono occupati – nessun bot si aggiunge.", "Las 6 plazas están ocupadas: no se unirá ningún bot.", "As 6 vagas estão ocupadas – nenhum bot vai entrar."],
  ["Toleranz: Für Kinder oder Einsteiger zählt eine Karte auch dann, wenn sie ein paar Jahre daneben liegt.", "Tolerance: for kids or beginners a card also counts if it's a few years off.", "Tolérance : pour les enfants ou débutants, une carte compte même à quelques années près.", "Tolleranza: per bambini o principianti una carta vale anche se sbaglia di qualche anno.", "Tolerancia: para niños o principiantes, una carta cuenta aunque falle por unos años.", "Tolerância: para crianças ou iniciantes, a carta vale mesmo errando por alguns anos."],
  ["Toleranz für {0}", "Tolerance for {0}", "Tolérance pour {0}", "Tolleranza per {0}", "Tolerancia para {0}", "Tolerância para {0}"],
  ["exakt", "exact", "exact", "esatto", "exacto", "exato"],
  ["±{0} Jahre", "±{0} years", "±{0} ans", "±{0} anni", "±{0} años", "±{0} anos"],
  ["{0} entfernen", "Remove {0}", "Retirer {0}", "Rimuovi {0}", "Quitar a {0}", "Remover {0}"],
  ["{0} (offline)", "{0} (offline)", "{0} (hors ligne)", "{0} (offline)", "{0} (sin conexión)", "{0} (offline)"],
  ["Einstellungen", "Settings", "Réglages", "Impostazioni", "Ajustes", "Configurações"],
  ["Karten zum Sieg", "Cards to win", "Cartes pour gagner", "Carte per vincere", "Cartas para ganar", "Cartas para vencer"],
  ["Musik läuft …", "Music plays …", "La musique passe …", "La musica suona …", "La música suena …", "A música toca …"],
  ["Party vor Ort (auf dem Hauptbildschirm)", "Party in the room (on the main screen)", "Soirée sur place (sur l'écran principal)", "Festa dal vivo (sullo schermo principale)", "Fiesta presencial (en la pantalla principal)", "Festa presencial (na tela principal)"],
  ["Online (auf dem Handy)", "Online (on the phone)", "En ligne (sur le téléphone)", "Online (sul telefono)", "Online (en el móvil)", "Online (no celular)"],
  ["Zeit zum Einordnen", "Time to place", "Temps pour placer", "Tempo per piazzare", "Tiempo para colocar", "Tempo para posicionar"],
  ["bis alle gewählt haben", "until everyone has chosen", "jusqu'à ce que tous aient choisi", "finché tutti hanno scelto", "hasta que todos hayan elegido", "até todos escolherem"],
  ["bis der Ausschnitt endet", "until the clip ends", "jusqu'à la fin de l'extrait", "fino alla fine dello spezzone", "hasta que acabe el fragmento", "até o trecho acabar"],
  ["Wer ist dran?", "Whose turn?", "À qui le tour ?", "A chi tocca?", "¿A quién le toca?", "De quem é a vez?"],
  ["immer nur ein Spieler", "one player at a time", "un joueur à la fois", "un giocatore alla volta", "un jugador cada vez", "um jogador por vez"],
  ["alle gleichzeitig", "everyone at once", "tout le monde en même temps", "tutti insieme", "todos a la vez", "todos ao mesmo tempo"],
  ["Alle gleichzeitig: Runde endet …", "Everyone at once: round ends …", "Tous en même temps : la manche se termine …", "Tutti insieme: il round finisce …", "Todos a la vez: la ronda termina …", "Todos juntos: a rodada termina …"],
  ["Nicht erraten", "Not guessed", "Pas trouvé", "Non indovinato", "No acertado", "Não acertou"],
  ["Lösung zeigen, Song kommt später nochmal", "Show answer, song comes back later", "Montrer la réponse, la chanson revient plus tard", "Mostra la soluzione, la canzone torna dopo", "Mostrar solución, la canción vuelve más tarde", "Mostrar resposta, a música volta depois"],
  ["Lösung verdecken, Song kommt später nochmal", "Hide answer, song comes back later", "Cacher la réponse, la chanson revient plus tard", "Nascondi la soluzione, la canzone torna dopo", "Ocultar solución, la canción vuelve más tarde", "Esconder resposta, a música volta depois"],
  ["Lösung zeigen, Song kommt nicht nochmal", "Show answer, song won't come back", "Montrer la réponse, la chanson ne revient pas", "Mostra la soluzione, la canzone non torna", "Mostrar solución, la canción no vuelve", "Mostrar resposta, a música não volta"],
  ["Was wird geraten?", "What do you guess?", "Que faut-il deviner ?", "Cosa si indovina?", "¿Qué se adivina?", "O que se adivinha?"],
  ["nur das Jahr", "only the year", "seulement l'année", "solo l'anno", "solo el año", "só o ano"],
  ["Jahr + Songtitel ⭐", "Year + song title ⭐", "Année + titre ⭐", "Anno + titolo ⭐", "Año + título ⭐", "Ano + título ⭐"],
  ["Jahr + Interpret ⭐", "Year + artist ⭐", "Année + artiste ⭐", "Anno + artista ⭐", "Año + artista ⭐", "Ano + artista ⭐"],
  ["Jahr + Songtitel & Interpret ⭐", "Year + title & artist ⭐", "Année + titre & artiste ⭐", "Anno + titolo & artista ⭐", "Año + título y artista ⭐", "Ano + título & artista ⭐"],
  ["⭐ je richtig geraten 1 Zusatzpunkt", "⭐ 1 bonus point per correct guess", "⭐ 1 point bonus par bonne réponse", "⭐ 1 punto extra per ogni risposta giusta", "⭐ 1 punto extra por cada acierto", "⭐ 1 ponto extra por acerto"],
  ["Deck", "Deck", "Deck", "Mazzo", "Mazo", "Deck"],
  ["{0} ({1}/{2} vorhanden)", "{0} ({1}/{2} available)", "{0} ({1}/{2} disponibles)", "{0} ({1}/{2} disponibili)", "{0} ({1}/{2} disponibles)", "{0} ({1}/{2} disponíveis)"],
  ["Impressum", "Imprint", "Mentions légales", "Note legali", "Aviso legal", "Informações legais"],
  ["Ganze Bibliothek", "Whole library", "Toute la bibliothèque", "Tutta la libreria", "Toda la biblioteca", "Biblioteca inteira"],
  ["Spiel starten ✨", "Start game ✨", "Lancer la partie ✨", "Inizia la partita ✨", "Empezar partida ✨", "Começar partida ✨"],
  ["Warte auf Mitspieler – mindestens 1 muss den QR-Code scannen.", "Waiting for players – at least 1 must scan the QR code.", "En attente de joueurs – au moins 1 doit scanner le QR code.", "In attesa di giocatori – almeno 1 deve scansionare il QR code.", "Esperando jugadores: al menos 1 debe escanear el código QR.", "Aguardando jogadores – pelo menos 1 precisa escanear o QR code."],
  ["Für {0} Mitspieler braucht es mindestens {1} Songs – wähle ein größeres Deck oder mehr Jahrzehnte/Genres.", "{0} players need at least {1} songs – pick a bigger deck or more decades/genres.", "Pour {0} joueurs, il faut au moins {1} chansons – choisis un plus grand deck ou plus de décennies/genres.", "Per {0} giocatori servono almeno {1} canzoni – scegli un mazzo più grande o più decenni/generi.", "Para {0} jugadores hacen falta al menos {1} canciones: elige un mazo más grande o más décadas/géneros.", "Para {0} jogadores são necessárias pelo menos {1} músicas – escolha um deck maior ou mais décadas/gêneros."],
  ["Jahrzehnte", "Decades", "Décennies", "Decenni", "Décadas", "Décadas"],
  ["Genres", "Genres", "Genres", "Generi", "Géneros", "Gêneros"],
  ["(keins gewählt = alle)", "(none selected = all)", "(aucune sélection = tout)", "(nessuna scelta = tutti)", "(ninguno = todos)", "(nenhum = todos)"],
  ["50er", "50s", "années 50", "anni '50", "años 50", "anos 50"],
  ["60er", "60s", "années 60", "anni '60", "años 60", "anos 60"],
  ["70er", "70s", "années 70", "anni '70", "años 70", "anos 70"],
  ["80er", "80s", "années 80", "anni '80", "años 80", "anos 80"],
  ["90er", "90s", "années 90", "anni '90", "años 90", "anos 90"],
  ["00er", "2000s", "années 2000", "anni 2000", "años 2000", "anos 2000"],
  ["10er", "2010s", "années 2010", "anni 2010", "años 2010", "anos 2010"],
  ["20er", "2020s", "années 2020", "anni 2020", "años 2020", "anos 2020"],
  ["🎤 Pop", "🎤 Pop", "🎤 Pop", "🎤 Pop", "🎤 Pop", "🎤 Pop"],
  ["🎸 Rock", "🎸 Rock", "🎸 Rock", "🎸 Rock", "🎸 Rock", "🎸 Rock"],
  ["🪩 Dance & Elektro", "🪩 Dance & Electronic", "🪩 Dance & Électro", "🪩 Dance & Elettronica", "🪩 Dance y Electrónica", "🪩 Dance & Eletrônica"],
  ["🎧 Hip-Hop & Rap", "🎧 Hip-Hop & Rap", "🎧 Hip-Hop & Rap", "🎧 Hip-Hop & Rap", "🎧 Hip-Hop y Rap", "🎧 Hip-Hop & Rap"],
  ["💜 R&B & Soul", "💜 R&B & Soul", "💜 R&B & Soul", "💜 R&B & Soul", "💜 R&B y Soul", "💜 R&B & Soul"],
  ["🥨 Schlager", "🥨 German Schlager", "🥨 Schlager allemand", "🥨 Schlager tedesco", "🥨 Schlager alemán", "🥨 Schlager alemão"],
  ["🎬 Filmmusik", "🎬 Soundtracks", "🎬 Musiques de film", "🎬 Colonne sonore", "🎬 Bandas sonoras", "🎬 Trilhas sonoras"],
  ["{0} Songs passen zur Auswahl.", "{0} songs match the selection.", "{0} chansons correspondent à la sélection.", "{0} canzoni corrispondono alla selezione.", "{0} canciones coinciden con la selección.", "{0} músicas combinam com a seleção."],
  ["{0} Songs passen zur Auswahl. {1}", "{0} songs match the selection. {1}", "{0} chansons correspondent à la sélection. {1}", "{0} canzoni corrispondono alla selezione. {1}", "{0} canciones coinciden con la selección. {1}", "{0} músicas combinam com a seleção. {1}"],
  ["Scannen und mitspielen", "Scan and play", "Scanne et joue", "Scansiona e gioca", "Escanea y juega", "Escaneie e jogue"],
  ["QR-Code zum Mitspielen", "QR code to play", "QR code pour jouer", "QR code per giocare", "Código QR para jugar", "QR code para jogar"],
  ["QR-Code zur Startseite", "QR code to the start page", "Code QR vers l’accueil", "Codice QR per la pagina iniziale", "Código QR a la página de inicio", "QR code para a página inicial"],
  ["Jetzt mitspielen", "Play now", "Joue maintenant", "Gioca ora", "Juega ahora", "Jogue agora"],
  ["Platz frei – QR-Code scannen", "Seat free – scan the QR code", "Place libre – scanne le QR code", "Posto libero – scansiona il QR code", "Plaza libre: escanea el código QR", "Vaga livre – escaneie o QR code"],
  ["Spiel mit! Raum {0}", "Play along! Room {0}", "Joue avec nous ! Salle {0}", "Gioca con noi! Stanza {0}", "¡Juega con nosotros! Sala {0}", "Jogue com a gente! Sala {0}"],
  ["Link kopiert – direkt mitspielen, ohne Passwort.", "Link copied – play right away, no password.", "Lien copié – on joue direct, sans mot de passe.", "Link copiato – si gioca subito, senza password.", "Enlace copiado: a jugar al instante, sin contraseña.", "Link copiado – jogue na hora, sem senha."],
  ["Wirklich schließen? Alle fliegen raus", "Really close? Everyone gets kicked out", "Vraiment fermer ? Tout le monde sera éjecté", "Chiudere davvero? Escono tutti", "¿Cerrar de verdad? Todos quedarán fuera", "Fechar mesmo? Todos vão sair"],
  ["Raum schließen", "Close room", "Fermer la salle", "Chiudi la stanza", "Cerrar sala", "Fechar sala"],
  ["🎤 Künstler erraten · ⭐ +1", "🎤 Artist guessed · ⭐ +1", "🎤 Artiste trouvé · ⭐ +1", "🎤 Artista indovinato · ⭐ +1", "🎤 Artista acertado · ⭐ +1", "🎤 Artista acertado · ⭐ +1"],
  ["🎤 Künstler nicht erraten", "🎤 Artist not guessed", "🎤 Artiste pas trouvé", "🎤 Artista non indovinato", "🎤 Artista no acertado", "🎤 Artista não acertado"],
  ["🎵 Titel erraten · ⭐ +1", "🎵 Title guessed · ⭐ +1", "🎵 Titre trouvé · ⭐ +1", "🎵 Titolo indovinato · ⭐ +1", "🎵 Título acertado · ⭐ +1", "🎵 Título acertado · ⭐ +1"],
  ["🎵 Titel nicht erraten", "🎵 Title not guessed", "🎵 Titre pas trouvé", "🎵 Titolo non indovinato", "🎵 Título no acertado", "🎵 Título não acertado"],
  ["✅ Ich bin fertig", "✅ I'm ready", "✅ Je suis prêt", "✅ Sono pronto", "✅ Estoy listo", "✅ Estou pronto"],
  ["✓ Fertig – warte auf den Start", "✓ Ready – waiting for the start", "✓ Prêt – en attente du départ", "✓ Pronto – in attesa dell'inizio", "✓ Listo: esperando el inicio", "✓ Pronto – aguardando o início"],
  ["Schritt {0} von {1}", "Step {0} of {1}", "Étape {0} sur {1}", "Passo {0} di {1}", "Paso {0} de {1}", "Passo {0} de {1}"],
  ["{0} hat getippt · {1} von {2}", "{0} has tapped · {1} of {2}", "{0} a joué · {1} sur {2}", "{0} ha scelto · {1} su {2}", "{0} ya eligió · {1} de {2}", "{0} já escolheu · {1} de {2}"],
  ["{0} von {1} haben getippt", "{0} of {1} have tapped", "{0} sur {1} ont joué", "{0} su {1} hanno scelto", "{0} de {1} ya eligieron", "{0} de {1} já escolheram"],
  ["Alle haben getippt", "Everyone has tapped", "Tout le monde a joué", "Hanno scelto tutti", "Todos han elegido", "Todos escolheram"],
  ["Auflösung kommt", "Reveal coming", "Résultat imminent", "Arriva la soluzione", "Llega la solución", "Vem a resposta"],
  ["🏆 Beste der Runde", "🏆 Best of the round", "🏆 Meilleurs de la manche", "🏆 I migliori del round", "🏆 Los mejores de la ronda", "🏆 Melhores da rodada"],
  ["🔁 Noch mal spielen", "🔁 Play again", "🔁 Rejouer", "🔁 Gioca ancora", "🔁 Jugar otra vez", "🔁 Jogar de novo"],
  ["Spiel verlassen", "Leave game", "Quitter la partie", "Esci dalla partita", "Salir de la partida", "Sair do jogo"],
  ["Wirklich verlassen? Nochmal tippen", "Really leave? Tap again", "Vraiment quitter ? Touchez encore", "Vuoi davvero uscire? Tocca ancora", "¿Salir de verdad? Toca otra vez", "Sair mesmo? Toque de novo"],
  ["Spiel beenden", "Close game", "Terminer la partie", "Termina la partita", "Terminar partida", "Encerrar jogo"],
  ["Revanche (gleiche Runde)", "Rematch (same players)", "Revanche (mêmes joueurs)", "Rivincita (stessi giocatori)", "Revancha (mismos jugadores)", "Revanche (mesmos jogadores)"],

  // ---- Host: Spiel ----
  ["Abspielen", "Play", "Lecture", "Riproduci", "Reproducir", "Tocar"],
  ["Pause", "Pause", "Pause", "Pausa", "Pausa", "Pausar"],
  ["Stechen · Runde {0}", "Tiebreak · Round {0}", "Départage · Manche {0}", "Spareggio · Round {0}", "Desempate · Ronda {0}", "Desempate · Rodada {0}"],
  ["Runde {0}", "Round {0}", "Manche {0}", "Round {0}", "Ronda {0}", "Rodada {0}"],
  ["{0} · alle sind dran", "{0} · everyone's turn", "{0} · à tout le monde", "{0} · tocca a tutti", "{0} · os toca a todos", "{0} · vez de todos"],
  ["{0} · {1} ist dran", "{0} · {1}'s turn", "{0} · au tour de {1}", "{0} · tocca a {1}", "{0} · le toca a {1}", "{0} · vez de {1}"],
  ["Welches Jahr?", "Which year?", "Quelle année ?", "Che anno?", "¿Qué año?", "Que ano?"],
  ["Hör genau hin …", "Listen closely …", "Écoute bien …", "Ascolta bene …", "Escucha bien …", "Escute bem …"],
  ["Die Musik läuft auf euren Handys.", "The music plays on your phones.", "La musique passe sur vos téléphones.", "La musica suona sui vostri telefoni.", "La música suena en vuestros móviles.", "A música toca nos celulares de vocês."],
  ["Die Musik läuft auf dem Handy von {0}.", "The music plays on {0}'s phone.", "La musique passe sur le téléphone de {0}.", "La musica suona sul telefono di {0}.", "La música suena en el móvil de {0}.", "A música toca no celular de {0}."],
  ["✓ Alle haben getippt – Auflösung in 5 Sekunden.", "✓ Everyone has tapped – reveal in 5 seconds.", "✓ Tout le monde a joué – réponse dans 5 secondes.", "✓ Hanno scelto tutti – soluzione tra 5 secondi.", "✓ Todos han elegido: solución en 5 segundos.", "✓ Todos escolheram – resposta em 5 segundos."],
  ["✓ Getippt – die Auflösung kommt, wenn der Song zu Ende ist.", "✓ Tapped – the reveal comes when the song ends.", "✓ C'est joué – la réponse arrive à la fin de la chanson.", "✓ Scelto – la soluzione arriva quando finisce la canzone.", "✓ Elegido: la solución llega cuando acabe la canción.", "✓ Escolhido – a resposta vem quando a música acabar."],
  ["Alle sortieren den Song am Handy ein.", "Everyone places the song on their phone.", "Chacun place la chanson sur son téléphone.", "Tutti piazzano la canzone sul telefono.", "Todos colocan la canción en el móvil.", "Todos posicionam a música no celular."],
  ["{0} sortiert den Song am Handy ein.", "{0} places the song on their phone.", "{0} place la chanson sur son téléphone.", "{0} piazza la canzone sul telefono.", "{0} coloca la canción en el móvil.", "{0} posiciona a música no celular."],
  ["Ausschnitt wird vorbereitet …", "Preparing clip …", "Préparation de l'extrait …", "Preparo lo spezzone …", "Preparando el fragmento …", "Preparando o trecho …"],
  ["{0} von {1} richtig", "{0} of {1} correct", "{0} sur {1} justes", "{0} su {1} giusti", "{0} de {1} aciertos", "{0} de {1} certos"],
  ["✓ {0} liegt richtig", "✓ {0} is right", "✓ {0} a juste", "✓ {0} ha indovinato", "✓ {0} acierta", "✓ {0} acertou"],
  ["⏱ {0}: Zeit abgelaufen", "⏱ {0}: time's up", "⏱ {0} : temps écoulé", "⏱ {0}: tempo scaduto", "⏱ {0}: se acabó el tiempo", "⏱ {0}: tempo esgotado"],
  ["✗ {0} liegt daneben", "✗ {0} is off", "✗ {0} s'est trompé", "✗ {0} ha sbagliato", "✗ {0} falla", "✗ {0} errou"],
  ["✗ Niemand lag richtig", "✗ Nobody got it right", "✗ Personne n'a trouvé", "✗ Nessuno ha indovinato", "✗ Nadie acertó", "✗ Ninguém acertou"],
  ["Niemand", "Nobody", "Personne", "Nessuno", "Nadie", "Ninguém"],
  ["Karte geht in den Zeitstrahl, wer richtig lag", "Card goes on the timeline of whoever was right", "La carte va sur la frise de ceux qui avaient juste", "La carta va nella linea del tempo di chi ha indovinato", "La carta va a la línea del tiempo de quien acertó", "A carta vai para a linha do tempo de quem acertou"],
  ["Karte geht in den Zeitstrahl", "Card goes on the timeline", "La carte va sur la frise", "La carta va nella linea del tempo", "La carta va a la línea del tiempo", "A carta vai para a linha do tempo"],
  ["Karte ist raus", "Card is out", "La carte est éliminée", "La carta è fuori", "La carta queda fuera", "A carta saiu"],
  ["Karte geht zurück in den Stapel", "Card goes back into the deck", "La carte retourne dans la pile", "La carta torna nel mazzo", "La carta vuelve al mazo", "A carta volta para o monte"],
  ["Der Song kommt später nochmal", "The song comes back later", "La chanson reviendra plus tard", "La canzone tornerà più tardi", "La canción volverá más tarde", "A música volta depois"],
  ["Der Song kommt später nochmal.", "The song comes back later.", "La chanson reviendra plus tard.", "La canzone tornerà più tardi.", "La canción volverá más tarde.", "A música volta depois."],
  ["🗓️ {0}0er", "🗓️ {0}0s", "🗓️ années {0}0", "🗓️ anni {0}0", "🗓️ años {0}0", "🗓️ anos {0}0"],
  ["🎧 Hörprobe & Cover:", "🎧 Preview & cover:", "🎧 Extrait et pochette :", "🎧 Anteprima e copertina:", "🎧 Vista previa y portada:", "🎧 Prévia e capa:"],
  ["Hörprobe & Cover:", "Preview & cover:", "Extrait et pochette :", "Anteprima e copertina:", "Vista previa y portada:", "Prévia e capa:"],
  // Deck-Namen (Land + Thema, siehe editionsName in listen.ts)
  ["Deutschlands {0}", "Germany's {0}", "{0} d'Allemagne", "{0} della Germania", "{0} de Alemania", "{0} da Alemanha"],
  ["Mitteleuropas {0}", "Central Europe's {0}", "{0} d'Europe centrale", "{0} dell'Europa centrale", "{0} de Europa Central", "{0} da Europa Central"],
  ["Frankreichs {0}", "France's {0}", "{0} de France", "{0} della Francia", "{0} de Francia", "{0} da França"],
  ["Kanadas {0}", "Canada's {0}", "{0} du Canada", "{0} del Canada", "{0} de Canadá", "{0} do Canadá"],
  ["Hollands {0}", "Holland's {0}", "{0} des Pays-Bas", "{0} dei Paesi Bassi", "{0} de los Países Bajos", "{0} da Holanda"],
  ["Ungarns {0}", "Hungary's {0}", "{0} de Hongrie", "{0} dell'Ungheria", "{0} de Hungría", "{0} da Hungria"],
  ["Nordeuropas {0}", "Northern Europe's {0}", "{0} d'Europe du Nord", "{0} del Nord Europa", "{0} del norte de Europa", "{0} do norte da Europa"],
  ["Hits aller Jahrzehnte", "Hits of Every Decade", "Tubes de toutes les décennies", "Successi di ogni decennio", "Éxitos de todas las décadas", "Hits de todas as décadas"],
  ["Radio-Klassiker", "Radio Classics", "Classiques de la radio", "Classici della radio", "Clásicos de la radio", "Clássicos do rádio"],
  ["Partykracher", "Party Bangers", "Tubes de fête", "Successi da festa", "Éxitos de fiesta", "Hits de festa"],
  ["Rock-Hits", "Rock Hits", "Tubes rock", "Successi rock", "Éxitos de rock", "Hits de rock"],
  ["Film- & TV-Hits", "Film & TV Hits", "Tubes de films et séries", "Successi di film e TV", "Éxitos de cine y TV", "Hits de filmes e TV"],
  ["Heimliche Lieblingshits", "Guilty Pleasures", "Plaisirs coupables", "Piaceri proibiti", "Placeres culposos", "Prazeres culposos"],
  ["Sommerhits", "Summer Hits", "Tubes de l'été", "Successi estivi", "Éxitos del verano", "Hits de verão"],
  ["Weihnachtshits", "Christmas Hits", "Tubes de Noël", "Successi di Natale", "Éxitos navideños", "Hits de Natal"],
  ["Schlager", "Schlager", "Schlager", "Schlager", "Schlager", "Schlager"],
  ["Hit-Bingo", "Hit Bingo", "Bingo des tubes", "Bingo dei successi", "Bingo de éxitos", "Bingo de hits"],
  ["Hits", "Hits", "Tubes", "Successi", "Éxitos", "Hits"],
  ["Schnelle Partie", "Quick game", "Partie rapide", "Partita veloce", "Partida rápida", "Partida rápida"],
  ["Gemütlicher Abend", "Relaxed evening", "Soirée tranquille", "Serata tranquilla", "Noche tranquila", "Noite tranquila"],
  ["Für Musik-Kenner", "For music buffs", "Pour les mélomanes", "Per veri intenditori", "Para expertos en música", "Para fãs de música"],
  ["Karten", "cards", "cartes", "carte", "cartas", "cartas"],
  ["So geht's", "How to play", "Comment jouer", "Come si gioca", "Cómo se juega", "Como jogar"],
  ["HitYear ist ein kostenloses Musik-Partyspiel im Browser. Ein Song läuft, alle hören rein und sortieren ihn nach seinem Erscheinungsjahr in den eigenen Zeitstrahl.", "HitYear is a free music party game in the browser. A song plays, everyone listens and places it by its release year in their own timeline.", "HitYear est un jeu musical gratuit dans le navigateur. Un morceau passe, tout le monde écoute et le place selon son année de sortie dans sa propre frise.", "HitYear è un gioco musicale gratuito nel browser. Parte una canzone, tutti ascoltano e la mettono nella propria linea del tempo in base all'anno di uscita.", "HitYear es un juego musical gratuito en el navegador. Suena una canción, todos escuchan y la colocan en su propia línea de tiempo según su año de lanzamiento.", "HitYear é um jogo musical gratuito no navegador. Toca uma música, todos ouvem e a colocam na própria linha do tempo pelo ano de lançamento."],
  ["In vier Schritten", "In four steps", "En quatre étapes", "In quattro passi", "En cuatro pasos", "Em quatro passos"],
  ["Öffne hityear.app am Fernseher oder Laptop und tippe auf „Spiel erstellen“.", "Open hityear.app on a TV or laptop and tap “Create game”.", "Ouvre hityear.app sur une télé ou un ordinateur et touche « Créer une partie ».", "Apri hityear.app sulla TV o sul portatile e tocca “Crea partita”.", "Abre hityear.app en la tele o el portátil y pulsa «Crear partida».", "Abra hityear.app na TV ou no notebook e toque em “Criar partida”."],
  ["Alle scannen den QR-Code mit dem Handy – ohne App und ohne Konto.", "Everyone scans the QR code with their phone – no app, no account.", "Tout le monde scanne le QR code avec son téléphone – sans appli ni compte.", "Tutti scansionano il codice QR con il telefono – senza app e senza account.", "Todos escanean el código QR con el móvil, sin app y sin cuenta.", "Todos escaneiam o QR code com o celular – sem app e sem conta."],
  ["Ein 30-Sekunden-Ausschnitt läuft. Jeder legt den Song vor, zwischen oder hinter seine Karten.", "A 30-second clip plays. Everyone places the song before, between or after their cards.", "Un extrait de 30 secondes passe. Chacun place le morceau avant, entre ou après ses cartes.", "Parte un estratto di 30 secondi. Ognuno mette la canzone prima, tra o dopo le sue carte.", "Suena un fragmento de 30 segundos. Cada uno coloca la canción antes, entre o después de sus cartas.", "Toca um trecho de 30 segundos. Cada um coloca a música antes, entre ou depois das suas cartas."],
  ["Richtig gelegt heißt: Karte behalten. Wer zuerst 10, 15 oder 20 Karten hat, gewinnt.", "Placed correctly means you keep the card. The first to reach 10, 15 or 20 cards wins.", "Bien placé, tu gardes la carte. Le premier à 10, 15 ou 20 cartes gagne.", "Se è giusta, tieni la carta. Vince chi arriva per primo a 10, 15 o 20 carte.", "Si aciertas, te quedas la carta. Gana quien llegue primero a 10, 15 o 20 cartas.", "Acertou, fica com a carta. Ganha quem chegar primeiro a 10, 15 ou 20 cartas."],
  ["Häufige Fragen", "Frequently asked questions", "Questions fréquentes", "Domande frequenti", "Preguntas frecuentes", "Perguntas frequentes"],
  ["Kostet HitYear etwas?", "Does HitYear cost anything?", "HitYear est-il payant ?", "HitYear costa qualcosa?", "¿HitYear cuesta algo?", "O HitYear custa alguma coisa?"],
  ["Nein. HitYear ist kostenlos, ohne Werbung und ohne Konto.", "No. HitYear is free, with no ads and no account.", "Non. HitYear est gratuit, sans publicité et sans compte.", "No. HitYear è gratuito, senza pubblicità e senza account.", "No. HitYear es gratis, sin anuncios y sin cuenta.", "Não. O HitYear é gratuito, sem anúncios e sem conta."],
  ["Brauche ich eine App?", "Do I need an app?", "Faut-il une appli ?", "Serve un'app?", "¿Necesito una app?", "Preciso de um app?"],
  ["Nein. HitYear läuft im Browser auf Fernseher, Laptop, Tablet und Handy. Auf Wunsch lässt es sich wie eine App auf den Startbildschirm legen.", "No. HitYear runs in the browser on TVs, laptops, tablets and phones. If you like, you can add it to your home screen like an app.", "Non. HitYear fonctionne dans le navigateur sur télé, ordinateur, tablette et téléphone. Tu peux aussi l'ajouter à l'écran d'accueil comme une appli.", "No. HitYear funziona nel browser su TV, portatile, tablet e telefono. Se vuoi, puoi aggiungerlo alla schermata Home come un'app.", "No. HitYear funciona en el navegador en tele, portátil, tablet y móvil. Si quieres, puedes añadirlo a la pantalla de inicio como una app.", "Não. O HitYear roda no navegador em TV, notebook, tablet e celular. Se quiser, dá para colocá-lo na tela inicial como um app."],
  ["Wie viele können mitspielen?", "How many people can play?", "Combien de joueurs ?", "Quanti possono giocare?", "¿Cuántos pueden jugar?", "Quantas pessoas podem jogar?"],
  ["Eine bis sechs Personen, jede mit dem eigenen Handy. Freie Plätze können KI-Bots übernehmen.", "One to six people, each on their own phone. AI bots can take free seats.", "De une à six personnes, chacune avec son téléphone. Des bots IA peuvent prendre les places libres.", "Da una a sei persone, ognuna con il proprio telefono. I posti liberi possono essere presi da bot IA.", "De una a seis personas, cada una con su móvil. Los bots de IA pueden ocupar los puestos libres.", "De uma a seis pessoas, cada uma com o próprio celular. Bots de IA podem ocupar os lugares livres."],
  ["Kann man auch online zusammen spielen?", "Can we play together online?", "Peut-on jouer ensemble en ligne ?", "Si può giocare insieme online?", "¿Se puede jugar juntos en línea?", "Dá para jogar junto online?"],
  ["Ja. Bei „Online (auf dem Handy)“ spielt jedes Handy die Musik selbst ab – ihr müsst nicht im selben Raum sein.", "Yes. With “Online (on the phone)” every phone plays the music itself – you don't have to be in the same room.", "Oui. Avec « En ligne (sur le téléphone) », chaque téléphone joue la musique lui-même – pas besoin d'être dans la même pièce.", "Sì. Con “Online (sul telefono)” ogni telefono riproduce la musica da sé – non serve stare nella stessa stanza.", "Sí. Con «En línea (en el móvil)» cada móvil reproduce la música; no hace falta estar en la misma habitación.", "Sim. Com “Online (no celular)” cada celular toca a música sozinho – vocês não precisam estar na mesma sala."],
  ["Woher kommt die Musik?", "Where does the music come from?", "D'où vient la musique ?", "Da dove arriva la musica?", "¿De dónde sale la música?", "De onde vem a música?"],
  ["Die Hörproben streamt dein Browser direkt von Deezer, bei manchen Songs von Apple Music. HitYear speichert keine Musik.", "Your browser streams the previews directly from Deezer, for some songs from Apple Music. HitYear stores no music.", "Ton navigateur diffuse les extraits directement depuis Deezer, pour certains morceaux depuis Apple Music. HitYear ne stocke aucune musique.", "Il browser riproduce le anteprime direttamente da Deezer, per alcune canzoni da Apple Music. HitYear non salva musica.", "Tu navegador reproduce los fragmentos directamente desde Deezer y, en algunas canciones, desde Apple Music. HitYear no guarda música.", "Seu navegador transmite as prévias direto do Deezer e, em algumas músicas, do Apple Music. O HitYear não armazena música."],
  ["Welche Songs gibt es?", "Which songs are there?", "Quels morceaux y a-t-il ?", "Quali canzoni ci sono?", "¿Qué canciones hay?", "Quais músicas existem?"],
  ["Decks nach Land und Thema, zum Beispiel Hits aller Jahrzehnte, Partykracher, Rock oder Schlager. Jahrzehnte und Genres lassen sich filtern.", "Decks by country and theme, for example hits of all decades, party hits, rock or schlager. You can filter by decade and genre.", "Des decks par pays et par thème, par exemple les tubes de toutes les décennies, les tubes de fête, le rock ou le schlager. On peut filtrer par décennie et par genre.", "Mazzi per paese e tema, per esempio successi di tutti i decenni, hit da festa, rock o schlager. Si possono filtrare decenni e generi.", "Mazos por país y tema, por ejemplo éxitos de todas las décadas, éxitos de fiesta, rock o schlager. Se pueden filtrar décadas y géneros.", "Baralhos por país e tema, por exemplo hits de todas as décadas, hits de festa, rock ou schlager. Dá para filtrar por década e gênero."],
  ["Ist HitYear Open Source?", "Is HitYear open source?", "HitYear est-il open source ?", "HitYear è open source?", "¿HitYear es de código abierto?", "O HitYear é open source?"],
  ["Der Quellcode steht auf GitHub unter der Lizenz PolyForm Noncommercial. Private Nutzung, Änderungen und Mitarbeit sind willkommen, kommerzielle Nutzung nicht.", "The source code is on GitHub under the PolyForm Noncommercial license. Private use, changes and contributions are welcome, commercial use is not.", "Le code source est sur GitHub sous licence PolyForm Noncommercial. Usage privé, modifications et contributions bienvenus, usage commercial non.", "Il codice sorgente è su GitHub con licenza PolyForm Noncommercial. Uso privato, modifiche e contributi sono benvenuti, l'uso commerciale no.", "El código fuente está en GitHub con la licencia PolyForm Noncommercial. Se aceptan el uso privado, los cambios y las contribuciones, pero no el uso comercial.", "O código-fonte está no GitHub sob a licença PolyForm Noncommercial. Uso privado, alterações e contribuições são bem-vindos, uso comercial não."],
  ["Darf ich HitYear in einer Kneipe oder auf einer Veranstaltung nutzen?", "May I use HitYear in a pub or at an event?", "Puis-je utiliser HitYear dans un bar ou lors d'un événement ?", "Posso usare HitYear in un locale o a un evento?", "¿Puedo usar HitYear en un bar o en un evento?", "Posso usar o HitYear num bar ou num evento?"],
  ["Nein. HitYear ist nur für private Runden gedacht. Öffentliche Wiedergabe ist nicht erlaubt.", "No. HitYear is only meant for private groups. Public performance is not allowed.", "Non. HitYear est réservé aux parties privées. La diffusion publique n'est pas autorisée.", "No. HitYear è pensato solo per gruppi privati. La riproduzione pubblica non è consentita.", "No. HitYear es solo para grupos privados. La reproducción pública no está permitida.", "Não. O HitYear é só para grupos privados. Reprodução pública não é permitida."],
  ["So geht's & häufige Fragen", "How to play & FAQ", "Comment jouer & FAQ", "Come si gioca & FAQ", "Cómo se juega y preguntas frecuentes", "Como jogar & perguntas frequentes"],
  ["TV", "TV", "Télé", "TV", "Tele", "TV"],
  ["Handys", "Phones", "Mobiles", "Telefoni", "Móviles", "Celulares"],
  ["Party vor Ort", "Party at home", "Fête sur place", "Festa dal vivo", "Fiesta en casa", "Festa ao vivo"],
  ["Online spielen", "Play online", "Jouer en ligne", "Gioca online", "Jugar online", "Jogar online"],
  ["Ton vom TV", "Sound from TV", "Son sur la télé", "Audio dalla TV", "Sonido en la tele", "Som na TV"],
  ["Ton am Handy", "Sound on phones", "Son sur mobile", "Audio sul telefono", "Sonido en el móvil", "Som no celular"],
  ["gleichzeitig", "at once", "en même temps", "insieme", "a la vez", "juntos"],
  ["Für viele", "For big groups", "Pour les groupes", "Per tanti", "Para grupos", "Para grupos"],
  ["Reihum", "Take turns", "Chacun son tour", "A turno", "Por turnos", "Revezando"],
  ["einer ist dran", "one at a time", "un à la fois", "uno alla volta", "uno a la vez", "um de cada vez"],
  ["Zum Mitfiebern", "Cheer along", "Pour encourager", "Per fare il tifo", "Para animar", "Para torcer"],
  ["ganzer Song", "full preview", "extrait entier", "anteprima intera", "vista previa entera", "prévia inteira"],
  ["alle fertig", "all answered", "tous ont répondu", "tutti hanno risposto", "todos respondieron", "todos responderam"],
  ["Ausgewogen", "Balanced", "Équilibré", "Equilibrato", "Equilibrado", "Equilibrado"],
  ["ab 1. Antwort", "after 1st answer", "après la 1re réponse", "dopo la 1ª risposta", "tras la 1.ª respuesta", "após a 1ª resposta"],
  ["Schnelle Runden", "Fast rounds", "Manches rapides", "Round veloci", "Rondas rápidas", "Rodadas rápidas"],
  ["Jahr", "Year", "Année", "Anno", "Año", "Ano"],
  ["zählt allein", "only", "seulement", "e basta", "y nada más", "e só"],
  ["Der Klassiker", "The classic", "Le classique", "Il classico", "El clásico", "O clássico"],
  ["Jahr +", "Year +", "Année +", "Anno +", "Año +", "Ano +"],
  ["Song & Interpret", "title & artist", "titre & artiste", "titolo & artista", "título y artista", "título & artista"],
  ["Für Musik-Profis", "For music pros", "Pour les pros", "Per esperti", "Para expertos", "Para especialistas"],
  ["Bots füllen auf", "bots fill in", "des bots complètent", "i bot completano", "bots completan", "bots completam"],
  ["Immer 6 Plätze", "Always 6 seats", "Toujours 6 places", "Sempre 6 posti", "Siempre 6 plazas", "Sempre 6 lugares"],
  ["keine Bots", "no bots", "pas de bots", "niente bot", "sin bots", "sem bots"],
  ["Nur Menschen", "Humans only", "Humains seulement", "Solo umani", "Solo humanos", "Só humanos"],
  ["{0} Karten", "{0} cards", "{0} cartes", "{0} carte", "{0} cartas", "{0} cartas"],
  ["🎧 Hörprobe: {0}", "🎧 Preview: {0}", "🎧 Extrait : {0}", "🎧 Anteprima: {0}", "🎧 Vista previa: {0}", "🎧 Prévia: {0}"],
  ["Hörprobe & Cover bereitgestellt von {0}", "Preview & cover provided by {0}", "Extrait et pochette fournis par {0}", "Anteprima e copertina fornite da {0}", "Vista previa y portada proporcionadas por {0}", "Prévia e capa fornecidas por {0}"],
  ["Jahreshits", "Hits of the Year", "Tubes de l'année", "Successi dell'anno", "Éxitos del año", "Hits do ano"],
  ["Quellcode auf GitHub", "Source code on GitHub", "Code source sur GitHub", "Codice sorgente su GitHub", "Código fuente en GitHub", "Código-fonte no GitHub"],
  ["Quellcode auf GitHub (Open Source, nicht kommerziell)", "Source code on GitHub (open source, non-commercial)", "Code source sur GitHub (open source, non commercial)", "Codice sorgente su GitHub (open source, non commerciale)", "Código fuente en GitHub (código abierto, no comercial)", "Código-fonte no GitHub (código aberto, não comercial)"],
  ["Wischen für mehr", "Swipe for more", "Glisse pour en voir plus", "Scorri per vederne altri", "Desliza para ver más", "Deslize para ver mais"],
  ["Scrollen oder Pfeile für mehr", "Scroll or use the arrows for more", "Fais défiler ou utilise les flèches", "Scorri o usa le frecce per vederne altri", "Desplázate o usa las flechas para ver más", "Role ou use as setas para ver mais"],
  ["Auf Apple Music anhören", "Listen on Apple Music", "Écouter sur Apple Music", "Ascolta su Apple Music", "Escuchar en Apple Music", "Ouvir no Apple Music"],
  ["Auf Deezer anhören", "Listen on Deezer", "Écouter sur Deezer", "Ascolta su Deezer", "Escuchar en Deezer", "Ouvir no Deezer"],
  ["Hörprobe & Cover: Apple Music", "Preview & cover: Apple Music", "Extrait et pochette : Apple Music", "Anteprima e copertina: Apple Music", "Vista previa y portada: Apple Music", "Prévia e capa: Apple Music"],
  ["Hörprobe & Cover: Deezer", "Preview & cover: Deezer", "Extrait et pochette : Deezer", "Anteprima e copertina: Deezer", "Vista previa y portada: Deezer", "Prévia e capa: Deezer"],
  ["Cover: {0}", "Cover: {0}", "Pochette : {0}", "Copertina: {0}", "Portada: {0}", "Capa: {0}"],
  ["nichts eingegeben", "nothing entered", "rien saisi", "nessuna risposta", "nada introducido", "nada informado"],
  ["vor {0}", "before {0}", "avant {0}", "prima del {0}", "antes de {0}", "antes de {0}"],
  ["nach {0}", "after {0}", "après {0}", "dopo il {0}", "después de {0}", "depois de {0}"],
  ["Dein Tipp: {0}", "Your guess: {0}", "Ton choix : {0}", "La tua scelta: {0}", "Tu apuesta: {0}", "Seu palpite: {0}"],
  ["zwischen {0} und {1}", "between {0} and {1}", "entre {0} et {1}", "tra il {0} e il {1}", "entre {0} y {1}", "entre {0} e {1}"],
  ["erste Karte", "first card", "première carte", "prima carta", "primera carta", "primeira carta"],
  ["✓ Jahr · 🎤 rät …", "✓ Year · 🎤 guessing …", "✓ Année · 🎤 devine …", "✓ Anno · 🎤 indovina …", "✓ Año · 🎤 adivinando …", "✓ Ano · 🎤 adivinhando …"],
  ["✓ fertig", "✓ done", "✓ fini", "✓ fatto", "✓ listo", "✓ pronto"],
  ["überlegt …", "thinking …", "réfléchit …", "ci pensa …", "pensando …", "pensando …"],
  ["hier getippt", "tapped here", "placé ici", "scelto qui", "elegido aquí", "escolhido aqui"],
  ["Interpret & Titel", "Artist & title", "Artiste & titre", "Artista & titolo", "Artista y título", "Artista & título"],
  ["Interpret", "Artist", "Artiste", "Artista", "Artista", "Artista"],
  ["Titel", "Title", "Titre", "Titolo", "Título", "Título"],
  ["⭐ {0} richtig! +{1}", "⭐ {0} correct! +{1}", "⭐ {0} trouvé ! +{1}", "⭐ {0} giusto! +{1}", "⭐ ¡{0} correcto! +{1}", "⭐ {0} certo! +{1}"],
  ["✓ Richtig!", "✓ Correct!", "✓ Bravo !", "✓ Giusto!", "✓ ¡Correcto!", "✓ Certo!"],
  ["✗ Daneben", "✗ Missed", "✗ Raté", "✗ Sbagliato", "✗ Fallo", "✗ Errou"],
  ["{0} Karten · {1} % Treffer", "{0} cards · {1} % hits", "{0} cartes · {1} % de réussite", "{0} carte · {1} % di centri", "{0} cartas · {1} % de aciertos", "{0} cartas · {1} % de acertos"],
  ["{0} Karten · {1} % Treffer · ⭐ {2} Punkte", "{0} cards · {1} % hits · ⭐ {2} points", "{0} cartes · {1} % de réussite · ⭐ {2} points", "{0} carte · {1} % di centri · ⭐ {2} punti", "{0} cartas · {1} % de aciertos · ⭐ {2} puntos", "{0} cartas · {1} % de acertos · ⭐ {2} pontos"],
  ["Abspielen nicht möglich – Ausschnitt noch nicht bereit oder vom Browser blockiert.", "Can't play – clip not ready yet or blocked by the browser.", "Lecture impossible – extrait pas prêt ou bloqué par le navigateur.", "Impossibile riprodurre – spezzone non pronto o bloccato dal browser.", "No se puede reproducir: el fragmento no está listo o el navegador lo bloquea.", "Não dá para tocar – trecho ainda não pronto ou bloqueado pelo navegador."],
  ["Nächster Song in {0} s", "Next song in {0} s", "Chanson suivante dans {0} s", "Prossima canzone tra {0} s", "Siguiente canción en {0} s", "Próxima música em {0} s"],
  ["Eure Startkarte", "Your starting card", "Votre carte de départ", "La vostra carta iniziale", "Vuestra carta inicial", "Sua carta inicial"],
  ["Alle beginnen ihren Zeitstrahl mit diesem Song.", "Everyone starts their timeline with this song.", "Tout le monde commence sa frise avec cette chanson.", "Tutti iniziano la loro linea del tempo con questa canzone.", "Todos empiezan su línea del tiempo con esta canción.", "Todos começam a linha do tempo com esta música."],
  ["Gleich geht's los", "Get ready", "C'est parti dans", "Si parte tra", "Prepárate", "Prepare-se"],
  ["Nächster Song", "Next song", "Chanson suivante", "Prossima canzone", "Siguiente canción", "Próxima música"],
  ["Nächster Song kommt …", "Next song coming …", "La chanson suivante arrive …", "Arriva la prossima canzone …", "Llega la siguiente canción …", "Lá vem a próxima música …"],

  // ---- Handy ----
  ["Raum", "Room", "Salle", "Stanza", "Sala", "Sala"],
  ["Dein Name", "Your name", "Ton nom", "Il tuo nome", "Tu nombre", "Seu nome"],
  ["Dein Avatar", "Your avatar", "Ton avatar", "Il tuo avatar", "Tu avatar", "Seu avatar"],
  ["Avatar wählen", "Choose avatar", "Choisir un avatar", "Scegli l'avatar", "Elegir avatar", "Escolher avatar"],
  ["Avatar {0}", "Avatar {0}", "Avatar {0}", "Avatar {0}", "Avatar {0}", "Avatar {0}"],
  ["Du bist dabei,", "You're in,", "Tu es dans la partie,", "Ci sei,", "Ya estás dentro,", "Você está dentro,"],
  ["Warte hier auf deine Mitspieler!", "Wait here for your fellow players!", "Attends ici tes coéquipiers !", "Aspetta qui gli altri giocatori!", "¡Espera aquí a tus compañeros!", "Espere aqui pelos outros jogadores!"],
  ["Dein Zeitstrahl", "Your timeline", "Ta frise", "La tua linea del tempo", "Tu línea del tiempo", "Sua linha do tempo"],
  ["Interpret oder Band", "Artist or band", "Artiste ou groupe", "Artista o band", "Artista o grupo", "Artista ou banda"],
  ["Interpret oder Band raten", "Guess artist or band", "Deviner l'artiste ou le groupe", "Indovina artista o band", "Adivina artista o grupo", "Adivinhe artista ou banda"],
  ["Titel des Songs", "Song title", "Titre de la chanson", "Titolo della canzone", "Título de la canción", "Título da música"],
  ["Titel raten", "Guess the title", "Deviner le titre", "Indovina il titolo", "Adivina el título", "Adivinhe o título"],
  ["Hier einordnen ✓", "Place here ✓", "Placer ici ✓", "Metti qui ✓", "Colocar aquí ✓", "Posicionar aqui ✓"],
  ["Datenschutz", "Privacy", "Confidentialité", "Privacy", "Privacidad", "Privacidade"],
  ["AGB", "Terms", "CGU", "Termini", "Términos", "Termos"],
  ["Darf HitYear mitzählen?", "May HitYear count your visit?", "HitYear peut-il compter ta visite ?", "HitYear può contare la tua visita?", "¿Puede HitYear contar tu visita?", "O HitYear pode contar a tua visita?"],
  ["Mit deiner Zustimmung zählen wir anonym mit Matomo auf unserem eigenen Server, welche Seiten genutzt werden. Dafür setzt Matomo Cookies. Ohne Zustimmung läuft alles genauso.", "With your consent we use Matomo on our own server to count anonymously which pages are used. Matomo sets cookies for this. Without consent everything works the same.", "Avec ton accord, nous comptons anonymement avec Matomo, sur notre propre serveur, les pages utilisées. Matomo dépose pour cela des cookies. Sans accord, tout fonctionne pareil.", "Con il tuo consenso contiamo in modo anonimo con Matomo, sul nostro server, quali pagine vengono usate. Per questo Matomo imposta dei cookie. Senza consenso tutto funziona allo stesso modo.", "Con tu consentimiento contamos de forma anónima con Matomo, en nuestro propio servidor, qué páginas se usan. Para ello Matomo usa cookies. Sin consentimiento todo funciona igual.", "Com o teu consentimento contamos de forma anónima com o Matomo, no nosso próprio servidor, que páginas são usadas. Para isso o Matomo usa cookies. Sem consentimento tudo funciona igual."],
  ["Mehr erfahren", "Learn more", "En savoir plus", "Scopri di più", "Más información", "Saber mais"],
  ["Ablehnen", "Decline", "Refuser", "Rifiuta", "Rechazar", "Recusar"],
  ["Zustimmen", "Accept", "Accepter", "Accetta", "Aceptar", "Aceitar"],
  ["‹ Zur Startseite", "‹ Back to home", "‹ Retour à l'accueil", "‹ Torna alla home", "‹ Volver al inicio", "‹ Voltar ao início"],
  ["Psst … wie lautet das Passwort?", "Psst … what's the password?", "Psst … quel est le mot de passe ?", "Psst … qual è la password?", "Psst… ¿cuál es la contraseña?", "Psiu … qual é a senha?"],
  ["HitYear ist gerade nur mit Passwort spielbar.", "HitYear is password-protected right now.", "HitYear n'est jouable qu'avec un mot de passe pour le moment.", "HitYear è giocabile solo con password al momento.", "HitYear solo se puede jugar con contraseña por ahora.", "HitYear só pode ser jogado com senha no momento."],
  ["Rein da! 🎶", "Let me in! 🎶", "On y va ! 🎶", "Fammi entrare! 🎶", "¡Adentro! 🎶", "Bora entrar! 🎶"],
  ["Passwort", "Password", "Mot de passe", "Password", "Contraseña", "Senha"],
  ["Passwort falsch.", "Wrong password.", "Mot de passe incorrect.", "Password errata.", "Contraseña incorrecta.", "Senha incorreta."],
  ["Bitte zuerst das Passwort eingeben.", "Please enter the password first.", "Saisis d'abord le mot de passe.", "Inserisci prima la password.", "Introduce primero la contraseña.", "Digite a senha primeiro."],
  ["Zu viele Versuche. Bitte in 10 Minuten erneut.", "Too many attempts. Please try again in 10 minutes.", "Trop de tentatives. Réessaie dans 10 minutes.", "Troppi tentativi. Riprova tra 10 minuti.", "Demasiados intentos. Vuelve a intentarlo en 10 minutos.", "Tentativas demais. Tente novamente em 10 minutos."],
  ["Warte auf {0} …", "Waiting for {0} …", "En attente de {0} …", "In attesa di {0} …", "Esperando a {0} …", "Aguardando {0} …"],
  ["🔌 Verbindung weg – verbinde neu …", "🔌 Connection lost – reconnecting …", "🔌 Connexion perdue – reconnexion …", "🔌 Connessione persa – mi ricollego …", "🔌 Conexión perdida: reconectando …", "🔌 Conexão perdida – reconectando …"],
  ["· Verbindung weg, verbinde neu …", "· Connection lost, reconnecting …", "· Connexion perdue, reconnexion …", "· Connessione persa, mi ricollego …", "· Conexión perdida, reconectando …", "· Conexão perdida, reconectando …"],
  ["Du wurdest aus dem Raum entfernt.", "You were removed from the room.", "Tu as été retiré de la salle.", "Sei stato rimosso dalla stanza.", "Te han sacado de la sala.", "Você foi removido da sala."],
  ["Der Raum wurde geschlossen.", "The room was closed.", "La salle a été fermée.", "La stanza è stata chiusa.", "La sala se ha cerrado.", "A sala foi fechada."],
  ["Spiel wurde beendet", "Game over – the room was closed", "La partie est terminée", "Il gioco è terminato", "El juego ha terminado", "O jogo terminou"],
  ["Gleich geht’s zur Startseite …", "Taking you to the start page …", "Retour à l’accueil …", "Si torna alla pagina iniziale …", "Volviendo a la página de inicio …", "Voltando à página inicial …"],
  ["Danke fürs Mitspielen!", "Thanks for playing!", "Merci d'avoir joué !", "Grazie per aver giocato!", "¡Gracias por jugar!", "Valeu por jogar!"],
  ["🏆 Du hast gewonnen!", "🏆 You won!", "🏆 Tu as gagné !", "🏆 Hai vinto!", "🏆 ¡Has ganado!", "🏆 Você venceu!"],
  ["{0} & {1} gewinnen.", "{0} & {1} win.", "{0} et {1} gagnent.", "Vincono {0} e {1}.", "Ganan {0} y {1}.", "{0} e {1} venceram."],
  ["{0} gewinnt.", "{0} wins.", "{0} gagne.", "Vince {0}.", "Gana {0}.", "{0} venceu."],
  ["{0} gewinnt!", "{0} wins!", "{0} gagne !", "Vince {0}!", "¡Gana {0}!", "{0} venceu!"],
  ["Beste der Runde", "Best of the round", "Meilleurs de la manche", "I migliori del round", "Los mejores de la ronda", "Melhores da rodada"],
  ["Unentschieden: {0}", "Tie: {0}", "Égalité : {0}", "Pareggio: {0}", "Empate: {0}", "Empate: {0}"],
  ["Du hast {0} Karten gesammelt ({1} richtig, {2} daneben).", "You collected {0} cards ({1} right, {2} wrong).", "Tu as récolté {0} cartes ({1} justes, {2} ratées).", "Hai raccolto {0} carte ({1} giuste, {2} sbagliate).", "Has reunido {0} cartas ({1} aciertos, {2} fallos).", "Você juntou {0} cartas ({1} certas, {2} erradas)."],
  ["Alle sind dran!", "Everyone's turn!", "À tout le monde !", "Tocca a tutti!", "¡Os toca a todos!", "Vez de todos!"],
  ["Stechen – schau zu", "Tiebreak – watch", "Départage – regarde", "Spareggio – guarda", "Desempate: mira", "Desempate – assista"],
  ["Du bist dran!", "Your turn!", "À toi !", "Tocca a te!", "¡Te toca!", "Sua vez!"],
  ["{0} ist dran", "{0}'s turn", "Au tour de {0}", "Tocca a {0}", "Le toca a {0}", "Vez de {0}"],
  ["{0}/{1} Karten", "{0}/{1} cards", "{0}/{1} cartes", "{0}/{1} carte", "{0}/{1} cartas", "{0}/{1} cartas"],
  ["{0}/{1} Karten · ⭐ {2}", "{0}/{1} cards · ⭐ {2}", "{0}/{1} cartes · ⭐ {2}", "{0}/{1} carte · ⭐ {2}", "{0}/{1} cartas · ⭐ {2}", "{0}/{1} cartas · ⭐ {2}"],
  ["✓ Du liegst richtig! {0}", "✓ You're right! {0}", "✓ Tu as juste ! {0}", "✓ Hai indovinato! {0}", "✓ ¡Aciertas! {0}", "✓ Você acertou! {0}"],
  ["✓ {0} liegt richtig! {1}", "✓ {0} is right! {1}", "✓ {0} a juste ! {1}", "✓ {0} ha indovinato! {1}", "✓ ¡{0} acierta! {1}", "✓ {0} acertou! {1}"],
  ["✓ Jemand liegt richtig! {0}", "✓ Someone is right! {0}", "✓ Quelqu'un a juste ! {0}", "✓ Qualcuno ha indovinato! {0}", "✓ ¡Alguien acierta! {0}", "✓ Alguém acertou! {0}"],
  ["Karte geht in den Zeitstrahl.", "Card goes on the timeline.", "La carte va sur la frise.", "La carta va nella linea del tempo.", "La carta va a la línea del tiempo.", "A carta vai para a linha do tempo."],
  ["Karte ist raus.", "Card is out.", "La carte est éliminée.", "La carta è fuori.", "La carta queda fuera.", "A carta saiu."],
  ["Karte geht zurück in den Stapel.", "Card goes back into the deck.", "La carte retourne dans la pile.", "La carta torna nel mazzo.", "La carta vuelve al mazo.", "A carta volta para o monte."],
  ["⏱ Zeit abgelaufen. {0}", "⏱ Time's up. {0}", "⏱ Temps écoulé. {0}", "⏱ Tempo scaduto. {0}", "⏱ Se acabó el tiempo. {0}", "⏱ Tempo esgotado. {0}"],
  ["✗ Du hattest {0} – {1} gehört {2}.", "✗ You picked {0} – {1} belongs {2}.", "✗ Tu avais choisi {0} – {1} va {2}.", "✗ Avevi scelto {0} – il {1} va {2}.", "✗ Elegiste {0}: {1} va {2}.", "✗ Você escolheu {0} – {1} fica {2}."],
  ["✗ Du hattest {0} – das passt nicht.", "✗ You picked {0} – that doesn't fit.", "✗ Tu avais choisi {0} – ça ne colle pas.", "✗ Avevi scelto {0} – non va bene.", "✗ Elegiste {0}: no encaja.", "✗ Você escolheu {0} – não encaixa."],
  ["⏱ Keine Eingabe – {0} gehört {1}.", "⏱ No answer – {0} belongs {1}.", "⏱ Pas de réponse – {0} va {1}.", "⏱ Nessuna risposta – il {0} va {1}.", "⏱ Sin respuesta: {0} va {1}.", "⏱ Sem resposta – {0} fica {1}."],
  ["✗ Leider daneben. {0}", "✗ Sorry, missed. {0}", "✗ Raté, dommage. {0}", "✗ Peccato, sbagliato. {0}", "✗ Lástima, fallaste. {0}", "✗ Que pena, errou. {0}"],
  ["✓ Getippt! Auflösung 5 Sekunden, nachdem alle getippt haben.", "✓ Tapped! Reveal 5 seconds after everyone has tapped.", "✓ C'est joué ! Réponse 5 secondes après que tous ont joué.", "✓ Scelto! Soluzione 5 secondi dopo che tutti hanno scelto.", "✓ ¡Elegido! Solución 5 segundos después de que todos elijan.", "✓ Escolhido! Resposta 5 segundos depois de todos escolherem."],
  ["✓ Getippt! Die Auflösung kommt, wenn der Song zu Ende ist.", "✓ Tapped! The reveal comes when the song ends.", "✓ C'est joué ! La réponse arrive à la fin de la chanson.", "✓ Scelto! La soluzione arriva quando finisce la canzone.", "✓ ¡Elegido! La solución llega cuando acabe la canción.", "✓ Escolhido! A resposta vem quando a música acabar."],
  ["Die Runde ist entschieden – Auflösung in 5 Sekunden.", "The round is decided – reveal in 5 seconds.", "La manche est jouée – réponse dans 5 secondes.", "Il round è deciso – soluzione tra 5 secondi.", "La ronda está decidida: solución en 5 segundos.", "A rodada está decidida – resposta em 5 segundos."],
  ["Die Runde ist entschieden – Auflösung, wenn der Song zu Ende ist.", "The round is decided – reveal when the song ends.", "La manche est jouée – réponse à la fin de la chanson.", "Il round è deciso – soluzione a fine canzone.", "La ronda está decidida: solución cuando acabe la canción.", "A rodada está decidida – resposta quando a música acabar."],
  ["Tippe in deinem Zeitstrahl auf die Lücke, in die der Song gehört – dann bestätigen.", "Tap the gap in your timeline where the song belongs – then confirm.", "Touche l'espace de ta frise où va la chanson – puis confirme.", "Tocca lo spazio della tua linea del tempo dove va la canzone – poi conferma.", "Toca el hueco de tu línea del tiempo donde va la canción y confirma.", "Toque no espaço da sua linha do tempo onde a música se encaixa – depois confirme."],
  ["Schau zu und rate im Kopf mit.", "Watch and guess along in your head.", "Regarde et devine dans ta tête.", "Guarda e indovina mentalmente.", "Mira y adivina mentalmente.", "Assista e adivinhe de cabeça."],
  ["Jahr bestätigen ›", "Confirm year ›", "Confirmer l'année ›", "Conferma l'anno ›", "Confirmar año ›", "Confirmar ano ›"],
  ["Schritt 1 von {0}: Tippe auf die Lücke, in die der Song gehört – dann bestätigen.", "Step 1 of {0}: tap the gap where the song belongs – then confirm.", "Étape 1 sur {0} : touche l'espace où va la chanson – puis confirme.", "Passo 1 di {0}: tocca lo spazio dove va la canzone – poi conferma.", "Paso 1 de {0}: toca el hueco donde va la canción y confirma.", "Passo 1 de {0}: toque no espaço onde a música se encaixa – depois confirme."],
  ["✓ Jahr ist gemerkt – jetzt Zusatzpunkte sammeln (freiwillig).", "✓ Year saved – now collect bonus points (optional).", "✓ Année enregistrée – gagne maintenant des points bonus (facultatif).", "✓ Anno salvato – ora raccogli punti extra (facoltativo).", "✓ Año guardado: ahora suma puntos extra (opcional).", "✓ Ano salvo – agora ganhe pontos extras (opcional)."],
  ["Spiel einrichten", "Set up the game", "Configurer la partie", "Imposta la partita", "Configurar la partida", "Configurar o jogo"],
  ["Weiter ›", "Next ›", "Suivant ›", "Avanti ›", "Siguiente ›", "Próximo ›"],
  ["Wo läuft die Musik?", "Where does the music play?", "Où passe la musique ?", "Dove suona la musica?", "¿Dónde suena la música?", "Onde toca a música?"],
  ["Wann endet eine Runde?", "When does a round end?", "Quand une manche se termine-t-elle ?", "Quando finisce un turno?", "¿Cuándo termina una ronda?", "Quando termina uma rodada?"],
  ["Wie viele Karten zum Sieg?", "How many cards to win?", "Combien de cartes pour gagner ?", "Quante carte per vincere?", "¿Cuántas cartas para ganar?", "Quantas cartas para vencer?"],
  ["Welches Deck?", "Which deck?", "Quel deck ?", "Quale mazzo?", "¿Qué mazo?", "Qual baralho?"],
  ["Freie Plätze mit KI-Bots füllen?", "Fill free seats with AI bots?", "Remplir les places libres avec des bots IA ?", "Riempire i posti liberi con bot IA?", "¿Llenar los huecos con bots de IA?", "Preencher vagas com bots de IA?"],
  // Bot-Namen (Server vergibt sie auf Deutsch, jedes Gerät zeigt sie in seiner Sprache)
  ["DJ Schnarchnase", "DJ Snoozy", "DJ Ronflette", "DJ Russone", "DJ Roncador", "DJ Soneca"],
  ["Oma Hitparade", "Granny Hitparade", "Mamie Hit-Parade", "Nonna Hit Parade", "Abuela Superventas", "Vovó Paradão"],
  ["Kassetten-Kurt", "Cassette Carl", "Cassette Kévin", "Cassetta Carlo", "Casete Carlos", "Cassete Carlinhos"],
  ["Blockflöten-Bernd", "Recorder Rob", "Flûtiste Firmin", "Flauto Franco", "Flauta Felipe", "Flautinha Fábio"],
  ["Tante Tamburin", "Auntie Tambourine", "Tata Tambourin", "Zia Tamburello", "Tía Pandereta", "Tia Pandeiro"],
  ["Schlager-Schorsch", "Cheesy Charlie", "Gégé Guinguette", "Gino Canzonetta", "Paco Verbena", "Zeca Brega"],
  ["Brummbär Balduin", "Grumpy Bear Barney", "Nounours Bougon", "Orso Brontolo", "Oso Gruñón", "Urso Rabugento"],
  ["Faultier Fritzi", "Sloth Sally", "Paresseux Paulo", "Bradipo Bruno", "Perezoso Pepe", "Preguiça Paulinha"],
  ["Disco-Dieter", "Disco Dave", "Disco Didier", "Disco Dino", "Disco Diego", "Disco Dudu"],
  ["Lady Lautstärke", "Lady Loudness", "Lady Décibel", "Lady Volume", "Lady Volumen", "Lady Volume"],
  ["Radio-Rudi", "Radio Rudy", "Radio Rémi", "Radio Rino", "Radio Rodrigo", "Rádio Rui"],
  ["Bass-Bärbel", "Bass Betty", "Basse Brigitte", "Basso Bea", "Bajo Bárbara", "Baixo Bia"],
  ["Karaoke-Kalle", "Karaoke Kevin", "Karaoké Karim", "Karaoke Carletto", "Karaoke Kike", "Karaokê Kaká"],
  ["Tröten-Toni", "Trumpet Tony", "Trompette Toto", "Tromba Toni", "Trompeta Toño", "Trompete Tonho"],
  ["Pinguin Paula", "Penguin Polly", "Pingouin Pauline", "Pinguino Paola", "Pingüino Paula", "Pinguim Paula"],
  ["Prof. Plattenkiste", "Prof. Record Crate", "Prof. Vinylothèque", "Prof. Giradischi", "Prof. Tocadiscos", "Prof. Vitrola"],
  ["Vinyl-Vroni", "Vinyl Vicky", "Vinyle Véro", "Vinile Vera", "Vinilo Vero", "Vinil Vivi"],
  ["Chart-Checker 3000", "Chart Checker 3000", "Top-Chrono 3000", "Classifica-Bot 3000", "Lista-Bot 3000", "Parada-Bot 3000"],
  ["Captain Ohrwurm", "Captain Earworm", "Capitaine Refrain", "Capitan Tormentone", "Capitán Pegadizo", "Capitão Chiclete"],
  ["DJ Allwissend", "DJ Know-It-All", "DJ Je-Sais-Tout", "DJ Sapientone", "DJ Sabelotodo", "DJ Sabe-Tudo"],
  ["Die Jukebox", "The Jukebox", "Le Juke-box", "Il Jukebox", "La Rockola", "A Jukebox"],
  ["Synthi-Susi", "Synth Suzy", "Synthé Suzon", "Synth Susanna", "Sinte Susi", "Sintetizadora Suzi"],
  ["Eule Euphonia", "Owl Euphonia", "Chouette Euphonie", "Civetta Eufonia", "Búho Eufonía", "Coruja Eufonia"],
  ["Wer spielt mit?", "Who's playing?", "Qui joue ?", "Chi gioca?", "¿Quién juega?", "Quem joga?"],
  ["frei", "free", "libre", "libero", "libre", "livre"],
  ["Es spielen nur die, die den QR-Code gescannt haben.", "Only the people who scanned the QR code play.", "Seuls ceux qui ont scanné le QR code jouent.", "Giocano solo quelli che hanno scansionato il QR code.", "Solo juegan quienes han escaneado el código QR.", "Só jogam os que escanearam o QR code."],
  ["{0} Karten", "{0} cards", "{0} cartes", "{0} carte", "{0} cartas", "{0} cartas"],
  ["Alle", "All", "Toutes", "Tutti", "Todos", "Todos"],
  ["Ja", "Yes", "Oui", "Sì", "Sí", "Sim"],
  ["Nein", "No", "Non", "No", "No", "Não"],
  ["Nichts gewählt = alle.", "Nothing selected = all.", "Rien de choisi = tout.", "Nulla selezionato = tutto.", "Nada elegido = todo.", "Nada escolhido = tudo."],
  ["Ja, auf 6 auffüllen", "Yes, fill up to 6", "Oui, compléter jusqu'à 6", "Sì, fino a 6", "Sí, completar hasta 6", "Sim, completar até 6"],
  ["Nein, nur echte Mitspieler", "No, real players only", "Non, seulement de vrais joueurs", "No, solo giocatori veri", "No, solo jugadores reales", "Não, só jogadores reais"],
  ["Tippe auf die Toleranz, um sie zu ändern.", "Tap the tolerance to change it.", "Touche la tolérance pour la modifier.", "Tocca la tolleranza per cambiarla.", "Toca la tolerancia para cambiarla.", "Toque na tolerância para mudar."],
  ["Ein Fernseher oder Monitor ist der Hauptbildschirm, der Ton kommt aus seinen Lautsprechern. Die Handys dienen nur zum Tippen.", "A TV or monitor is the main screen and the sound comes from its speakers. Phones are just for tapping.", "Une télé ou un écran sert d'écran principal, le son sort de ses haut-parleurs. Les téléphones servent juste à taper.", "Una TV o un monitor è lo schermo principale, il suono esce dai suoi altoparlanti. I telefoni servono solo per toccare.", "Una tele o un monitor es la pantalla principal y el sonido sale de sus altavoces. Los móviles solo sirven para tocar.", "Uma TV ou monitor é a tela principal e o som sai dos alto-falantes dela. Os celulares servem só para tocar."],
  ["Ein Gerät richtet das Spiel ein, jedes Handy spielt die Musik selbst ab – auch wenn ihr nicht im selben Raum seid.", "One device hosts the game, every phone plays the music itself – even if you're not in the same room.", "Un appareil héberge la partie, chaque téléphone joue la musique lui-même – même si vous n'êtes pas dans la même pièce.", "Un dispositivo ospita la partita, ogni telefono riproduce la musica da sé – anche se non siete nella stessa stanza.", "Un dispositivo crea la partida y cada móvil reproduce la música por sí mismo, aunque no estéis en la misma sala.", "Um aparelho hospeda o jogo e cada celular toca a música sozinho – mesmo que vocês não estejam no mesmo lugar."],
  ["Alle hören denselben Song und ordnen ihn gleichzeitig auf ihrem Handy ein. Schnell und für viele Spieler am besten.", "Everyone hears the same song and places it on their phone at the same time. Fast and best for many players.", "Tout le monde entend la même chanson et la place en même temps sur son téléphone. Rapide, idéal à plusieurs.", "Tutti ascoltano la stessa canzone e la posizionano contemporaneamente sul telefono. Veloce e ideale per tanti giocatori.", "Todos escuchan la misma canción y la colocan a la vez en su móvil. Rápido y lo mejor para muchos jugadores.", "Todos ouvem a mesma música e a posicionam ao mesmo tempo no celular. Rápido e ideal para muitos jogadores."],
  ["Reihum ist immer ein Spieler dran, die anderen schauen zu und fiebern mit.", "Players take turns one at a time while the others watch and cheer along.", "Chacun son tour : un seul joueur joue, les autres regardent et encouragent.", "A turno gioca un solo giocatore, gli altri guardano e fanno il tifo.", "Por turnos juega un solo jugador; los demás miran y animan.", "Cada um na sua vez: um jogador joga e os outros assistem e torcem."],
  ["nach Ablauf der Song-Vorschau (30 s)", "when the song preview ends (30 s)", "à la fin de l'extrait (30 s)", "alla fine dell'anteprima (30 s)", "cuando acabe el avance (30 s)", "quando a prévia acabar (30 s)"],
  ["5 s, nachdem alle geantwortet haben (oder die Zeit um ist)", "5 s after everyone has answered (or time is up)", "5 s après que tous ont répondu (ou à la fin du temps)", "5 s dopo che tutti hanno risposto (o a tempo scaduto)", "5 s después de que todos respondan (o al acabarse el tiempo)", "5 s depois que todos responderem (ou o tempo acabar)"],
  ["5 s nach der ersten Antwort", "5 s after the first answer", "5 s après la première réponse", "5 s dopo la prima risposta", "5 s después de la primera respuesta", "5 s depois da primeira resposta"],
  ["Die Vorschau läuft immer ganz durch – Zeit genug zum Mitsingen und Grübeln.", "The preview always plays to the end – plenty of time to sing along and think.", "L'extrait passe toujours jusqu'au bout – le temps de chanter et de réfléchir.", "L'anteprima suona sempre fino alla fine – tempo per cantare e pensare.", "El avance suena siempre entero: tiempo para cantar y pensar.", "A prévia sempre toca até o fim – tempo para cantar junto e pensar."],
  ["Haben alle geantwortet, geht es nach 5 Sekunden weiter. Sonst endet die Runde, wenn die Zeit um ist.", "Once everyone has answered, it moves on after 5 seconds. Otherwise the round ends when time is up.", "Quand tous ont répondu, on continue après 5 secondes. Sinon la manche se termine à la fin du temps.", "Quando tutti hanno risposto, si va avanti dopo 5 secondi. Altrimenti il round finisce allo scadere del tempo.", "Cuando todos han respondido, se sigue a los 5 segundos. Si no, la ronda acaba al terminar el tiempo.", "Quando todos responderem, segue depois de 5 segundos. Senão a rodada acaba quando o tempo terminar."],
  ["Wer zuerst tippt, startet die Uhr: Die anderen haben noch 5 Sekunden. Für schnelle Runden.", "Whoever taps first starts the clock: the others have 5 more seconds. For fast rounds.", "Le premier qui tape lance le chrono : les autres ont encore 5 secondes. Pour des manches rapides.", "Chi tocca per primo avvia il timer: gli altri hanno ancora 5 secondi. Per round veloci.", "Quien toca primero pone en marcha el reloj: los demás tienen 5 segundos más. Para rondas rápidas.", "Quem tocar primeiro inicia o relógio: os outros têm mais 5 segundos. Para rodadas rápidas."],
  ["⚡ Schnell! Jemand hat schon getippt – noch 5 Sekunden.", "⚡ Quick! Someone has already tapped – 5 seconds left.", "⚡ Vite ! Quelqu'un a déjà tapé – encore 5 secondes.", "⚡ Svelto! Qualcuno ha già toccato – ancora 5 secondi.", "⚡ ¡Rápido! Alguien ya ha tocado: quedan 5 segundos.", "⚡ Rápido! Alguém já tocou – faltam 5 segundos."],
  ["✓ Getippt! Auflösung in wenigen Sekunden.", "✓ Tapped! Reveal in a few seconds.", "✓ C'est noté ! Réponse dans quelques secondes.", "✓ Fatto! Soluzione tra pochi secondi.", "✓ ¡Hecho! Solución en unos segundos.", "✓ Feito! Resposta em poucos segundos."],
  ["⚡ Die erste Antwort ist da – noch 5 Sekunden für alle anderen.", "⚡ The first answer is in – 5 more seconds for everyone else.", "⚡ La première réponse est là – encore 5 secondes pour les autres.", "⚡ È arrivata la prima risposta – ancora 5 secondi per gli altri.", "⚡ Ya está la primera respuesta: 5 segundos más para los demás.", "⚡ A primeira resposta chegou – mais 5 segundos para os outros."],
  ["Nur das Erscheinungsjahr zählt – der Klassiker, für alle leicht zu verstehen.", "Only the release year counts – the classic, easy for everyone.", "Seule l'année de sortie compte – le classique, simple pour tous.", "Conta solo l'anno di uscita – il classico, facile per tutti.", "Solo cuenta el año de lanzamiento: el clásico, fácil para todos.", "Só o ano de lançamento conta – o clássico, fácil para todos."],
  ["Wer zusätzlich den Songtitel weiß, bekommt einen Bonus-Stern.", "Also know the song title? You get a bonus star.", "Tu connais aussi le titre ? Une étoile bonus.", "Sai anche il titolo? Ottieni una stella bonus.", "¿Sabes también el título? Ganas una estrella extra.", "Também sabe o título? Ganha uma estrela bônus."],
  ["Wer zusätzlich den Interpreten weiß, bekommt einen Bonus-Stern.", "Also know the artist? You get a bonus star.", "Tu connais aussi l'artiste ? Une étoile bonus.", "Sai anche l'artista? Ottieni una stella bonus.", "¿Sabes también el artista? Ganas una estrella extra.", "Também sabe o artista? Ganha uma estrela bônus."],
  ["Titel und Interpret bringen je einen Bonus-Stern – für Musik-Profis.", "Title and artist each earn a bonus star – for music pros.", "Titre et artiste rapportent chacun une étoile bonus – pour les pros de la musique.", "Titolo e artista valgono una stella bonus ciascuno – per esperti di musica.", "Título y artista dan una estrella extra cada uno: para expertos en música.", "Título e artista valem uma estrela bônus cada – para feras da música."],
  ["Eine schnelle Partie – ideal zum Reinkommen.", "A quick game – ideal to get started.", "Une partie rapide – idéale pour commencer.", "Una partita veloce – ideale per iniziare.", "Una partida rápida: ideal para empezar.", "Uma partida rápida – ideal para começar."],
  ["Mittlere Länge für einen gemütlichen Abend.", "Medium length for a relaxed evening.", "Durée moyenne pour une soirée tranquille.", "Durata media per una serata rilassata.", "Duración media para una noche tranquila.", "Duração média para uma noite tranquila."],
  ["Eine lange Partie für echte Musik-Kenner.", "A long game for true music buffs.", "Une longue partie pour les vrais connaisseurs.", "Una partita lunga per veri intenditori.", "Una partida larga para auténticos expertos.", "Uma partida longa para verdadeiros conhecedores."],
  ["Alle Songs", "All songs", "Toutes les chansons", "Tutte le canzoni", "Todas las canciones", "Todas as músicas"],
  ["Zurück blättern", "Scroll back", "Défiler en arrière", "Scorri indietro", "Desplazar atrás", "Rolar para trás"],
  ["Weiter blättern", "Scroll forward", "Défiler en avant", "Scorri avanti", "Desplazar adelante", "Rolar para frente"],
  ["{0} Songs", "{0} songs", "{0} chansons", "{0} canzoni", "{0} canciones", "{0} músicas"],
  ["Welche Jahrzehnte?", "Which decades?", "Quelles décennies ?", "Quali decenni?", "¿Qué décadas?", "Quais décadas?"],
  ["Welche Genres?", "Which genres?", "Quels genres ?", "Quali generi?", "¿Qué géneros?", "Quais gêneros?"],
  ["🎤 Wer singt?", "🎤 Who's singing?", "🎤 Qui chante ?", "🎤 Chi canta?", "🎤 ¿Quién canta?", "🎤 Quem canta?"],
  ["🎵 Wie heißt der Song?", "🎵 What's the song called?", "🎵 Quel est le titre ?", "🎵 Come si intitola?", "🎵 ¿Cómo se llama la canción?", "🎵 Qual é o nome da música?"],
  ["{0} bestätigen {1}", "Confirm {0} {1}", "Confirmer {0} {1}", "Conferma {0} {1}", "Confirmar {0} {1}", "Confirmar {0} {1}"],
  ["Weiß ich nicht ›", "I don't know ›", "Je ne sais pas ›", "Non lo so ›", "No lo sé ›", "Não sei ›"],
  ["Abspielen nicht möglich – bitte noch einmal tippen.", "Can't play – please tap again.", "Lecture impossible – touche encore une fois.", "Impossibile riprodurre – tocca di nuovo.", "No se puede reproducir: toca otra vez.", "Não dá para tocar – toque de novo."],
  ["⏱ noch {0} s zum Einordnen", "⏱ {0} s left to place", "⏱ encore {0} s pour placer", "⏱ ancora {0} s per piazzare", "⏱ quedan {0} s para colocar", "⏱ faltam {0} s para posicionar"],
  ["⏱ Zeit ist um", "⏱ Time's up", "⏱ Temps écoulé", "⏱ Tempo scaduto", "⏱ Se acabó el tiempo", "⏱ Acabou o tempo"],
  ["▶ Tippen zum Abspielen", "▶ Tap to play", "▶ Touche pour lancer", "▶ Tocca per riprodurre", "▶ Toca para reproducir", "▶ Toque para tocar"],
  ["Keine Verbindung zum Server.", "No connection to the server.", "Pas de connexion au serveur.", "Nessuna connessione al server.", "Sin conexión con el servidor.", "Sem conexão com o servidor."],
  ["Fehler", "Error", "Erreur", "Errore", "Error", "Erro"],

  // ---- Bots, Bestenliste, Equalizer ----
  ["leicht", "easy", "facile", "facile", "fácil", "fácil"],
  ["mittel", "medium", "moyen", "medio", "medio", "médio"],
  ["Profi", "pro", "pro", "pro", "pro", "pro"],
  ["KI-Bot ({0})", "AI bot ({0})", "Bot IA ({0})", "Bot IA ({0})", "Bot de IA ({0})", "Bot de IA ({0})"],
  ["🤖 {0}", "🤖 {0}", "🤖 {0}", "🤖 {0}", "🤖 {0}", "🤖 {0}"],
  ["🏅 Bestenliste", "🏅 Leaderboard", "🏅 Classement", "🏅 Classifica", "🏅 Clasificación", "🏅 Ranking"],
  ["Alle Punkte aus allen Spielen – Karten plus ⭐ Zusatzpunkte.", "All points from all games – cards plus ⭐ bonus points.", "Tous les points de toutes les parties – cartes plus ⭐ points bonus.", "Tutti i punti di tutte le partite – carte più ⭐ punti extra.", "Todos los puntos de todas las partidas: cartas más ⭐ puntos extra.", "Todos os pontos de todas as partidas – cartas mais ⭐ pontos extras."],
  ["{0} Spiel", "{0} game", "{0} partie", "{0} partita", "{0} partida", "{0} partida"],
  ["{0} Spiele", "{0} games", "{0} parties", "{0} partite", "{0} partidas", "{0} partidas"],
  ["{0} Spiel · 🏆 {1}", "{0} game · 🏆 {1}", "{0} partie · 🏆 {1}", "{0} partita · 🏆 {1}", "{0} partida · 🏆 {1}", "{0} partida · 🏆 {1}"],
  ["{0} Spiele · 🏆 {1}", "{0} games · 🏆 {1}", "{0} parties · 🏆 {1}", "{0} partite · 🏆 {1}", "{0} partidas · 🏆 {1}", "{0} partidas · 🏆 {1}"],
  ["Klicken: anderer Equalizer", "Click: different equalizer", "Clic : autre égaliseur", "Clic: altro equalizzatore", "Clic: otro ecualizador", "Clique: outro equalizador"],
  ["Equalizer-Stil wechseln", "Change equalizer style", "Changer le style d'égaliseur", "Cambia stile dell'equalizzatore", "Cambiar estilo del ecualizador", "Mudar estilo do equalizador"],

  // ---- Meldungen vom Server ----
  ["Bitte einen Namen eingeben.", "Please enter a name.", "Saisis un nom.", "Inserisci un nome.", "Introduce un nombre.", "Digite um nome."],
  ["Bots lassen sich nicht ändern.", "Bots can't be changed.", "Les bots ne peuvent pas être modifiés.", "I bot non si possono modificare.", "Los bots no se pueden cambiar.", "Bots não podem ser alterados."],
  ["Das Spiel läuft noch.", "The game is still running.", "La partie est encore en cours.", "La partita è ancora in corso.", "La partida sigue en curso.", "A partida ainda está rolando."],
  ["Das Spiel läuft schon.", "The game has already started.", "La partie a déjà commencé.", "La partita è già iniziata.", "La partida ya ha empezado.", "A partida já começou."],
  ["Den Namen gibt es schon.", "That name is taken.", "Ce nom est déjà pris.", "Questo nome è già preso.", "Ese nombre ya existe.", "Esse nome já existe."],
  ["Der Raum ist voll (max. 6).", "The room is full (max. 6).", "La salle est pleine (max. 6).", "La stanza è piena (max. 6).", "La sala está llena (máx. 6).", "A sala está cheia (máx. 6)."],
  ["Die Runde ist schon entschieden.", "The round is already decided.", "La manche est déjà jouée.", "Il round è già deciso.", "La ronda ya está decidida.", "A rodada já está decidida."],
  ["Die Runde ist schon vorbei.", "The round is already over.", "La manche est déjà finie.", "Il round è già finito.", "La ronda ya ha terminado.", "A rodada já acabou."],
  ["Du bist nicht dran.", "It's not your turn.", "Ce n'est pas ton tour.", "Non tocca a te.", "No es tu turno.", "Não é sua vez."],
  ["Du hast schon alles eingegeben.", "You've already entered everything.", "Tu as déjà tout saisi.", "Hai già inserito tutto.", "Ya lo has introducido todo.", "Você já informou tudo."],
  ["Du hast schon gelegt.", "You've already placed your card.", "Tu as déjà placé ta carte.", "Hai già piazzato la carta.", "Ya has colocado tu carta.", "Você já posicionou sua carta."],
  ["Du spielst diese Runde nicht mit.", "You're not playing this round.", "Tu ne joues pas cette manche.", "Non giochi questo round.", "No juegas esta ronda.", "Você não joga esta rodada."],
  ["Erst das Jahr einordnen.", "Place the year first.", "Place d'abord l'année.", "Prima piazza l'anno.", "Primero coloca el año.", "Primeiro posicione o ano."],
  ["Gerade kann keine Karte gelegt werden.", "No card can be placed right now.", "Impossible de placer une carte maintenant.", "Ora non si può piazzare una carta.", "Ahora no se puede colocar ninguna carta.", "Agora não dá para posicionar carta."],
  ["Gerade kann niemand mehr einsteigen.", "Nobody can join right now.", "Personne ne peut rejoindre pour l'instant.", "Ora non può entrare nessuno.", "Ahora no puede unirse nadie.", "Ninguém pode entrar agora."],
  ["Gerade läuft kein Song.", "No song is playing right now.", "Aucune chanson ne passe en ce moment.", "Ora non suona nessuna canzone.", "Ahora no suena ninguna canción.", "Nenhuma música tocando agora."],
  ["Im Modus „alle“ wird gemeinsam ausgewertet.", "In “everyone” mode the round is scored together.", "En mode « tous », le résultat est commun.", "In modalità “tutti” si valuta insieme.", "En el modo «todos» se puntúa en conjunto.", "No modo “todos” a avaliação é conjunta."],
  ["Kein Host-Zugang für diesen Raum.", "No host access for this room.", "Pas d'accès hôte pour cette salle.", "Nessun accesso host per questa stanza.", "Sin acceso de anfitrión a esta sala.", "Sem acesso de anfitrião a esta sala."],
  ["Kein laufendes Spiel.", "No game running.", "Aucune partie en cours.", "Nessuna partita in corso.", "No hay ninguna partida en curso.", "Nenhuma partida em andamento."],
  ["Keine Karten mehr im Stapel.", "No cards left in the deck.", "Plus de cartes dans la pile.", "Non ci sono più carte nel mazzo.", "No quedan cartas en el mazo.", "Não há mais cartas no monte."],
  ["Mindestens ein Mitspieler muss beitreten – oder Bots auffüllen.", "At least one player must join – or fill up with bots.", "Au moins un joueur doit rejoindre – ou ajoute des bots.", "Deve entrare almeno un giocatore – oppure aggiungi i bot.", "Debe unirse al menos un jugador, o rellena con bots.", "Pelo menos um jogador precisa entrar – ou complete com bots."],
  ["Nicht im Raum.", "Not in the room.", "Pas dans la salle.", "Non sei nella stanza.", "No estás en la sala.", "Fora da sala."],
  ["Nicht im Spiel.", "Not in the game.", "Pas dans la partie.", "Non sei nella partita.", "No estás en la partida.", "Fora da partida."],
  ["Nur der Host darf das.", "Only the host can do that.", "Seul l'hôte peut faire ça.", "Può farlo solo l'host.", "Solo el anfitrión puede hacerlo.", "Só o anfitrião pode fazer isso."],
  ["Nur in der Lobby änderbar.", "Can only be changed in the lobby.", "Modifiable seulement dans le salon.", "Modificabile solo nella lobby.", "Solo se puede cambiar en la sala de espera.", "Só pode ser alterado no lobby."],
  ["Raten ist in diesem Spiel aus.", "Guessing is off in this game.", "Les devinettes sont désactivées dans cette partie.", "In questa partita non si indovina.", "Adivinar está desactivado en esta partida.", "Adivinhar está desligado nesta partida."],
  ["Raum nicht gefunden. Code prüfen.", "Room not found. Check the code.", "Salle introuvable. Vérifie le code.", "Stanza non trovata. Controlla il codice.", "Sala no encontrada. Revisa el código.", "Sala não encontrada. Confira o código."],
  ["Spieler nicht gefunden.", "Player not found.", "Joueur introuvable.", "Giocatore non trovato.", "Jugador no encontrado.", "Jogador não encontrado."],
  ["Ungültige Position.", "Invalid position.", "Position invalide.", "Posizione non valida.", "Posición no válida.", "Posição inválida."],
  ["Zu wenige Songs für diese Auswahl ({0}).", "Too few songs for this selection ({0}).", "Trop peu de chansons pour cette sélection ({0}).", "Troppe poche canzoni per questa selezione ({0}).", "Muy pocas canciones para esta selección ({0}).", "Poucas músicas para esta seleção ({0})."],
];

const UEBERSETZER = (() => {
  const spalte = SPRACHEN.findIndex((s) => s.code === SPRACHE);
  const genau = new Map();
  const muster = [];
  if (spalte > 0) {
    const flucht = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const zeile of UEBERSETZUNGEN) {
      const [de, ziel] = [zeile[0], zeile[spalte]];
      if (!ziel) continue;
      if (/\{\d\}/.test(de)) {
        const quelle = "^" + flucht(de).replace(/\\\{(\d)\\\}/g, "(?<p$1>.+?)") + "$";
        muster.push({ re: new RegExp(quelle, "s"), ziel, gewicht: de.replace(/\{\d\}/g, "").length });
      } else if (ziel !== de) genau.set(de, ziel);
    }
    muster.sort((a, b) => b.gewicht - a.gewicht); // spezifischere Muster zuerst
  }
  return { genau, muster, aktiv: spalte > 0 };
})();

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
(() => {
  document.documentElement.lang = SPRACHE;
  if (!UEBERSETZER.aktiv) return;
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
})();
