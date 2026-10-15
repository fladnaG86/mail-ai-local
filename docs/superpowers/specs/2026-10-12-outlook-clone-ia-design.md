# Design — Client di posta "Outlook + Assistente IA"

Data: 2026-10-12 · Stato: **bozza per revisione dell'utente**
Autore: Hermes Agent (su richiesta di Mario Rossi)

---

## 1. Obiettivo

Un client di posta **desktop** che riproduce l'interfaccia di Microsoft Outlook per macOS così come
l'utente la usa oggi (UI classica con ribbon, lista a tabella, pannello di lettura sotto la lista),
con **una sola aggiunta**: comandi IA integrati per riassumere, rispondere, tradurre ed estrarre
azioni dalle mail.

### Non obiettivi (espliciti)

- Non è un sostituto di Outlook per la produttività aziendale: è uno strumento personale dell'utente.
- Non copia né ridistribuisce materiali Microsoft (icone, immagini, font, nib). Si riproducono layout,
  spaziature, palette e tipografia; le icone finali saranno simboli di sistema o disegnate.
- Non implementa calendario, contatti, note, attività nella v1 (vedi §11).
- Non fa invio automatico di nulla: ogni azione IA produce testo che l'utente rivede e decide.

---

## 2. Riferimento visivo e misure (verificate)

Riferimento: **Microsoft Outlook 16.113.4** su macOS 27.2, modalità "Legacy Outlook", in uso
dall'utente. Misure ricavate da due screenshot dell'utente (tema scuro e tema chiaro) e dalla palette
estratta da `Assets.car` dell'app.

### 2.1 Geometria (punti, verificata identica nei due temi)

| Elemento | Valore |
|---|---|
| Finestra | 1728 × 988 pt |
| Barra del titolo | 28 pt (sfondo chrome) |
| Ribbon (tab + gruppi) | 108 pt |
| Sidebar | 234 pt, separatore 1 pt |
| Intestazione colonne lista | 23 pt |
| Riga messaggio | 27 pt, separatore 1 pt |
| Pannello di lettura | sotto la lista, separato da 1 pt |
| Barra informativa messaggio | 20 pt |
| Barra di stato | 26 pt |

### 2.2 Palette

Provenienza: **M** = misurato sugli screenshot dell'utente · **A** = presente in `Assets.car` dell'app · **D** = dedotto.

| Token | Scuro | Chiaro |
|---|---|---|
| Superficie finestra | `#1E1E1E` (M) | `#FFFFFF` (M) |
| Chrome (titolo/ribbon/stato) | `#282828` (M) | `#F5F5F5` (M) |
| Intestazione colonne | `#303132` (M) | `#F3F3F3` (M) |
| Separatori riga | `#464646` (M) | `#F3F2F1` (M) |
| Riga selezionata | `#102F79` (M, ≈ `#00307E` A) | `#E0EBF7`, testo scuro (M) |
| Testo primario / secondario | `#E6E6E6` / `#B3B3B3` (M) | `#242424` / `#605E5C` (M) |
| Barra informativa | `#323232` (M) | `#E9EEF3` (M) |
| Cartella selezionata | `#454646` (M) | `#F3F2F1` (M) |
| Accento primario | `#4BA0FF` (M), hover `#0085F0` (A), pressed `#004E8A` (A) | `#0078D7` (D) |
| Accento IA | `#7B83EB` (A) | `#7B83EB` (A) |

Dettaglio completo in `design-tokens.css`, dove ogni valore è annotato con la sua provenienza.

### 2.3 Delta rispetto all'app di riferimento (voluti, approvati)

1. **Barra dell'Assistente** in cima al pannello di lettura: *Riassumi · Rispondi · Estrai azioni · Traduci*
   + selettore del modello con indicazione della destinazione dei dati.
2. **Gruppo "Assistente" nel ribbon**, dove Outlook ha "Invia e ricevi".

### 2.4 Finestra "Nuovo messaggio" (misurata sul terzo screenshot)

