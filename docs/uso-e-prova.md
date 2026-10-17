# Come provare l'app sul MacBook

Guida pratica per avviare "Outlook AI" e usarlo con la tua casella. Tutto avviene sul Mac: la password
IMAP viene scritta da te nell'app e finisce nel Keychain di macOS, mai in un file di configurazione.

## 1. Prerequisiti (già presenti sul Mac)

- Rust (`rustc 1.99`) e Node (`v26`) installati
- il repository in `~/outlook-ai-clone`

## 2. Avviare l'app

```bash
cd ~/outlook-ai-clone
npm run tauri dev
```

La prima compilazione richiede qualche minuto. Compare la finestra 1728 × 988, con la barra del titolo
disegnata dentro (semafori, "Legacy Outlook", campo Cerca) come nel riferimento.

## 3. Configurare la casella

Finestra **Account** (dal menu Impostazioni, quando sarà collegata) oppure — fino ad allora — creando un
file di configurazione minimo e mettendo la password dal Keychain.

I valori del tuo Outlook, se usi la casella di lavoro su Esempio Host:

| Campo | Valore |
|---|---|
| Nome utente | il tuo indirizzo completo |
| Server posta in arrivo | `imaps.esempiohost.it` porta `993`, SSL attivo |
| Server posta in uscita | `smtps.esempiohost.it` porta `465`, SSL attivo |

Due cose da sapere:

- **La password deve essere quella della casella**, non quella di un altro servizio. Se sul tuo account
  Esempio Host c'è la verifica in due passaggi, serve una **password per le app**: senza, il login IMAP viene
  rifiutato (l'app lo dice, non entra in un ciclo di tentativi).
- Per una prova senza toccare la posta di lavoro, va benissimo una casella separata (anche una Gmail con
  password per le app): l'app non contiene nessun account predefinito.

## 4. Il modello locale

L'assistente usa **Splash-M1** come motore locale, che parla un'API OpenAI-compatibile su
`http://127.0.0.1:8000/v1`. Va avviato prima di usare i comandi IA:

- avvia Splash-M1 (o il servizio che lo lancia) e verifica che risponda: `curl http://127.0.0.1:8000/health`
- se il modello **non è in esecuzione**, l'app lo dichiara e propone di avviarlo: nessun errore grezzo,
  e nessuna chiamata al cloud al posto tuo.

Su `11434` c'è anche Ollama, se preferisci un modello più piccolo: l'endpoint è configurabile.

## 5. Cosa provare, in ordine

1. **Sync**: apri una cartella e verifica che i messaggi arrivino con mittente, oggetto e data come nel
   riferimento; poi chiudi e riapri l'app: la lista arriva dalla cache locale, anche senza rete.
2. **Lettura**: apri un messaggio. Le immagini esterne sono **bloccate** (segnaposto visibile): premi
   "Mostra immagini" per quel messaggio se ti servono. Gli allegati si salvano solo al clic.
   Il corpo si legge col carattere scelto nelle **«Tipi di carattere»** e con la scala **A⁻/A⁺**: dentro
   l'app conta la scelta **del lettore** (lo stile proprio del messaggio lo rimuove il sanificatore, di
   proposito), mentre il carattere scelto **dal mittente** viaggia nel MIME e lo vede il destinatario.
3. **Riassumi**: con il modello locale attivo, premi "✦ Riassumi". Compare una scheda sotto
   l'intestazione del messaggio con il riassunto, le fonti citate e, se il thread è lungo, quanti
   messaggi sono stati esclusi.
4. **Rispondi**: "✦ Rispondi" prepara una bozza nella finestra di composizione, con l'etichetta che
   ricorda di rileggerla. **Non viene mai inviata da sola.**
5. **Cloud**: nel selettore passa a "cloud" e premi un'azione: l'app **chiede conferma esplicita** e dice
   che il testo uscirà dal Mac. Se rifiuti, resta sul locale. Ogni richiesta effettivamente uscita viene
   annotata in un registro locale con data, modello e impronta SHA-256 del testo — non il testo.
6. **Controllo prima dell'invio**: scrivi un messaggio citando un allegato senza allegarlo, o incolla un
   IBAN: la barra segnala l'anomalia. **Avvisa, non blocca**: al secondo clic l'invio parte comunque.
