# Inventario delle funzioni di Outlook, ricavato dall'app installata

Documento di riferimento per completare il clone. Serve a rispondere a una domanda sola: **quali funzioni
esistono in Outlook, come si chiamano in italiano, e quali ci mancano?**

## Metodo, e cosa questo documento non è

Le etichette qui elencate sono state estratte dai **cataloghi di localizzazione dell'app regolarmente
installata** su questo Mac (`/Applications/Microsoft Outlook.app`, versione 16.113.4), in particolare da
`Contents/Resources/it.lproj/*.strings`. È la stessa cosa che si legge guardando i menu dell'app: nomi delle
funzioni, non implementazione.

- **Nessun codice, icona, immagine o tipo di carattere di Microsoft è stato copiato** in questo progetto e non
  deve esserlo: il clone riproduce layout, etichette e comportamento osservabile sopra protocolli standard
  (IMAP, MIME, iCalendar, FTS5). Copiare il loro codice in un'app nostra sarebbe contraffazione, oltre che inutile.
- Le etichette estratte servono a **non inventare**: quando una voce del nostro clone si chiama come in Outlook,
  è perché quel nome è stato letto nella loro app, non tradotto a naso.
- I dump grezzi restano fuori dal repository (dati derivati, ~600 KB, nessun valore per chi legge il codice).

## Cosa c'è dentro Outlook (numeri reali)

| Cosa | Quantità |
|---|---|
| Cataloghi di stringhe in italiano | **180** file `.strings` |
| Etichette di comando uniche nei menu e nei menu contestuali | **449** |
| Pannelli delle preferenze | **30** |
| Chiavi nel catalogo principale (`ZStrings`) | 4.968 |

I cataloghi per area (i più grandi): `CalendarView`, `ContactListView`/`ContactView`, `MessageListView`,
`TaskListView`, `ReminderWindow`, `DocumentMenus`, `ViewMenus`, `NavigationPane.ContextualMenu.Folders`,
tutti i `Preferences.Panes.*` (Account IMAP/Exchange/POP/LDAP, Composing, Viewing, AutoCorrect, Calendar,
Notifications, Privacy, Signatures, AddressBook, All).

## L'albero delle preferenze, per intero

L'elenco **autorevole** dei pannelli è in `ZStrings.strings`, chiave `/ERPreferencesWindow/Views/*`
(28 pannelli). Qui nome italiano di Outlook, la chiave, e lo stato nel nostro clone.

| Pannello di Outlook | chiave | Nel nostro clone |
|---|---|---|
| Generale | `General` | ✅ |
| Tipi di carattere | `Editing` | ✅ |
| Composizione | `Composing` | ✅ |
| Lettura | `Viewing` | ✅ |
| Firme | `Signatures` | ✅ |
| Correzione automatica | `AutoCorrect` | ✅ |
| Ortografia e grammatica | `SpellingGrammar` | ✅ |
| Posta indesiderata | `Junk` | ✅ |
| Notifiche e suoni | `Notifications` | ✅ |
| Privacy | `Privacy` | ✅ |
| Regole | `Rules` | ✅ |
| Scelte rapide da tastiera | `KeyboardShortcuts` | ✅ (I2) |
| Account | `Accounts` | ✅ |
| Copilot | `Copilot` | ✅ sostituito dall'**Assistente IA** (locale) |
| Contatti | `AddressBook` | ✅ (Q) pannello: ordinamento rubrica, formato del nome, n. suggerimenti (rubrica del blocco F) |
| Categorie | `Categories` | ⚠️ riquadro presente, **nessuna azione** |
| Calendario | `Calendar` | ⚠️ inviti/agenda sì, **niente griglia** (fuori v1) |
| **Aspetto** | `Appearance` | ❌ mancante — tema/colori (fattibile: vedi `colori-misurati.md`) |
| **Visualizza** | `Display` | ❌ mancante (in parte nel ribbon: densità, anteprime) |
| **Cerca** | `Search` | ❌ mancante (in parte nel ribbon: ricerca avanzata) |
| **Impostazioni di sincronizzazione** | `SyncSettings` | ❌ mancante (intervallo di sync) |
| **Archiviazione** | `StorageQuota` | ❌ mancante (spazio della cache locale) |
| Risposte automatiche | `AutoReply` | ❌ mancante — è **lato server Exchange**, un client IMAP locale non può farlo: si dichiara |
| Promemoria | `Reminders` | ❌ fuori v1 (serve il calendario) |
| La mia giornata | `MyDay` | ❌ fuori v1 (pannello agenda laterale) |
| Profili | `FocusProfile` | ❌ fuori portata (notifiche di sistema «Non disturbare») |
| Accessibilità | `Accessibility` | ❌ mancante (fattibile: riduzione movimento, contrasto) |
| Annuncio | `Ad` | ❌ non applicabile (annunci Microsoft) |
| Altro/Tutte | `All` | — hub, non pannello |

## I comandi che ci mancano e che possiamo fare davvero

Sono i comandi dei menu reali che si appoggiano a IMAP o a lavoro locale. **Batch I** li raggruppa così:

