# Mail AI Local

Client di posta per macOS con assistente IA. Interfaccia ispirata a Outlook, motore IA **in locale** per impostazione predefinita: i messaggi non escono dal computer se non lo decidi tu.

Tutto in italiano: interfaccia, commenti, messaggi di commit.

## Cos'è

Un'app desktop che parla **direttamente col tuo server IMAP/SMTP** — nessun servizio intermedio, nessun account su terze parti. La posta sta sul tuo computer, in un database SQLite locale con indice full-text.

Sopra la posta c'è un assistente che può riassumere un messaggio, proporre una risposta, estrarre le azioni da fare e tradurre. Per impostazione predefinita usa un modello **locale** (endpoint OpenAI-compatibile, per esempio un server sulla tua macchina); in alternativa può usare il cloud tramite OpenRouter, e in quel caso chiede il consenso prima di ogni invio e tiene un registro delle richieste.

## Come è fatto

| | |
|---|---|
| Interfaccia | JavaScript senza framework (`src/`, ~15.600 righe) |
| Kernel | Rust (`src-tauri/src/`, ~17.000 righe) |
| Shell desktop | Tauri 2 |
| Posta | `async-imap` (lettura), `lettre` (invio), TLS obbligatorio |
| Dati locali | SQLite + FTS5 per la ricerca |
| Segreti | Portachiavi di macOS (`keyring`) — **mai** in un file |
| Sanificazione | `ammonia` sui corpi HTML in ingresso |

Il kernel si occupa di rete, cache e sicurezza; l'interfaccia non tocca mai la rete direttamente e non maneggia mai una password: le vede il kernel, che le mette nel Portachiavi.

## Cosa fa

- Posta IMAP multi-casella, cartelle, conversazioni raggruppate, ricerca full-text
- Composizione con formati, firme multiple, allegati, invio programmato, controllo prima dell'invio
- Contatti, regole, categorie, inviti di riunione e agenda a elenco
- Assistente IA: riassunto, bozza di risposta, estrazione azioni, traduzione
- Lettura con immagini bloccate finché non dai il consenso, e corpo sanificato in un iframe isolato

## Cosa **non** fa

Dichiarato, non nascosto — le voci non disponibili sono indicate nel pannello invece di essere pulsanti muti:

- Exchange, cartelle delegate, Teams, Copilot
- Calendario a griglia con ricorrenze (c'è un'agenda a **elenco**)
- Risposte automatiche lato server, S/MIME
- Sincronizzazione push (IMAP IDLE): la sincronizzazione è a intervallo

## Requisiti

- macOS (testato su Apple Silicon)
- Rust e Node.js per compilare
- Un account di posta con IMAP e SMTP — per esempio il tuo provider, o una casella di prova

## Avvio

```bash
git clone https://github.com/fladnaG86/mail-ai-local.git
cd mail-ai-local
npm install
npm run tauri dev
```

La prima compilazione richiede qualche minuto. Alla prima apertura si apre da sé la finestra per configurare la casella: indirizzo, server di posta in arrivo e in uscita, password. La password va nel Portachiavi di macOS.

Per la build dell'app:

```bash
npm run tauri build    # firma ad-hoc, su qualsiasi Mac
npm run build:mac      # firma col certificato locale «Outlook AI Dev», se c'è
```

## Scaricare l'app già pronta

Ogni versione è compilata da GitHub Actions e pubblicata in [Releases](https://github.com/fladnaG86/mail-ai-local/releases) come `.dmg` universale (Apple Silicon e Intel). Installazione, primo avvio e pubblicazione di una nuova versione: [docs/installazione.md](docs/installazione.md).

## Assistente IA

**Locale (predefinito).** Serve un server OpenAI-compatibile in ascolto (per esempio `http://127.0.0.1:8000/v1`). L'endpoint e il nome del modello si scelgono in *Impostazioni → Assistente IA*. Nessun dato lascia il computer.

**Cloud (OpenRouter).** Si sceglie nello stesso pannello, e serve una chiave API da `openrouter.ai/keys`: si incolla nel campo «Chiave OpenRouter» e si salva nel Portachiavi. Con il cloud attivo, l'app chiede conferma prima di ogni invio e registra ogni richiesta (data, modello, azione e impronta SHA-256 del testo — **mai** il contenuto dei messaggi).

## Test

```bash
npm install                       # serve jsdom
node --test tests/*.mjs           # interfaccia
cargo test --manifest-path src-tauri/Cargo.toml   # kernel
```

Le prove dell'interfaccia girano alcune su funzioni pure e altre su un DOM vero (jsdom) con un kernel finto, perché la classe di difetti più insidiosa di questo progetto — schermate che si svuotano al ridisegno — non si vede senza un DOM.

## Struttura

```
src/               interfaccia (JS, nessun framework)
  views/           le schermate e i pannelli
src-tauri/src/     kernel Rust
  mail/            IMAP, SMTP, MIME
  ai/              client IA, contesto, registro
tests/             prove dell'interfaccia (node --test)
src-tauri/tests/   prove del kernel (cargo test)
docs/              guida all'uso e note di riferimento
```

## Licenza

MIT — vedi [LICENSE](LICENSE).

## Nota sui marchi

Progetto indipendente, non affiliato né approvato da Microsoft. «Outlook» è un marchio di Microsoft Corporation e qui è citato solo per descrivere a cosa si ispira l'interfaccia. Nessun codice, icona, font o risorsa di Microsoft è incluso: le uniche cose ricavate dall'app installata sono **dati** (etichette dei menu, colori misurati, ordine dei gruppi), come documentato in `docs/riferimento-outlook/`.