7. **Tema**: chiaro, scuro o "sistema" — il tema è un attributo, non ricarica l'app.
8. **Invio di prova**: manda un messaggio a te stesso e verifica che arrivi.
9. **Cerca**: scrivi qualcosa nel campo in alto a destra ("Cerca"). Dopo una breve
   pausa compare l'elenco dei risultati nell'area della lista, con l'intestazione
   `Risultati per «…»: N` e il termine trovato evidenziato nel frammento di testo;
   cliccane uno e si apre nel pannello di lettura. La **X** dell'intestazione
   riporta alla Posta in arrivo, **Esc** svuota il campo e chiude i risultati, e
   se non c'è nulla si legge `Nessun risultato per «…»`. Si può cercare per parola
   in oggetto, mittente e corpo, anche con i prefissi in stile Outlook `da:`,
   `oggetto:`, `con:allegato`, `non:letto` (es. `da:beta impianto`).
10. **Impostazioni che cambiano il comportamento** (blocco D): nel menu Impostazioni, i riquadri
    **Lettura**, **Composizione**, **Tipi di carattere**, **Correzione automatica** e
    **Ortografia e grammatica** aprono pannelli veri. Ogni voce ha effetto subito: la posizione del
    pannello di lettura cambia il layout; "Immagini: Mai" non scarica nulla; "segna come letto dopo
    N secondi" chiama `mail_set_seen`; il formato, il carattere predefinito, il a capo automatico,
    la correzione automatica (es. `nn` → `non`) e il controllo ortografico agiscono sulla finestra
    di composizione. Tutto è salvato in `config.json` e i file esistenti si migrano senza perdere
    nulla.
    Più i quattro pannelli della **seconda metà** del blocco D: **Firme**, **Posta indesiderata**,
    **Privacy** e **Generale**. La firma predefinita dell'account entra nelle nuove composizioni e la
    finestra di composizione ha un riquadro **Firma** per sceglierne un'altra (quella precedente viene
    sostituita, non duplicata). La **Posta indesiderata** elenca i mittenti bloccati con **Sblocca** e
    un livello di protezione che agisce durante «Invia e ricevi»: con «Attiva» i messaggi dei mittenti
    bloccati vengono spostati in Posta indesiderata, con «Spenta» solo marcati. **Privacy** mostra il
    registro delle azioni IA (numero di voci, data, provider, modello, azione e **solo impronta
    SHA-256** — mai il testo), con **Esporta in un file di testo** e **Svuota il registro**. **Generale**
    ha tema, lingua delle risposte, cartella iniziale e **Svuota la cache locale** (rimuove i messaggi
    ma non configurazione, firme, bloccati né registro).
11. **Composizione completa**: nella finestra del nuovo messaggio

    - **Allegato** (o un file trascinato sulla finestra) entra nell'elenco sotto l'oggetto,
      con nome, dimensione leggibile e **X** per toglierlo; sotto c'è il totale in MB.
      All'invio il messaggio parte come `multipart/mixed` con gli allegati in base64 e i
      nomi non ASCII codificati come da RFC 2231.
    - **Tabella** chiede righe × colonne e la inserisce nel corpo; **Immagine da file**
      inserisce un'immagine **incorporata** (`cid:`, `multipart/related`) visibile nella bozza.
    - **Inserisci collegamento** avvolge il testo selezionato o inserisce il solo indirizzo
      (lo schema `https://` si aggiunge da sé; `javascript:`/`data:` sono rifiutati).
    - **Grassetto, corsivo, sottolineato, elenchi** agiscono sul corpo.
    - **Ritaglia**: seleziona un'immagine nel corpo e ritaglia su canvas; senza selezione
      lo dichiara.
    - **Rispondi / Inoltro** riportano gli allegati del messaggio originale; se il recupero
      fallisce, la bozza si apre comunque e lo dichiara con una nota.
    - A invio riuscito il messaggio viene copiato in **«Posta inviata»** del server (IMAP
      `APPEND`); se la copia non riesce, l'invio resta riuscito e la nota lo dice.
    - Chiudendo con allegati o con una bozza non inviata la finestra **avvisa** e lascia
      comunque chiudere.
    - Oltre ~20 MB di allegati l'invio è rifiutato con un messaggio leggibile.