| Elemento | Valore |
|---|---|
| Finestra | 1496 × 878 pt (più stretta della finestra principale) |
| Titolo + ribbon | 28 + 108 = 136 pt, chrome `#282828` |
| Righe campi A: / Cc: / Oggetto: | 23 / 22 / 22 pt, bordi `#353535` |
| Anello di fuoco sul campo attivo | ~2 pt, `#416D97` |
| Corpo | da ~258 pt, sfondo `#1E1E1E` |
| Bordi | campo attivo `#585858`, corpo `#515151` |
| Suggerimento ecologico | verde `#479E46` |
| Ribbon | tab Messaggio / Opzioni; gruppi: Invia, Incolla, carattere (Aptos, corpo 12, A⁻ A⁺, A_A, G I S barrato, apice/pedice, evidenziatore, colore), paragrafo (elenchi, rientri, allineamenti), Cambia sfondo, Allega file, Inserisci collegamento, Tabella, Immagine da file, Firma, Ritaglia, Priorità alta/bassa, Controlla nomi |
| Firma | blocco immagine con logo Esempio e scheda contatto |

Aggiunte IA previste in composizione (approvazione in corso): **gruppo "Assistente" nel ribbon** e
**barra "Controllo prima dell'invio"** sopra il corpo (allegati citati nel testo ma assenti, destinatari,
tono, dati sensibili). Le funzioni esatte sono in §12.

### 2.5 Finestre di impostazioni (misurate sul quarto e quinto screenshot)

| Elemento | Valore |
|---|---|
| "Impostazioni di Outlook" | 992 × 372 pt, sfondo `#313335`, barra titolo `#262628` (26 pt), separatori di gruppo `#494B4D` |
| "Account" (dettaglio) | 738 × 742 pt, contenuto `#1F1F20`, pannello laterale 200 pt `#181819`, separatore `#353535` |
| Righe del modulo Account | etichetta a destra (colonna ~170 pt) + campo; campi `#1E1E1E` con bordo `#3A3A3B` |
| Gruppi | Impostazioni personali (Generale, Account, Notifiche e suoni, Categorie, Tipi di carattere, Correzione automatica, Ortografia e grammatica) · Posta elettronica (Lettura, Composizione, Firme, Regole, Posta indesiderata) · Altro (Calendario, Contatti, Privacy) |

**Aggiunta IA**: riquadro **"Assistente IA"** nel gruppo *Posta elettronica*, con pannello dedicato
(motore locale/cloud, endpoint, modello locale e cloud, conferma prima di ogni invio al cloud, registro
delle richieste inviate al cloud, avvio automatico del modello, tono e lingua delle bozze).

**Configurazione IMAP reale dell'utente** (letta dal suo screenshot, senza password): account
`mario.rossi@esempiogroup.it`, **IMAP `imaps.esempiohost.it:993` SSL** (in arrivo) e
**SMTP `smtps.esempiohost.it:465` SSL** (in uscita). Conferma che la posta aziendale è su **Esempio Host**, non su
Exchange: la scelta IMAP+SMTP è quella corretta e i parametri di prova sono già noti.

Nient'altro cambia rispetto al riferimento.

---

## 3. Decisioni registrate