**I1 — operazioni su messaggi e cartelle**
`Rinvia` · `Inoltra come allegato` (il messaggio originale come `.eml`) · `Copia nella cartella…` (distinta da
Sposta, che già c'è) · `Ignora conversazione` / `Non ignorare più` · `Nuova cartella` · `Rinomina cartella` ·
`Elimina cartella` · `Svuota cartella` / `Svuota Posta eliminata` · `Segna tutti come già letti` ·
`Salva come bozza` · `Aggiungi a Preferiti` / `Rimuovi da Preferiti` · contrassegno con scadenza
(`Posponi`, `Più tardi oggi`, `Questa sera`, `Prossima settimana`, `Rimuovi contrassegno`).

**I2 — vista, ricerca e composizione**
`Ordina per` (data, mittente, oggetto, dimensione) · `Densità di visualizzazione` (Compatta/Accogliente/Spaziosa) ·
`Ricerca avanzata…` (da, oggetto, con allegato, periodo — sopra l'indice FTS5 che c'è già) ·
formattazione (`Barrato`, `Cancella formattazione`, `Testo normale`, `Colore evidenziazione carattere`) ·
pannelli `Scelte rapide da tastiera` e `Impostazioni personali`.

## La barra multifunzione, letta dal file di definizione

Oltre ai cataloghi di stringhe, l'app contiene i **file di definizione del ribbon** (`Contents/Resources/*.ribbon`,
XML): `outlook_compose`, `outlook_calendar_event`, `outlook_task`, `outlook_signature`, `outlook_formatting`.
Sono la fonte autorevole di **quali gruppi esistono e in che ordine**, molto più affidabile di una schermata.

Il ribbon di composizione (`RibbonID="Microsoft.Outlook.Mail.Compose"`) ha tre schede: *Nuovo messaggio di posta*,
*Opzioni messaggio*, *Opzioni Web*. Gruppi della prima, in ordine:
`OLChunkSend`, `OLChunkSendLater`, `ChunkClipboard`, `ChunkBasicText`, `ChunkNightMode`, `ChunkInclude`,
`ChunkTable`, `ChunkIllustrations`, `ChunkPictureTools`, `ChunkOutlookMoreOptions`, `ChunkNames`,
`VoiceChunkTools`, `ChunkEditor`, `ChunkClassificationLabel`.

Da qui vengono tre funzioni che nel nostro clone mancavano o mancano:

- **`OLChunkSendLater`** → *Invia più tardi* (pianificazione dell'invio). **Fatto** (blocco I2).
- **`ChunkOutlookTracking`** (scheda *Opzioni messaggio*) → *Richiedi conferma di lettura* e *di recapito*,
  con la barra che all'arrivo chiede se inviare la conferma. **Fatto** (blocco I2; intestazioni standard
  `Disposition-Notification-To` / `Return-Receipt-To`, RFC 3798 / 8098).
- **`VoiceChunkTools`** (dettatura) → **impossibile** da un'applicazione: è la dettatura del sistema operativo.
  Non va finta: si dichiara non disponibile, con la ragione.
- `ChunkClassificationLabel` e `ChunkDrmProtect` (etichette di risoluzione e protezione IRM) → servizio
  Microsoft 365, fuori portata come già detto sopra.

I cataloghi dei pulsanti (`mso40ui.framework/…/it.lproj/tbbtn.strings`, 25.993 voci; `tbsupertip.strings`,
5.034 descrizioni) sono indicizzati per **identificativo numerico interno**, non per nome di comando: si possono
leggere le etichette ma non ricostruire in modo affidabile la mappa comando → etichetta. Per questo l'inventario
dei comandi si basa sui menu e sulle stringhe per nome di finestra, che sono indicizzati per nome.

## Cosa NON implementeremo, e perché

Non è pigrizia: sono funzioni che appartengono al server o all'ecosistema, e un client IMAP locale non può
onestamente offrirle. Se le mostrassimo senza farle, sarebbero i pulsanti muti che l'utente rifiuta.

- **Exchange / Microsoft 365**: cassette postali condivise, cartelle delegate, permessi, cartelle pubbliche,
  `Imposta accesso e autorizzazioni`, `Aggiorna da directory`, `Controlla nomi` (rubrica globale).
- **Teams, Skype, riunioni online, Chat**: `Aggiungi riunione online`, `Partecipa a riunione online`.
- **Codifiche e fusi orari di sistema**: `Codifica testo` (decine di voci), `Gesti`, `Sintesi e riconoscimento vocale`.
- **Aggiornamenti, diagnostica, feedback, licenza**: `Controlla aggiornamenti`, `Raccogli dati di diagnostica`,
  `Ripristina Outlook legacy`, `Novità`.
- **Firma digitale S/MIME e crittografia** (`Crittografa`, `Limita autorizzazioni`): richiede certificati e
  infrastruttura. **Deciso con l'utente: non servono** — non vanno implementati né proposti di nuovo.
- **Copilot**: sostituito dal nostro Assistente IA con modello locale, che è già un delta dichiarato.

## Fedeltà delle etichette già in uso

Le voci del nostro ribbon e i riquadri delle impostazioni sono state confrontate con queste liste: i nomi
coincidono dove la funzione coincide (`Elimina`, `Archivia`, `Sposta`, `Letto/Da leggere`, `Categorizza`,
`Completa`, `Trova contatto`, `Rubrica`, `Invia e ricevi`, `Filtra posta elettronica`, `Conversazioni`,
`Tipi di carattere`, `Correzione automatica`, `Ortografia e grammatica`, `Firme`, `Posta indesiderata`,
`Notifiche e suoni`, `Privacy`, `Regole`, `Calendario`, `Contatti`, `Account`, `Generale`).