12. **Notifiche e suoni** (blocco E): nel menu Impostazioni, il riquadro
    **Notifiche e suoni** apre un pannello vero. Quando arriva posta nuova
    durante «Invia e ricevi» compare una **notifica di sistema** di macOS col
    mittente e l'oggetto del messaggio più recente (o «N nuovi messaggi» se ne
    arrivano più di uno; oltre 99 si legge «99+»). Le regole sono rispettate
    davvero: **non** si notificano i messaggi già letti, quelli dei **mittenti
    bloccati**, quelli in **Posta indesiderata**, e non si notifica affatto se la
    finestra dell'app è in primo piano. Il **«non disturbare»** tace le notifiche
    in un intervallo di ore (es. 22:00–07:00, che scavalca la mezzanotte). Il
    **suono** si sceglie fra quelli di sistema (o «Nessuno»): «Prova» fa sentire il
    suono scelto, **«Prova notifica»** mostra una notifica vera (e, essendo una
    prova esplicita, la mostra anche dentro il «non disturbare»). Tutto è salvato
    in `config.json` con migrazione compatibile e nessuna password. Con l'app in
    sviluppo la notifica risulta attribuita a «Terminal»; nell'app installata è
    l'app stessa a firmarla.

13. **Rubrica e completamento dei destinatari** (blocco F): la voce **«Rubrica»** del ribbon
    apre la finestra dei contatti: si cerca per nome, indirizzo o azienda, si aggiunge, si
    modifica ed **Elimina** (con conferma). **Importa vCard** legge un file `.vcf` anche con
    **più contatti** e dice quanti ne ha aggiunti, aggiornati o scartati (senza indirizzo) e
    quali **campi non supportati** ha ignorato; **Esporta in vCard** scrive tutta la rubrica
    in un `.vcf` (in Download) leggibile da **Contatti di macOS**. Il **doppio clic** su un
    contatto apre una nuova composizione su quell'indirizzo. La voce **«Trova contatto»** apre
    la rubrica col fuoco già nella ricerca. Dal messaggio aperto, **«Aggiungi ai contatti»**
    salva il mittente in un clic: se l'indirizzo è già in rubrica la voce viene **aggiornata**
    (mai duplicata) e l'esito lo dice. Nei campi **A / Cc / Ccn** della composizione, mentre
    si digita compaiono i suggerimenti (dalla rubrica e dagli indirizzi già visti); si sceglie
    con le **frecce ↑↓ + Invio** o col mouse, funziona anche col **solo indirizzo** e se non
    c'è nulla da suggerire **non compare alcun riquadro vuoto**.
    Il pannello **Contatti** delle impostazioni (blocco Q) ne governa il comportamento:
    **ordinamento** della rubrica (Nome / Cognome / Azienda), **formato del nome**
    visualizzato (con **Anteprima** dal vivo) e **numero di suggerimenti** dei destinatari.
    Le voci che non si possono fare (rubrica di rete, verifica indirizzi, formattazione dei
    telefoni) sono **dichiarate non disponibili** con la ragione, non finte.

14. **Conversazioni e Regole** (blocco H): in testa alla lista c'è il pulsante
    **«▤ Conversazioni»**. Con esso attivo la lista raggruppa i messaggi in
    **conversazioni**: una riga per conversazione col **numero di messaggi** fra
    parentesi e un **badge** con quanti sono non letti. Il **triangolino ▸/▾**
    apre e chiude la conversazione mostrando i singoli messaggi indentati;
    cliccando la riga si legge il messaggio più recente. Il raggruppamento usa
    `In-Reply-To`/`References` quando ci sono e, in mancanza, l'**oggetto
    normalizzato** (i prefissi `Re:`, `I:`, `Fwd:`, `[externa]`, … non contano).
    La preferenza `raggruppaConversazioni` si salva in `config.json`.
    La voce **«Regole»** del ribbon (e il riquadro **Regole** nelle impostazioni)
    apre il pannello: qui si **creano, modificano, attivano/disattivano,
    riordinano (▲▼) ed eliminano** le regole. Una regola ha un nome e condizioni
    combinate in **AND** (mittente, oggetto, corpo, destinatario contengono; con
    allegato sì/no) e azioni applicate **nell'ordine dichiarato** (sposta in
    cartella, contrassegna, categorizza, segna come letto, elimina). Le regole
    girano **sul Mac**, durante «Invia e ricevi», sui messaggi **in arrivo**: una
    regola spenta non agisce, un messaggio già valutato non viene rielaborato
    (nessun doppio spostamento), e se il server rifiuta un'azione la regola lo
    regola lo segnala mentre le altre proseguono. Il pannello mostra quante volte
    ogni regola ha agito e l'ultima volta.