| Tema | Decisione |
|---|---|
| Tipo di progetto | Clone dell'interfaccia di Outlook + IA (non plugin, non web app generica) |
| Stack | **Tauri 2**: nucleo in Rust + interfaccia web nella webview di sistema |
| Posta | **IMAP** (+ SMTP per l'invio), provider generico (Esempio Host, Gmail, altri) |
| Motore IA | **Locale come default** (Splash-M1 / `llama-server` sul MacBook); **cloud (OpenRouter) solo su richiesta esplicita per quel messaggio**, con etichetta visibile di cosa esce |
| Comandi IA | Barra dedicata nel pannello di lettura (scelta dell'utente sul companion) + gruppo nel ribbon |
| Tema | Chiaro/Scuro/Sistema, un solo set di token |
| Piattaforma | macOS prima (Apple Silicon), senza escludere Windows in seguito |

---

## 4. Architettura

```
┌──────────────────────── Tauri 2 app ────────────────────────┐
│  Webview (WKWebView di sistema)                              │
│  UI: ribbon, sidebar, lista, pannello di lettura, barra IA   │
│  consuma i token di design-tokens.css                        │
└───────────────┬──────────────────────────────────────────────┘
                │  IPC (comandi Tauri, serde)
┌───────────────┴────────────── Nucleo Rust ───────────────────┐
│ mail::imap    sync cartelle, fetch messaggi, IDLE            │
│ mail::smtp    invio (lettre), allegati                       │
│ store        SQLite + FTS5: messaggi, thread, indice ricerca │
│ secrets      keyring macOS: password IMAP, chiavi API        │
│ sanitize     ammonia: HTML delle mail → HTML sicuro          │
│ llm          client OpenAI-compatibile: locale | OpenRouter   │
│ config       preferenze (tema, provider, modelli, privacy)    │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Perché Tauri e non Electron

Le mail sono HTML: una webview serve comunque. Tauri usa WKWebView di sistema (nessuna dipendenza da
spedire, `.app` di ~10-15 MB contro ~150 MB), e mette in Rust tutto ciò che deve essere affidabile:
rete, credenziali, cache, sanitizzazione, chiamate ai modelli.

### 4.2 Crate Rust previste

`tokio` · `async-imap` (TLS via `rustls`/`native-tls`) · `lettre` (SMTP) · `mail-parser` (MIME, thread,
allegati) · `ammonia` (sanitizzazione HTML) · `rusqlite` + FTS5 (cache e ricerca) · `keyring`
(Keychain) · `reqwest` (cliente LLM) · `serde`/`serde_json` (tipi condivisi con l'interfaccia) ·
`tauri` + `tauri-plugin-store` (preferenze).

### 4.3 Interfaccia (frontend)

Un solo documento, componenti separati per responsabilità: `Ribbon`, `AccountTree`, `MessageTable`,
`ReadingPane`, `AssistantBar`, `AssistantCard`, `StatusBar`, `Composer`, `Settings`. Nessuna logica di
rete nell'interfaccia: tutto passa dai comandi Tauri.

---

## 5. Flussi

**Primo avvio** — scelta provider IMAP → credenziali salvate nel Keychain → sync cartelle → lista popolata.

**Sync** — sync iniziale delle intestazioni per cartella, corpo su richiesta, IDLE per l'arrivo di nuovi
messaggi; cache SQLite consultabile offline.

**Lettura** — apertura messaggio: corpo preso dalla cache o scaricato, HTML sanificato, risorse remote
bloccate di default (tracciatori) con pulsante "mostra immagini".

**Azione IA** — l'utente preme *Riassumi* (o *Rispondi*, *Estrai azioni*, *Traduci*) → il nucleo
costruisce il contesto (thread, ultimi N messaggi, limiti di token) → chiama il modello locale →
il risultato compare in una **scheda richiudibile** sotto il messaggio, con l'indicazione del modello
usato e della destinazione dei dati. Per le bozze di risposta, il testo va nel compositore, mai inviato
da solo.

---

## 6. IA: modelli, privacy, AI Act

- **Default: locale.** Sul MacBook l'endpoint è `llama-server` (Splash-M1, `thinkingcap-27b` Q4_K_M,
  ~30 tok/s, contesto ~118K) più `bge-m3` su `:8081` per gli embeddings; Ollama per modelli minori.
- **Cloud: solo su richiesta esplicita**, per singolo messaggio/azione, con etichetta visibile
  ("questo messaggio uscirà dal Mac"). La chiave OpenRouter sta nel Keychain, mai nel file di
  configurazione.
- **Log locale** di ogni invio verso il cloud (data, modello, azione, hash del messaggio inviato):
  serve al requisito di tracciabilità del lavoro AI Act dell'utente.
- **Nessuna telemetria** dell'applicazione.
- **Costi**: il cloud è a consumo; l'app mostra l'azione prima di eseguirla quando la destinazione è
  cloud.

---

## 7. Sicurezza

- Corpo delle mail **sempre sanificato** prima del rendering; script e tracciatori neutralizzati;
  immagini remote bloccate di default (comportamento opposto a Outlook, che carica tutto).
- Credenziali solo nel Keychain (crate `keyring`); nessuna password in chiaro su disco.
- Allegati salvati solo su azione esplicita dell'utente; nessuna esecuzione automatica.
- TLS obbligatorio (nessuna opzione "ignora certificato" nella v1).
- L'app non installa helper privilegiati, extension di sistema, né agenti in background.

---

## 8. Tema

Un solo set di variabili CSS (`design-tokens.css`); il tema è un attributo sul nodo radice. Tre modalità:
**Sistema** (segue macOS), **Chiaro**, **Scuro**; preferenza salvata in configurazione. Cambiare tema non
ricarica l'app e non richiede due interfacce.

---

## 9. Errori e stati

| Situazione | Comportamento |
|---|---|
| Nessuna rete / server IMAP irraggiungibile | lista dalla cache, banner "offline, ultimo aggiornamento …" |
| Autenticazione fallita | richiesta credenziali, nessun tentativo ripetuto all'infinito |
| Modello locale non in esecuzione | la barra IA lo dice e propone di avviarlo (o di usare il cloud, se autorizzato) |
| Risposta del modello oltre il budget di contesto | thread ridotto e avviso esplicito di cosa è stato escluso |
| Allegato troppo grande | avviso, nessun download automatico |

---

## 10. Test e verifica

- **Unit (Rust)**: parsing MIME, costruzione del contesto IA, sanitizzazione (HTML malevolo in ingresso),
  query di ricerca, riduzione dei thread.
- **Integrazione**: mock di server IMAP/SMTP e di endpoint LLM; test del ciclo sync → cache → apertura.
- **Confronto visivo**: la pagina mockup (`mockup.html`) resta come riferimento; ogni scostamento dal
  layout misurato è un test visivo (dimensioni delle bande, altezze di riga, colori delle superfici).
- **Prova manuale**: account reale dell'utente, con verifica che nessuna azione IA parta verso il cloud
  senza richiesta esplicita (controllo dei log).

---

## 11. Ambito v1 — CONFERMATO

Dentro la v1:
1. IMAP: connessione, sync cartelle, lista conversazioni, pannello di lettura, allegati in lettura.
2. Composizione e invio (SMTP), risposta e inoltro.
3. **Configurazione dell'account dall'interfaccia** (finestra Account come nel riferimento): campi
   IMAP/SMTP, porte, SSL, password nel Keychain. La casella di prova la sceglie e la imposta l'utente
   quando vuole — il codice non contiene nessun account predefinito.
4. Cache locale + ricerca full-text.
5. IA in lettura: riassumi thread, rispondi (bozza), estrai azioni/scadenze, traduci — modello locale.
6. IA in composizione: **risposta assistita al thread** (confermata) e **controllo prima dell'invio**
   (confermato: avvisa, non blocca).
7. Impostazioni: hub come nel riferimento + pannello **Assistente IA** (motore, modelli, privacy,
   registro delle richieste cloud, tono/lingua).
8. Tema chiaro/scuro/sistema; finestre conformi alle misure del riferimento.

Fuori dalla v1: calendario, contatti, notifiche di sistema, regole, firme multiple, PGP/S-MIME,
cartelle condivise, account multipli simultanei, invio di allegati.

---

## 12. Domande — stato

**Chiuse:**

1. **Ambito v1**: confermato (§11), con l'aggiunta della configurazione account dall'interfaccia.
2. **IA in composizione**: *Risposta assistita al thread* **e** *Controllo prima dell'invio* confermati.
   *Bozza da istruzione* e *Riscrivi/cambia tono* fuori dalla v1.
3. **Casella di prova**: la sceglie e la imposta l'utente dalla finestra **Account** dell'app. Nessun
   account o credenziale nel codice; la password entra solo nel Keychain.
4. **Configurazione reale nota** (dal suo screenshot, senza password): Esempio Host — `imaps.esempiohost.it:993` SSL,
   `smtps.esempiohost.it:465` SSL. Utile come riferimento di default nei campi, non come dato salvato.

**Ancora aperte (non bloccanti per il piano):**

5. **Accento chiaro** `#0078D7` (dedotto): confermato o da cambiare?
6. **Avvio automatico del modello locale**: l'app lo avvia da sola (impostazione nel pannello Assistente
   IA, prevista come attiva) o preferisci gestirlo tu?
7. **Lingua dell'interfaccia**: solo italiano o italiano + inglese?
8. **Windows**: fuori scope adesso (l'architettura Tauri lo consente) — confermato?

---

## 13. Riferimenti

- `design-tokens.css` — token dei due temi con provenienza di ogni valore.
- `mockup.html`, `mockup-scuro.png`, `mockup-chiaro.png` — ricostruzione a dimensione reale.
- `.superpowers/brainstorm/…/content/` — passaggi visivi del dialogo di design.
- Skill: `ui-reconstruction-from-reference-app`, `rea-hermes-integration`, `brainstorm-companion-hosting`.