13. **Inviti di riunione e agenda** (blocco G, **versione inviti**): quando apri un
    messaggio che porta un invito (allegato `text/calendar`/`.ics`) compare in cima
    al pannello di lettura una **barra** — «Richiesta di riunione da <organizzatore>»
    con quando (data/ora e durata in italiano) e dove — e i pulsanti **Accetta**,
    **Tentativo**, **Rifiuta** più **«Apri l'agenda»**. La risposta parte **solo**
    al clic: il kernel costruisce un iCalendar `METHOD:REPLY` con lo stesso `UID` e
    il `PARTSTAT` giusto (`ACCEPTED`/`TENTATIVE`/`DECLINED`) e lo invia
    all'organizzatore come allegato. Se hai già risposto, la barra **mostra lo
    stato** invece dei pulsanti. La voce **«Riunione»** del ribbon e il riquadro
    **Calendario** delle impostazioni aprono l'**agenda a elenco** — inviti
    raggruppati in Oggi / Prossimi / Passati, con lo stato di ciascuno e i pulsanti
    per rispondere da lì — e da lì **«＋ Nuova riunione»** apre il modulo (oggetto,
    inizio, fine, giorno intero, luogo, invitati con completamento dalla rubrica,
    messaggio accompagnatorio) che crea un `METHOD:REQUEST` con **UID nuovo** e il
    tuo indirizzo come `ORGANIZER`. Lo stesso modulo si apre anche dalla
    **composizione** (voce «Riunione» del ribbon di composizione), portandosi
    dietro i destinatari di A/Cc e il corpo scritto come messaggio accompagnatorio.
    Lo **stesso `UID`** con `SEQUENCE` più alta aggiorna l'invito invece di
    duplicarlo, e un `METHOD:CANCEL` lo porta ad **annullato**. **Dichiarato**:
    l'agenda è un **elenco**, non una griglia mese/settimana/giorno; le ricorrenze
    complesse mostrano la **sola prima occorrenza**; non ci sono promemoria.

15. **Operazioni su messaggi e cartelle** (blocco I1): le funzioni dei menu reali che
    non c'erano ancora.

    - **Menu contestuale di un messaggio** (clic destro su una riga della lista):
      Rispondi, Rispondi a tutti, Inoltra, **Rinvia**, **Inoltra come allegato**,
      **Copia nella cartella…**, Sposta nella cartella…, Elimina, Archivia,
      Segna come già letto / da leggere, Categorizza, **Contrassegna** (col
      sottomenu **Più tardi oggi · Questa sera · Domani · Prossima settimana ·
      Rimuovi contrassegno**), **Ignora conversazione / Non ignorare più**,
      Segna come indesiderato / non indesiderato.
    - **Rinvia** ricostruisce il messaggio originale come nuovo (oggetto **senza**
      prefissi, allegati originali) e lo invia ai destinatari che indichi.
      **Inoltra come allegato** invia il messaggio intero come file `.eml`
      (`message/rfc822`) con un breve testo sopra.
    - **Copia nella cartella…** copia sul server (`UID COPY`); a differenza di
      Sposta, l'originale **resta**.
    - **Ignora conversazione**: i messaggi di quella conversazione vengono segnati
      letti e spostati in Posta eliminata al prossimo «Invia e ricevi». È
      **reversibile**: **Non ignorare più** la riattiva.
    - **Menu contestuale di una cartella** della barra laterale: Nuova cartella,
      Rinomina cartella, **Elimina cartella**, **Svuota cartella**, Segna tutti
      come già letti, **Aggiungi a Preferiti / Rimuovi da Preferiti**. Le
      operazioni distruttive (**Elimina cartella**, **Svuota cartella**, **Svuota
      Posta eliminata**) chiedono conferma in una finestrella e scrivono l'esito
      nella barra di stato.
    - I **Preferiti** restano in alto nella barra laterale, col simbolo ★.
    - **Salva come bozza**: con ⌘S nella finestra di composizione il messaggio va
      nella cartella **Bozze** del server con il flag `\Draft`; non richiede
      destinatari.
    - **Contrassegno con scadenza**: la data è metadato locale e si vede nella
      barra informativa del messaggio; le date sono calcolate da una funzione
      pura (a cavallo di mezzanotte e di fine settimana).
    - Se il server rifiuta un'operazione (per esempio `CREATE` di una cartella in
      sola lettura) l'errore è in italiano e la cache **non cambia**.

18. **Visualizza, Cerca, Sincronizzazione, Archiviazione** (blocco N): quattro
    pannelli delle impostazioni delle viste reali.

    - **Visualizza** (riquadro nella scheda *Posta elettronica*): densità di
      visualizzazione, **colore della riga contrassegnata** (Giallo — il valore
      misurato `MessageListFlaggedBackgroundColor` — oppure Nessuno), anteprima
      del testo nella lista e raggruppamento in conversazioni. Tutto ha effetto
      subito e si salva in `config.json`. **Dichiarato**: le dimensioni del testo
      seguono il carattere di sistema e la densità; non c'è un interruttore
      separato che abbia effetto.
    - **Cerca** (scheda *Posta elettronica*): ambito predefinito (**Tutte le
      cartelle** / **Cartella corrente**), numero massimo di risultati (10–500,
      passato a `mail_cerca`) e «Cerca mentre si digita» (spento, si cerca con
      Invio). **Dichiarato**: la scelta dei campi non è offerta — l'indice locale
      cerca **oggetto, mittente e corpo insieme**; per limitare un campo restano i
      prefissi `da:`, `oggetto:`, `a:`.
    - **Impostazioni di sincronizzazione** (riquadro **Sincronizzazione**): un
      **intervallo** (Mai / 5–120 minuti) che avvia un timer di «Invia e ricevi»
      **mentre l'app è aperta** (non è un servizio in background) e «Sincronizza
      all'avvio». Blocco W: **Ricevi i messaggi appena arrivano (push)**, spento
      di default, tiene un IMAP IDLE sulla Posta in arrivo di ogni casella e ne
      mostra lo stato (attivo, riconnessione, server senza IDLE, fermo).
      **Dichiarato**: Exchange non è supportato.
    - **Archiviazione** (scheda *Altro*): mostra la **dimensione vera** della
      cache locale e il numero di messaggi (comando `archiviazione_stato`), una
      soglia di avviso in MB e **Svuota la cache locale** (comando `svuota_cache`).
      **Dichiarato**: la **quota del server** non è interrogata, quindi non è
      mostrata.

19. **Aspetto e Accessibilità** (blocco P): due pannelli che agiscono sul posto.

    - **Aspetto** (riquadro nella scheda *Impostazioni personali*): il **tema**
      (Sistema / Chiaro / Scuro, gli stessi nomi di «Generale») e il **colore
      accento**. Le tinte sono quelle **misurate** dall'app reale (il blu
      `#0078D4`, più i preset categoria); sceglierne una cambia subito la barra
      multifunzione, i pulsanti principali e la voce selezionata. Le varianti
      hover/pressed/disattivato sono **derivate** dalla tinta scelta, non scelte a
      caso; con il blu predefinito valgono i token misurati, senza override.
    - **Accessibilità** (scheda *Altro*): **Riduci movimento** (spegne animazioni
      e transizioni), **Aumenta contrasto** (bordi e testi secondari più marcati,
      nei due temi), **Mostra sempre le etichette dei pulsanti** (spenta, il
      ribbon resta di sole icone) e le **dimensioni del testo** dell'interfaccia
      (90 / 100 / 115%). Tutto ha effetto immediato e si salva in `config.json`.
      Le etichette delle opzioni sono quelle **reali di macOS** (*Riduci
      movimento*, *Aumenta contrasto*, *Aumenta/Riduci le dimensioni del testo*):
      il pannello di Outlook rimanda alle preferenze di sistema e non porta con sé
      quelle stringhe. **Dichiarato**: il **lettore schermo** (VoiceOver) e la
      **dettatura** sono pilotati dal sistema operativo e non sono disponibili
      nel pannello.

16. **Vista, ricerca avanzata, composizione** (blocco I2, versione vista/ricerca):

    - **Ordina per** e **Densità di visualizzazione** nel ribbon. «Ordina per» ordina la
      lista per **Data · Mittente · Oggetto · Dimensione** in verso **Crescente o
      Discendente**; «Densità di visualizzazione» sceglie fra **Compatta ·
      Accogliente · Spaziosa** e cambia **davvero** l'altezza delle righe. Entrambe si
      salvano in `config.json`. Campo o verso sconosciuti ricadono sul default (data
      discendente). La **dimensione** è approssimata (lunghezza del corpo in cache più
      un peso fisso per gli allegati): la cache non conserva la dimensione esatta del
      messaggio — è dichiarato.
    - **Ricerca avanzata…** apre un modulo (Da, Oggetto, A, Con allegato sì/no, solo i
      non letti, periodo da/a) che costruisce la query sulla **stessa sintassi a
      prefissi** del motore FTS5 già esistente — il motore resta uno solo. I prefissi
      sono `da:`, `oggetto:`, `a:`, `con:allegato`/`senza:allegato`, `non:letto`,
      `dopo:AAAA-MM-GG`/`prima:AAAA-MM-GG`. Una data non valida non entra nella query.
    - **Formattazione** nel corpo della composizione: **Barrato**, **Testo normale**,
      **Cancella formattazione**, **Colore evidenziazione carattere**. Con una
      selezione si inserisce il markup con `insertHTML`; **non si riscrive mai
      `innerHTML` da `innerText`**, quindi il resto del contenuto formattato resta.
    - **Zoom della composizione** (`ChunkZoom`): A⁻/A⁺ cambiano davvero la dimensione
      del testo nel corpo (50–400%), come nel ribbon reale.
    - **Invia più tardi** (`OLChunkSendLater`): dalla composizione si sceglie data e ora
      (o «Tra 2 ore · Tra 4 ore · Domani alle 9:00»). Il messaggio resta in **coda
      locale** (`invii_programmati.json`) e parte a quell'ora **mentre l'app è aperta**;
      la riga di stato lo mostra ed è annullabile (`invio_programmato_annulla`). **Non
      è un invio lato server**: se l'app è chiusa all'ora scelta, parte alla riapertura.
    - **Conferme di lettura e recapito** (`ChunkOutlookTracking`): in composizione due
      opzioni generano le intestazioni standard — `Disposition-Notification-To` per la
      **lettura**, `Return-Receipt-To` (più `Disposition-Notification-To`) per il
      **recapito** (RFC 3798/8098). Le intestazioni compaiono **solo se richieste**.
      All'**arrivo** di un messaggio che le chiede compare una barra discreta «Il
      mittente ha chiesto una conferma» con **Invia la conferma** / **Non inviare**; la
      scelta resta in cache. **Nessuna conferma parte da sé**: al clic su «Invia la
      conferma» parte una risposta MDN reale.
    - **Pannelli delle impostazioni** mancanti: **Scelte rapide da tastiera** (elenco
      delle scorciatoie **effettivamente attive**, ricavate dai gestori `keydown` del
      codice) e **Impostazioni personali** (nome, iniziali, indirizzo di risposta
      predefinito → `Reply-To`). L'**immagine del profilo non è mostrata**: in un client
      IMAP locale non avrebbe alcun effetto osservabile.
    - La **dettatura** (`VoiceChunkTools`) **non è disponibile** ed è dichiarata tale:
      è la dettatura di macOS, non pilotabile da un'applicazione.

17. **Più caselle** (blocco J): la barra laterale è **raggruppata per account**.

    - In cima c'è **«Tutti gli account»** con la sua **Posta in arrivo** (la posta
      di tutte le caselle insieme, ordinata per data e con l'account di
      provenienza); sotto, un nodo **espandibile** (▸/▾) per ogni casella con le
      sue cartelle e il numero dei **non letti**; i **Preferiti** (★) restano in
      alto dentro il loro account. La voce selezionata è evidenziata; cliccando
      una cartella la lista passa su **quell'account e quella cartella** e la
      **barra di stato** scrive l'account attivo (o «Tutti gli account»).
    - Nella finestra **Account** (Impostazioni → Account) c'è l'elenco **vero** di
      tutte le caselle: quella **predefinita** è segnalata; cliccando una riga la
      si modifica; **«＋ Nuovo account»** apre un modulo vuoto e aggiunge la
      casella nuova senza toccare le altre; **«−»** elimina con conferma (sparisce
      la casella dall'app, i suoi messaggi dalla cache locale e la password dal
      Portachiavi — gli altri account non si toccano e sul server non cambia
      nulla); **«Rendi predefinito»** sceglie la casella aperta all'avvio;
      **«Sincronizza ora»** agisce sull'account aperto. Dopo ogni operazione
      l'elenco si aggiorna da solo.
    - **«Invia e ricevi»** sincronizza **tutte** le caselle e riporta l'esito
      **per account**: una casella con la password sbagliata non blocca le altre e
      l'errore dice a quale casella si riferisce.
    - La **lettura** (corpo e allegati, bozze di risposta/inoltro, inviti,
      conferme) usa l'account della riga aperta. **Dichiarato**: le altre azioni
      sui messaggi (segna letto, contrassegna, sposta, elimina, categorie, copia,
      indesiderato, scadenza) restano sull'account **predefinito**; una cartella
      di una casella secondaria, ancora vuota, compare dopo il primo sync che le
      porta almeno un messaggio (vedi il blocco J nel piano).

## 6. Cosa non c'è (per non sembrare rotto)

- **calendario a griglia, ricorrenze calcolate e promemoria**: fuori dalla v1. Gli
  **inviti di riunione** però ci sono (blocco G, versione inviti): lettura degli
  `.ics` in arrivo, accetta/tentativo/rifiuta con risposta iCalendar reale, agenda
  a **elenco** e creazione di inviti in uscita. Non c'è un calendario con viste
  mese/settimana/giorno né il calcolo delle occorrenze di una ricorrenza.
- **note**: fuori dalla v1 (i **contatti** ci sono: blocco F)
- **threading lato server**: il raggruppamento in conversazioni è **locale**
  (blocco H); il contesto dell'assistente segue la conversazione solo se i
  messaggi sono nella stessa cartella

## 7. Se qualcosa non va

| Sintomo | Cosa controllare |
|---|---|
| "modello locale non in esecuzione" | Splash-M1 avviato? `curl http://127.0.0.1:8000/health` |
| **Non si sa dove si ferma la connessione** | nella finestra Account, pulsante **«Prova connessione…»** (blocco M): prova `nome server`, `connessione`, `certificato`, `saluto del server`, `accesso` e `cartelle` in ordine, si ferma al primo che non riesce e riporta **la risposta del server** e un consiglio in italiano. «Copia il risultato» lo mette negli appunti, da incollare a chi assiste |
| Login IMAP rifiutato | indirizzo completo come nome utente; password per le app se c'è la 2FA. Se il passo è `accesso`, il testo del server dice perché (es. `NO [AUTHENTICATIONFAILED]`) |
| La lista non si popola | cartella sbagliata o sync non ancora concluso; la barra di stato dice "connesso a …" o "offline" |
| Immagini mancanti nella mail | sono bloccate per scelta: "Mostra immagini" vale solo per quel messaggio |
| Il testo della mail è povero | l'HTML viene sanificato: script, iframe e stili remoti sono rimossi di proposito |

## 8. Comandi utili per chi sviluppa

```bash
# test del kernel (dalla cartella src-tauri)
cargo test

# test dell'interfaccia (dalla radice del repo)
npm install          # solo la prima volta: i test del pannello di lettura usano jsdom
node --test tests/*.mjs

# anteprima dell'interfaccia senza account né credenziali (percorso browser)
python3 -m http.server 8099 --directory ~/outlook-ai-clone
# poi: http://127.0.0.1:8099/src/index.html?theme=dark
#      ?view=compose   → finestra di composizione
#      ?view=compose-allegati → composizione con due allegati e una tabella (blocco C)
#      ?theme=light    → forza il tema (abbinabile alle viste sopra)
#      ?view=assistente → barra dell'Assistente con scheda simulata
#      ?view=controllo  → controllo pre-invio con avvisi simulati
#      ?view=ricerca&q=manutenzione → campo Cerca compilato con i risultati
#      ?view=ricerca&q=zzz → caso vuoto ("Nessun risultato per «zzz»")
#      ?view=impostazioni-lettura|composizione|carattere|correzione|ortografia → pannello del blocco D (prima metà)
#      ?view=impostazioni-firme|posta|privacy → pannelli del blocco D (seconda metà)
#      ?view=impostazioni-generale → hub Impostazioni col riquadro Generale aperto
#      ?view=impostazioni-notifiche → pannello del blocco E (Notifiche e suoni)
#      ?view=rubrica                → finestra della rubrica con i contatti di esempio (blocco F)
#      ?view=rubrica&q=beta&focus=1 → rubrica con la ricerca compilata e col fuoco nel campo
#      ?view=compose-suggerimenti&q=a → composizione col riquadro dei suggerimenti dei destinatari aperto
#      ?view=conversazioni          → lista raggruppata per conversazione, una aperta e le altre chiuse (blocco H)
#      ?view=regole                 → pannello Regole con due regole di esempio (blocco H)
#      ?view=regole&form=1          → pannello Regole col modulo di modifica aperto
#      ?view=invito                 → barra dell'invito in cima al messaggio aperto (blocco G)
#      ?view=agenda                 → agenda a elenco degli inviti (blocco G)
#      ?view=nuova-riunione         → modulo di una nuova riunione (blocco G)
#      ?view=menu-messaggio         → menu contestuale di un messaggio (blocco I1)
#      ?view=menu-conversazione     → menu contestuale di una conversazione (blocco I1)
#      ?view=menu-cartella          → menu contestuale di una cartella (blocco I1)
#      ?view=menu-ordina            → menu «Ordina per» (blocco I2)
#      ?view=menu-densita           → menu «Densità di visualizzazione» (blocco I2)
#      ?view=ricerca-avanzata       → modulo «Ricerca avanzata…» (blocco I2)
#      ?view=compose&later=1        → composizione col popover «Invia più tardi» (blocco I2)
#      ?view=compose&conferme=1     → composizione col popover delle conferme (blocco I2)
#      ?view=conferma               → barra della conferma di lettura nel pannello di lettura (blocco I2;
#            i pulsanti dichiarano che fuori dall'app la conferma non parte)
#      ?view=impostazioni-scelte-rapide → pannello «Scelte rapide da tastiera» (blocco I2)
#      ?view=impostazioni-personali → pannello «Impostazioni personali» (blocco I2)
#      ?view=impostazioni-visualizza → pannello «Visualizza» (blocco N)
#      ?view=impostazioni-cerca → pannello «Cerca» (blocco N)
#      ?view=impostazioni-sincronizzazione → pannello «Impostazioni di sincronizzazione» (blocco N)
#      ?view=impostazioni-archiviazione → pannello «Archiviazione» (blocco N)
#      ?view=impostazioni-aspetto → pannello «Aspetto» (blocco P): tema (Chiaro /
#            Scuro / Sistema) e colore accento, con la tavolozza delle tinte misurate
#      ?view=impostazioni-accessibilita → pannello «Accessibilità» (blocco P):
#            riduci movimento, aumenta contrasto, dimensioni del testo, etichette dei pulsanti
#      ?accento=verde → colore accento (blocco P, prova visiva); ?testo=115 → testo più grande
#      ?contrasto=1&movimento=1&etichette=0 → effetti di Accessibilità (blocco P)
#      ?view=impostazioni-categorie → pannello «Categorie» (blocco O): elenco con
#            colore, Aggiungi/Rinomina/Elimina (con conferma), riordino ▲▼, tavolozza
#      ?view=impostazioni-contatti → pannello «Contatti» (blocco Q): ordinamento
#            della rubrica (Nome / Cognome / Azienda), formato del nome visualizzato
#            con «Anteprima:», numero di suggerimenti dei destinatari; dichiara le
#            voci non disponibili (rubrica di rete, verifica indirizzi, telefoni)
#      ?densita=compatta|accogliente|spaziosa → densità della lista (prova visiva)
#      ?zoom=150 → zoom del corpo di composizione (prova visiva)
#      ?lettura=destra|sotto|nascosto → posizione del pannello di lettura (prova visiva)
#      ?anteprima=1 → anteprima del testo in lista
#      ?carattere=Georgia&dimensione=18&ortografia=1&correzione=1&formato=testo → effetto sulla composizione
#      ?view=cartelle → barra laterale raggruppata per account (blocco J)
#      ?view=cartelle&account=tutti → selezione su «Tutti gli account → Posta in arrivo»
#      ?view=cartelle&account=gmail → selezione su una casella (per nome o indirizzo)
#      ?view=account → finestra Account con due caselle di esempio (blocco J)
#      ?view=nuovo-account → finestra Account col modulo di un nuovo account (blocco J)
#      ?view=operazioni-account → barra laterale con due caselle e la riga di stato
#                                 di un'azione eseguita su una sola casella (blocco K)
#      ?view=cartella-account   → menu contestuale della «Posta eliminata» della seconda
#                                 casella, con la riga di stato per account (blocco L)
#      ?view=diagnostica        → finestra Account con la prova della connessione già
#                                 eseguita sul caso «accesso rifiutato» (blocco M)
#      ?view=lettura                → primo messaggio nel pannello di lettura, con A⁻/A⁺ (blocco R)
#            In anteprima browser il corpo resta quello di esempio di `renderReading`:
#            l'iframe col carattere e la scala si vede solo dentro l'app avviata
#      ?zoomlettura=150             → il pannello di lettura col testo al 150% (blocco R)
#      ?view=compose&carattere=Georgia&dimensione=18 → gruppo «Carattere» con la scelta (blocco R)

# pacchetto .app (Milestone 9)
npm run tauri build
```