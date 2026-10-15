# Piano di implementazione — Client di posta "Outlook + Assistente IA" (v1)

> **Per Hermes:** eseguire con la skill `subagent-driven-development` — un subagente per task, revisione in
> due fasi (aderenza alla spec, qualità del codice) prima di passare al task successivo.

**Obiettivo:** un'applicazione desktop macOS (Tauri 2, nucleo in Rust) che riproduce l'interfaccia di
Outlook misurata sul riferimento, legge la posta via IMAP, invia via SMTP, e offre quattro azioni IA in
lettura più risposta assistita e controllo pre-invio in composizione, con modello **locale di default**.

**Architettura:** finestra singola con webview di sistema; l'interfaccia consuma i token di
`design-tokens.css`; tutto ciò che tocca rete, credenziali, cache e modelli sta nel kernel Rust dietro
comandi Tauri tipizzati. Nessuna credenziale nel codice: la configurazione account la inserisce l'utente
dall'interfaccia e la password va nel Keychain di macOS.

**Stack:** Tauri 2 · Rust (tokio, async-imap, lettre, mail-parser, ammonia, rusqlite+FTS5, keyring,
reqwest, serde) · frontend HTML/CSS/JS senza framework (v1) · SQLite locale.

**Riferimenti:** `docs/superpowers/specs/2026-10-12-outlook-clone-ia-design.md`, `design-tokens.css`,
`mockup.html`, `mockup-compose.html`, `mockup-impostazioni.html`, i PNG misurati.

**Regola generale:** ogni task termina con test verdi e un commit. Se un task richiede più di 10 minuti,
va spezzato.

---

## Milestone 0 — Ambiente e scheletro

### Task 0.1: Installare la toolchain Rust sul MacBook

**Obiettivo:** rustc/cargo disponibili sul Mac (oggi assenti).

**File:** nessuno (modifica d'ambiente).

**Passi**

1. Sul Mac, via SSH: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
2. Ricaricare il PATH: `source "$HOME/.cargo/env"`

**Verifica**

```bash
rustc --version && cargo --version
```

Atteso: `rustc 1.8x.x` e `cargo 1.8x.x`. Se fallisce, verificare che Xcode CLT sia presente
(`xcode-select -p` → `/Applications/Xcode-beta.app/Contents/Developer`, già ok).

---

### Task 0.2: Creare il progetto Tauri e verificare che la finestra si apra

**Obiettivo:** scheletro Tauri 2 che compila e avvia una finestra vuota.

**File:**
- Crea: `src-tauri/` (dal template), `package.json`, `index.html`

**Passi**

1. Nella radice del progetto, sul Mac:
   `npm create tauri-app@latest . -- --template vanilla --manager npm --yes`
   (il template vanilla evita Svelte/React: in v1 l'interfaccia è HTML/CSS/JS puro)
2. `npm install`
3. Avviare e chiudere: `npm run tauri dev` (la prima compilazione Rust richiede qualche minuto)

**Verifica**

Atteso: finestra bianca intitolata come il progetto; `src-tauri/target/debug/` popolata.
Poi `git status` non deve mostrare `node_modules/` né `src-tauri/target/` → aggiungerli a `.gitignore`.

**5. Commit**

```bash
git add -A && git commit -m "chore: scheletro Tauri 2 (vanilla) sul progetto"
```

---

### Task 0.3: Impostare la finestra alle misure del riferimento

**Obiettivo:** la finestra principale nasce a 1728 × 988 pt di contenuto, come il riferimento.

**File:**
- Modifica: `src-tauri/tauri.conf.json`

**Passi**

1. Nel blocco `app.windows[0]` impostare `"width": 1728, "height": 988, "minWidth": 1100,
   "minHeight": 700, "titleBarStyle": "Transparent", "hiddenTitle": true`
2. Portare la finestra al contenuto reale (il riferimento non ha barra di sistema standard: i
   semafori sono disegnati dentro, come nel mockup)

**Verifica**

`npm run tauri dev` → la finestra misura 1728 × 988 pt e l'altezza del contenuto non è ridotta dalla
title bar di sistema.

**5. Commit:** `git commit -m "feat: finestra principale alle misure del riferimento"`

---

## Milestone 1 — Interfaccia statica fedele al riferimento

### Task 1.1: Portare i token di design nell'app

**Obiettivo:** `design-tokens.css` diventa la fonte unica dei colori dell'app.

**File:**
- Crea: `src/styles/design-tokens.css` (copia esatta di `design-tokens.css` di progetto)
- Modifica: `index.html` (link al foglio di stile)

**Passi**

1. Copiare il file dei token.
2. In `index.html`, `<link rel="stylesheet" href="src/styles/design-tokens.css">` e impostare
   `data-theme="dark"` sull'elemento `<html>`.

**Verifica:** `npm run tauri dev`, in console `getComputedStyle(document.documentElement).getPropertyValue('--window-bg')`
restituisce `#1E1E1E`.

**5. Commit:** `git commit -m "feat: token di design condivisi con l'app"`

---

### Task 1.2: Gabbia del layout con le misure misurate

**Obiettivo:** struttura a bande con le altezze esatte del riferimento.

**File:**
- Crea: `src/styles/layout.css`
- Modifica: `index.html` (struttura: titlebar, ribbon, corpo con sidebar+lista+lettura, status bar)

**Passi**

1. Title bar 28 pt, ribbon 108 pt, intestazione colonne lista 23 pt, righe 27 pt, barra informativa
   20 pt, barra di stato 26 pt, sidebar 234 pt.
2. Ogni banda usa una variabile dei token (`--chrome-bg`, `--header`, `--rowsep`, …).

**Verifica:** con gli strumenti di sviluppo, `#titlebar` misura 28 px di altezza, `#ribbon` 108 px,
`#sidebar` 234 px di larghezza, ogni riga della lista 27 px. Confronto a occhio con `mockup-scuro.png`.

**5. Commit:** `git commit -m "feat: gabbia di layout alle misure misurate"`

---

### Task 1.3: Interruttore di tema Sistema / Chiaro / Scuro con persistenza

**Obiettivo:** il tema è un attributo sulla radice, con la preferenza salvata.

**File:**
- Crea: `src/theme.js`
- Crea: `src-tauri/src/config.rs` (comando `get_config` / `set_config`)
- Test: `src-tauri/tests/config_test.rs`

**Passi (TDD)**

1. **Test che fallisce** (`src-tauri/tests/config_test.rs`):

```rust
#[test]
fn theme_defaults_to_system_and_persists_choice() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = app_config::Config::load_from(dir.path()).unwrap();
    assert_eq!(cfg.theme, "system");
    app_config::Config::set_theme(dir.path(), "dark").unwrap();
    let cfg2 = app_config::Config::load_from(dir.path()).unwrap();
    assert_eq!(cfg2.theme, "dark");
}
```

2. Eseguire: `cargo test --test config_test` → atteso: FAIL (`app_config` non esiste).
3. Implementare `src-tauri/src/config.rs` con `Config { theme: String, .. }`, `load_from` (file
   `config.json`, default `system` se assente) e `set_theme` (scrittura atomica: file temporaneo + rename).
4. Eseguire: `cargo test --test config_test` → atteso: PASS.
5. In `src/theme.js`: leggere il tema, applicare `document.documentElement.dataset.theme`, e con
   modalità `system` seguire `window.matchMedia('(prefers-color-scheme: dark)')`.
6. Verificare a mano: cambiare tema nell'app, chiudere, riaprire → il tema resta quello scelto.

**7. Commit:** `git commit -m "feat: tema sistema/chiaro/scuro persistente"`

---

### Task 1.4: Le tre schermate statiche fedeli ai mockup

**Obiettivo:** finestra principale, finestra nuovo messaggio e finestre impostazioni rese fedelmente,
prima di collegare qualsiasi dato.

**File:**
- Crea: `src/views/main.js`, `src/views/compose.js`, `src/views/settings.js`
- Crea: `src/styles/views.css`

**Passi**

1. Portare in componenti il markup e le misure già validati in `mockup.html`, `mockup-compose.html`,
   `mockup-impostazioni.html` (stessi valori, stessa nomenclatura).
2. Lasciare l'interfaccia alimentata da dati finti (array in memoria) in questa fase.

**Verifica:** catturare un PNG dell'app avviata e affiancarlo al mockup: le bande e i colori devono
coincidere; nessun elemento tagliato.

**5. Commit:** `git commit -m "feat: le tre schermate statiche fedeli ai mockup misurati"`

---

## Milestone 2 — Configurazione account e segreti

### Task 2.1: Wrapper del Keychain (crate `keyring`)

**File:** Crea `src-tauri/src/secrets.rs` · Test `src-tauri/tests/secrets_test.rs`

**Passi (TDD)**

1. **Test che fallisce:**

```rust
#[test]
fn secret_never_lands_in_config_file() {
    let dir = tempfile::tempdir().unwrap();
    let store = secrets::Store::in_memory_for_tests();
    store.set("acct:mario", "s3gr3t0").unwrap();
    app_config::Config::save_account(dir.path(), "mario", "imaps.esempiohost.it", 993).unwrap();
    let raw = std::fs::read_to_string(dir.path().join("config.json")).unwrap();
    assert!(!raw.contains("s3gr3t0"), "la password non deve finire nel file di configurazione");
}
```

2. Eseguire: `cargo test --test secrets_test` → FAIL (`secrets` non esiste).
3. Implementare `secrets.rs`: su macOS `keyring::Entry::new("outlook-ai-clone", &account_id)`;
   per i test, un backend in memoria dietro `#[cfg(test)]`.
4. Eseguire → PASS.

**5. Commit:** `git commit -m "feat: password IMAP solo nel Keychain, mai su disco"`

---

### Task 2.2: Modulo configurazione account (senza password)

**File:** Modifica `src-tauri/src/config.rs` · Test `src-tauri/tests/config_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** `save_account` + `load_accounts` restituiscono host/porta/SSL/nome utente e
   non contengono alcun campo password.
2. Implementare `Account { id, description, full_name, email, username, imap_host, imap_port,
   imap_ssl, smtp_host, smtp_port, smtp_ssl }`.
3. Eseguire → PASS.

**4. Commit:** `git commit -m "feat: configurazione account persistente (host, porte, SSL)"`

---

### Task 2.3: Finestra Account collegata alla configurazione

**File:** Modifica `src/views/settings.js`, `src-tauri/src/main.rs` (comandi `account_list`,
`account_save`, `account_test_connection`)

**Passi**

1. Collegare i campi della finestra Account (Descrizione, Nome completo, Email, Nome utente, Password,
   IMAP host/porta/SSL, SMTP host/porta/SSL) alla configurazione e al Keychain.
2. Nei campi **vuoti** mostrare i valori di riferimento in grigio (`imaps.esempiohost.it:993`,
   `smtps.esempiohost.it:465`) come suggerimento, senza salvarli finché l'utente non li conferma.
3. Il pulsante "Avanzate…" resta disabilitato con la nota "non disponibile nella v1".

**Verifica:** inserire i dati di un account di prova → chiudere e riaprire l'app → i campi sono
ricostruiti dal file di configurazione e la password risulta presente nel Keychain
(`security find-generic-password -s outlook-ai-clone`), non nel file.

**4. Commit:** `git commit -m "feat: composizione account dall'interfaccia, password nel Keychain"`

---

## Milestone 3 — IMAP e cache locale

### Task 3.1: Astrazione della sorgente di posta (per poter testare senza rete)

**File:** Crea `src-tauri/src/mail/mod.rs`, `src-tauri/src/mail/traits.rs`

**Passi**

1. Definire `trait MailSource { async fn folders(&self) -> Result<Vec<Folder>>; async fn headers(&self,
   folder: &str, limit: usize) -> Result<Vec<MessageHeader>>; async fn body(&self, uid: &str) -> Result<Vec<u8>>; }`.
2. Implementare `FakeSource` dietro `#[cfg(test)]` con cartelle e messaggi fissi.

**Verifica:** `cargo test` compila ed esegue i test esistenti senza toccare la rete.

**3. Commit:** `git commit -m "refactor: interfaccia MailSource e sorgente finta per i test"`

---

### Task 3.2: Client IMAP reale (async-imap + TLS)

**File:** Crea `src-tauri/src/mail/imap.rs` · Test `src-tauri/tests/imap_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** RISOLUZIONE del nome e costruzione del client per `imaps.esempiohost.it:993`
   (nessuna connessione: si verifica solo che la configurazione TLS/porta sia quella attesa).
2. Implementare la connessione TLS obbligatoria (nessuna opzione "ignora certificato"), `LOGIN` con
   username e password dal Keychain.
3. Test manuale (non in CI): con un account di prova configurato dall'utente, `folders()` restituisce
   INBOX e le cartelle visibili con i contatori corretti.

**4. Commit:** `git commit -m "feat: connessione IMAP TLS e lettura cartelle"`

---

### Task 3.3: Cache SQLite con ricerca full-text

**File:** Crea `src-tauri/src/store.rs` · Test `src-tauri/tests/store_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** inserire due intestazioni, cercare "preventivo" e ottenere una sola riga.
2. Implementare lo schema:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, account TEXT, folder TEXT, uid TEXT, message_id TEXT,
  subject TEXT, sender TEXT, recipients TEXT, date INTEGER, seen INTEGER DEFAULT 0,
  has_attachments INTEGER DEFAULT 0, thread_key TEXT, body_text TEXT, body_html TEXT,
  UNIQUE(account, folder, uid));
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, sender, body_text,
  content='messages', content_rowid='id');
```

3. Eseguire → PASS. Verificare che la ricerca restituisca risultati senza testo nel corpo scaricato
   (solo intestazioni) e con esso dopo il fetch.

**4. Commit:** `git commit -m "feat: cache locale SQLite con ricerca full-text"`

---

### Task 3.4: Sincronizzazione (intestazioni, poi corpi su richiesta)

**File:** Crea `src-tauri/src/mail/sync.rs` · Test `src-tauri/tests/sync_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** con `FakeSource`, `sync_folder("INBOX")` inserisce N intestazioni e un
   secondo sync non duplica nulla (idempotenza sull'unicità `(account, folder, uid)`).
2. Implementare il sync incrementale per `UID` più alto già visto.
3. Emettere l'evento Tauri `mail://updated` a fine sync perché la lista si aggiorni.

**4. Commit:** `git commit -m "feat: sincronizzazione incrementale con cache idempotente"`

---

### Task 3.5: Lista conversazioni collegata ai dati reali

**File:** Modifica `src/views/main.js` (lista), `src-tauri/src/main.rs` (comando `mail_list`)

**Passi**

1. Sostituire i dati finti con `mail_list(folder, offset, limit)`.
2. Colonne e gruppi come nel riferimento: Mittente · Oggetto · Data ricezione · Categoria, riga di
   gruppo "Oggi" / "Ieri" / "Questa settimana", riga selezionata con il colore del tema attivo.

**Verifica:** con l'account di prova, la lista mostra i messaggi reali con le date formattate come nel
riferimento (`lun 12/10/26, 17:26`).

**3. Commit:** `git commit -m "feat: lista conversazioni sulla cache locale"`

---

## Milestone 4 — Lettura sicura dei messaggi

### Task 4.1: Sanificazione dell'HTML in ingresso

**File:** Crea `src-tauri/src/mail/sanitize.rs` · Test `src-tauri/tests/sanitize_test.rs`

**Passi (TDD)**

1. **Test che fallisce** (quattro casi):

```rust
#[test] fn removes_script_tags()       { assert!(!clean("<p>a</p><script>alert(1)</script>").contains("script")); }
#[test] fn removes_event_handlers()    { assert!(!clean("<img src=x onerror=alert(1)>").contains("onerror")); }
#[test] fn blocks_remote_images()      { assert!(clean("<img src='http://t.example/p.gif'>").contains("bloccata")); }
#[test] fn keeps_text_and_links()      { let h = clean("<a href='https://ok.it'>x</a>"); assert!(h.contains("https://ok.it") && h.contains(">x<")); }
```

2. Eseguire: `cargo test --test sanitize_test` → FAIL.
3. Implementare con `ammonia`: niente script/iframe/oggetti, niente `on*`, `javascript:` eliminato,
   immagini remote sostituite da un segnaposto "immagine esterna bloccata", collegamenti con
   `rel="noopener noreferrer"`.
4. Eseguire → PASS.

**5. Commit:** `git commit -m "feat: sanificazione HTML delle mail e blocco immagini remote"`

---

### Task 4.2: Pannello di lettura sui dati reali

**File:** Modifica `src/views/main.js` (pannello), `src-tauri/src/main.rs` (comandi `mail_body`,
`mail_set_seen`)

**Passi**

1. Alla selezione: corpo dalla cache se presente, altrimenti fetch e inserimento in cache.
2. Rendere l'HTML sanificato dentro un `<iframe sandbox>` senza `allow-scripts`.
3. Pulsante "Mostra immagini" che ricarica il corpo consentendo le immagini remote solo per quel
   messaggio (scelta non persistente).
4. Intestazione del messaggio come nel riferimento: oggetto 22 pt, avatar con iniziali, mittente,
   destinatari, data a destra, barra informativa se il messaggio è contrassegnato.

**Verifica:** aprire una mail con immagini → le immagini non partono finché non si preme il pulsante;
con i log di rete aperti non si vede traffico verso il mittente prima di quel clic.

**5. Commit:** `git commit -m "feat: pannello di lettura con HTML sanificato"`

---

### Task 4.3: Allegati in lettura

**File:** Modifica `src-tauri/src/mail/mod.rs` (parsing `mail-parser`), `src/views/main.js`

**Passi**

1. Elencare gli allegati (nome, tipo, dimensione) sotto il corpo.
2. Il salvataggio avviene solo su clic, con dialogo di scelta destinazione.

**Verifica:** un messaggio con un PDF mostra l'allegato; prima del clic nessun file compare su disco.

**3. Commit:** `git commit -m "feat: elenco e salvataggio allegati su richiesta"`

---

## Milestone 5 — Composizione e invio

### Task 5.1: Finestra di composizione collegata ai dati

**File:** Modifica `src/views/compose.js`, `src-tauri/src/main.rs` (comando `mail_send`)

**Passi (TDD)**

1. **Test che fallisce:** la costruzione del messaggio MIME da parte di `mail::build_message` produce
   `To`/`Cc`/`Subject` corretti e una parte testo con il corpo — testato senza inviare.
2. Implementare la costruzione con `lettre` e l'invio SMTP con STARTTLS/SSL come da configurazione.
3. Collegare la finestra: A:, Cc:, Oggetto:, corpo, firma predefinita dal testo dell'utente.

**4. Verifica:** inviare un messaggio a se stessi con l'account di prova → compare in INBOX; il
messaggio risulta in Posta inviata solo se l'account lo richiede (v1: nessuna copia locale automatica,
nota visibile).

**5. Commit:** `git commit -m "feat: composizione e invio SMTP"`

---

### Task 5.2: Risposta e inoltro

**File:** Modifica `src/views/compose.js`

**Passi**

1. "Rispondi" precompila il destinatario e cita il messaggio originale; "Rispondi a tutti" aggiunge i
   destinatari in copia; "Inoltra" allega il messaggio originale come testo.

**Verifica:** le tre azioni precompilano i campi corretti su un messaggio di prova.

**3. Commit:** `git commit -m "feat: risposta, risposta a tutti e inoltro"`

---

## Milestone 6 — Assistente IA in lettura

### Task 6.1: Costruzione del contesto del thread con budget di token

**File:** Crea `src-tauri/src/ai/context.rs` · Test `src-tauri/tests/context_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** dato un thread di 50 messaggi con budget 8000 token, il contesto costruito
   contiene i messaggi più recenti, l'oggetto, i mittenti, e riporta esplicitamente quanti messaggi
   sono stati esclusi.
2. Implementare la stima dei token (caratteri/4 con margine) e la selezione dal più recente.
3. Eseguire → PASS.

**4. Commit:** `git commit -m "feat: contesto del thread con budget di token ed esclusioni dichiarate"`

---

### Task 6.2: Client dei modelli (locale e cloud) con la stessa interfaccia

**File:** Crea `src-tauri/src/ai/client.rs` · Test `src-tauri/tests/ai_client_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** con un server HTTP finto (crate `wiremock` o `httptest`), `complete()` invia
   una richiesta OpenAI-compatibile e restituisce il testo; `provider = "cloud"` richiede che
   `consent = true`, altrimenti restituisce `Err(ConsentRequired)` **senza effettuare la chiamata**.
2. Implementare `reqwest` verso `http://127.0.0.1:8080/v1/chat/completions` (locale) e verso
   OpenRouter (chiave dal Keychain).
3. Eseguire → PASS.

**4. Commit:** `git commit -m "feat: client IA locale/cloud con consenso obbligatorio per il cloud"`

---

### Task 6.3: Registro delle richieste inviate al cloud

**File:** Modifica `src-tauri/src/store.rs` · Test `src-tauri/tests/audit_test.rs`

**Passi (TDD)**

1. **Test che fallisce:** dopo una chiamata cloud autorizzata, il registro contiene una riga con data,
   modello, azione e SHA-256 del testo inviato — **non** il testo.
2. Eseguire → PASS.

**3. Commit:** `git commit -m "feat: registro di tracciabilità per le richieste cloud"`

---

### Task 6.4: Le quattro azioni in lettura e la barra dell'Assistente

**File:** Crea `src-tauri/src/ai/actions.rs`, modifica `src/views/main.js`

**Passi**

1. Prompt versionati per: riassumi thread (con fonti), bozza risposta, estrai azioni e scadenze
   (elenco con data e riferimento al messaggio), traduci.
2. Barra dell'Assistente come nel mockup approvato: pulsanti, selettore modello, indicazione della
   destinazione dei dati; scheda risultato richiudibile sotto il messaggio con le fonti.

**Verifica:** con `llama-server` attivo, "Riassumi" su un thread di prova produce una scheda con il
riassunto e l'elenco dei messaggi usati; con il modello spento, la barra lo dichiara e propone di
avviarlo (nessun errore grezzo).

**3. Commit:** `git commit -m "feat: azioni IA in lettura e barra dell'Assistente"`

---

## Milestone 7 — IA in composizione

### Task 7.1: Risposta assistita al thread

**File:** Modifica `src/views/compose.js`, `src-tauri/src/ai/actions.rs`

**Passi**

1. "Rispondi" → il contesto del thread viene costruito e passato al modello con il tono configurato;
   la bozza appare nel corpo, il cursore va in cima, nulla viene inviato.
2. Etichetta sopra il corpo: "bozza generata in locale · rileggila prima di inviare".

**Verifica:** su un thread di prova, la bozza contiene i riferimenti a chi ha chiesto cosa e alle date
citate; il pulsante Invia non è mai premuto automaticamente.

**3. Commit:** `git commit -m "feat: risposta assistita al thread"`

---

### Task 7.2: Controllo prima dell'invio

**File:** Crea `src-tauri/src/ai/presend.rs` · Test `src-tauri/tests/presend_test.rs`

**Passi (TDD)**

1. **Test che fallisce** (controlli deterministici, senza modello):

```rust
#[test] fn flags_missing_attachment() {
    let w = check("in allegato trovi il preventivo", &[], false);
    assert!(w.iter().any(|w| w.kind == Kind::MissingAttachment));
}
#[test] fn flags_sensitive_data() {
    let w = check("la password è Esempio2026!", &[], true);
    assert!(w.iter().any(|w| w.kind == Kind::SensitiveData));
}
#[test] fn never_blocks() { assert!(!check("", &[], true).blocking); }
```

2. Implementare i controlli: allegato citato ma assente, troppi destinatari, possibile dato sensibile
   (password, IBAN, codici), tono (via modello locale, se attivo).
3. Eseguire → PASS.

**4. Composizione:** la barra "Controllo prima dell'invio" mostra gli avvisi; il pulsante Invia resta
sempre attivo.

**5. Commit:** `git commit -m "feat: controllo prima dell'invio che avvisa ma non blocca"`

---

## Milestone 8 — Impostazioni

### Task 8.1: Hub delle impostazioni fedele al mockup

**File:** Modifica `src/views/settings.js`

**Passi**

1. Gruppi e riquadri come nel riferimento, con la voce **Assistente IA** nel gruppo Posta elettronica.
2. Le voci non implementate (Calendario, Contatti, Categorie, …) restano visibili ma dichiarano
   "non disponibile nella v1".

**Verifica:** confronto con `impostazioni-scuro.png` — griglia, separatori e altezze coincidono.

**3. Commit:** `git commit -m "feat: hub delle impostazioni fedele al riferimento"`

---

### Task 8.2: Pannello Assistente IA

**File:** Crea `src/views/ai-settings.js`

**Passi**

1. Motore (locale consigliato / cloud), endpoint, modello locale, modello cloud, conferma prima di
   ogni invio al cloud (attiva), registro delle richieste (con collegamento al registro), avvio
   automatico del modello locale, tono e lingua delle bozze.
2. Salvataggio nella configurazione; la chiave OpenRouter va nel Keychain, mai nel file.

**Verifica:** disattivare "chiedi conferma prima di ogni invio al cloud" → le richieste cloud partono
senza dialogo; riattivarla → ricompare il dialogo. In entrambi i casi il registro cresce.

**3. Commit:** `git commit -m "feat: pannello Assistente IA"`

---

## Milestone 9 — Rifinitura e pacchetto

### Task 9.1: Stati di errore e assenza di rete

**File:** Modifica `src/views/main.js`, `src-tauri/src/mail/sync.rs`

**Passi**

1. Nessuna rete → la lista resta dalla cache e compare il banner "offline · ultimo aggiornamento …".
2. Autenticazione fallita → richiesta credenziali, nessun ciclo di tentativi.

**Verifica:** disconnettere la rete e riaprire l'app: la lista è popolata, il banner è visibile, nessun
errore non gestito in console.

**3. Commit:** `git commit -m "feat: stati di errore e modalità offline"`

---

### Task 9.2: Barra di stato e dati reali

**File:** Modifica `src/views/main.js`

**Passi**

1. "Elementi: N" = messaggi nella cartella corrente; a destra "Tutte le cartelle sono aggiornate." e
   "Connesso a: <account>"; in caso di errore, la dicitura cambia di conseguenza.

**Verifica:** i valori corrispondono a quelli mostrati dal riferimento nella stessa cartella.

**3. Commit:** `git commit -m "feat: barra di stato con dati reali"`

---

### Task 9.3: Pacchetto `.app` e prova finale

**File:** nessuno (build).

**Passi**

1. `npm run tauri build` sul Mac.
2. Aprire `src-tauri/target/release/bundle/macos/Outlook AI.app`.
3. Prova completa con l'account configurato dall'utente: sync, lettura, risposta assistita, controllo
   pre-invio, invio, tema chiaro/scuro, riavvio (credenziali e tema persistenti).

**Verifica:** l'app si apre dal Finder senza terminale; nessuna richiesta di rete verso servizi terzi
all'avvio (verificabile con Little Snitch o `lsof -i`).

**4. Commit:** `git commit -m "chore: pacchetto app macOS per la prova completa"`

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| `async-imap` non gestisce alcuni server (cartelle non standard, IDLE instabile) | la trait `MailSource` isola il client; IDLE è opzionale con fallback al polling |
| Rendering HTML delle mail molto diverse fra loro | sanificazione stretta + iframe sandbox; si accetta un rendering più povero di Outlook |
| Modello locale lento su thread lunghi | budget di token, riassunti progressivi, indicazione chiara delle esclusioni |
| Firma/nome utente su build non firmata (Gatekeeper) | uso locale: nessuna notarizzazione nella v1 |

## Consegna

A piano completato: repository con token, viste, kernel Rust testato, e un `.app` funzionante; la spec e
i mockup restano come riferimento per ogni scostamento.

---

## Stato di avanzamento

| Milestone | Stato | Note |
|---|---|---|
| 0 · Ambiente e scheletro | **fatto** | rustup 1.99 sul Mac; Tauri 2.12.3; finestra 1728 × 988 pt; CSP ristretta; crate `outlook-ai` |
| 1 · Interfaccia fedele | **fatto** | token misurati come variabili, shell con ribbon/sidebar/lista/lettura/barra di stato, tema su attributo radice |
| 2 · Configurazione e segreti | **fatto** | `config.rs`, `secrets.rs` (Keychain), comandi `get_config`/`set_config`/`account_save`/`account_list` |
| 3 · IMAP e cache | **fatto** | `store.rs` (FTS5 + trigger), trait `MailSource` + sorgente finta, client IMAP TLS, sync incrementale, lista collegata alla cache in Tauri |
| 4 · Lettura sicura | **fatto** | sanificazione (verificata con sonda avversariale sui 12 vettori), corpo e allegati MIME, lettura in iframe `sandbox` senza script, immagini remote bloccate con pulsante "Mostra immagini" |
| 5 · Composizione e invio | **fatto** | `send.rs` (MIME con `lettre`, SMTP con TLS, password dal Keychain), finestra di composizione fedele a §2.4, risposta/risposta a tutti/inoltro con citazione |
| 6 · IA in lettura (motore) | **fatto** | `ai/context.rs` (budget di token, esclusioni dichiarate), `ai/client.rs` (locale/cloud, **consenso obbligatorio prima di ogni chiamata**), `ai/audit.rs` (hash e metadati, mai il testo), comando `ai_azione` |
| 6.4–7 · IA nell'interfaccia | **fatto** | barra dell'Assistente con le quattro azioni e selettore locale/cloud, scheda del risultato con fonti ed esclusioni, bozza di risposta assistita, **controllo pre-invio** (avvisi deterministici + tono opzionale, non blocca mai) |
| 8 · Impostazioni | **fatto** | hub fedele a §2.5 (992 × 372) e pannello **Assistente IA** (motore, endpoint/modelli, privacy con consenso e registro, tono, lingue, avvio del modello locale, firma del mittente); comandi `impostazioni_leggi`/`impostazioni_salva`/`registro_ia`/`assistente_avvia`; firma spostata da `localStorage` a `config.json` |
| 9 · Pacchetto e prova | **fatto** | build di release in **2m 01s**: `Outlook AI.app` (7,9 MB, arm64, ad-hoc signed, `it.esempio.outlookai` 0.1.0) in `src-tauri/target/release/bundle/macos/`. Il passo DMG è disattivato (`bundle.targets = ["app"]`) perché `bundle_dmg.sh` richiede una sessione grafica; si riattiva con `"all"` quando serve un DMG da distribuire. La prova end-to-end con la casella dell'utente resta da fare (password solo nel Keychain) |

Test automatici: **83 verdi** al termine delle impostazioni (`cargo test` sul Mac: 72 + 5 in `config_test.rs`
+ 5 in `impostazioni_test.rs` + 1 sulla lingua delle risposte nei prompt), più **25 test JS** (`node --test`):
5 su `assistant.js`, 6 sulla composizione, 7 sulle impostazioni, 7 sulla finestra Account.

### Chiusura in revisione finale

- **Finestra Account mancante**: il comando `account_save` esisteva dal kernel ma nessuna schermata lo
  chiamava, quindi l'app non poteva connettersi a una casella — contro il requisito dell'utente
  ("la casella la imposto io dal menù Account"). Implementata in `src/views/account.js` fedele a §2.5
  (738 × 742 pt, elenco a sinistra 200 pt, modulo a destra), collegata a `account_save` (password solo nel
  Keychain) e a `mail_sync` per la riga "Sincronizza ora", che è anche la prima prova reale delle
  credenziali. Delta dichiarati: `−` (elimina) e "Altre opzioni…" disattivati perché il kernel non ha
  ancora i comandi; i valori Esempio Host restano suggerimenti in grigio finché l'utente non li conferma.

### Scostamenti registrati

- **`MailSource::body(folder, uid)`** — la firma originale prevedeva solo `uid`, il che costringeva a
  selezionare INBOX; corretto nella Milestone 4.
- **`has_attachments`** — sempre falso nella Milestone 3 (non si leggeva la struttura MIME); corretto
  nella Milestone 4.
- **`folders()`** usa `EXAMINE` + `SEARCH UNSEEN` per ogni cartella, perché `async-imap` non espone
  `STATUS`. Su una casella grande (l'utente ha cartelle da 10.621 e 2.857 elementi) sono tante andate e
  ritorni: da rivedere con un `STATUS` inviato come comando grezzo se l'apertura risulta lenta.
- **Backend in memoria dei segreti** compilato sempre (non dietro `cfg(test)`), perché i test di
  integrazione vedono la libreria senza `cfg(test)`: funzione `in_memory_for_tests()`, non raggiungibile
  dai comandi IPC. Da stringere con un feature flag.
- I task 3.2 e 3.4 sono finiti in un commit unico (i comandi IPC richiedono entrambi i moduli per
  compilare).
- **Fedeltà**: i bordi dei campi della composizione usavano `--btn-border` invece del `#353535` misurato;
  corretto introducendo `--campo-bordo`/`--campo-focus` (misurati) nei token.
- **Fedeltà**: la finestra di composizione aveva una barra in fondo con i pulsanti "Invia" e "Chiudi",
  che il riferimento non ha. Rimossa: l'invio è la voce "Invia" del ribbon, la chiusura è Esc o ⌘W, e
  l'invio da tastiera è ⌘↩. La nota sulla copia in Posta inviata resta come riga discreta in coda.
- **Firma del mittente** spostata in `config.json` (`preferenze.firmaDelMittente`) nella Milestone 8:
  `compose.js` non usa più `localStorage` e legge la firma dalla configurazione caricata all'avvio
  (`impostazioni_leggi`), mantenendo `firmaConfigurata()`/`impostaFirma()` come interfaccia pubblica.
- **Invio SMTP bloccante** dentro il comando asincrono: da spostare su `tokio::task::spawn_blocking`
  quando si tocca `send.rs` (non blocca l'app oggi, ma occupa un worker del runtime).
- L'invio reale non è collaudato con un account: i test coprono costruzione MIME, validazione e citazione
  senza rete. La prova end-to-end la fa l'utente con la sua casella (Milestone 9).
- **Motore locale verificato**: Splash-M1 serve un'API OpenAI-compatibile su `http://127.0.0.1:8000/v1`
  (`/v1/chat/completions`, `/v1/models`), quindi l'endpoint locale predefinito è 8000 e non serve alcun
  adattatore. `bge-m3` (embeddings) sta su 8081 e Ollama su 11434, entrambi attivi sul Mac.
- **Threading assente**: `thread_key` non viene popolato dal sync, quindi il contesto del thread oggi si
  riduce al messaggio selezionato (fallback documentato nel codice). Il threading vero è un lavoro a sé.
- **`ai_azione` per "traduci"**: la lingua è ora presa dalle preferenze (`linguaTraduzione`, default
  inglese) come le altre impostazioni dell'assistente.
- **Lingua delle risposte**: salvata ed esposta nel pannello (`linguaRisposte`, default italiano), ma i
  template dei prompt sono italiani e vivono in `ai/mod.rs`, fuori dal perimetro di questa milestone:
  il valore è registrato in `config.json` e non entra ancora nel prompt. Da collegare quando si rivedono
  i template.
- **Registro IA**: annota la richiesta cloud quando il testo è effettivamente uscito (anche con risposta
  HTTP di errore), non quando il trasporto fallisce prima di inviare — scelta motivata nel codice.
- **Fedeltà (interfaccia IA)**: la scheda del risultato veniva inserita in cima al pannello di lettura,
  sopra l'oggetto; spostata sotto l'intestazione del messaggio, sopra il corpo, come nel mockup approvato.
- **Fedeltà (pannello di lettura)**: era comparsa una riga di pulsanti "Rispondi / Rispondi a tutti /
  Inoltra" dentro il pannello, che il riferimento non ha (le risposte stanno nel ribbon): rimossa.
- Nel percorso browser la barra non usa il modello reale; l'aggancio `?view=assistente` mostra una scheda
  simulata per le prove visive. La chiamata vera a `ai_azione` va provata sul Mac con Splash-M1 avviato.
- **Controllo pre-invio**: il modulo sta in `src-tauri/src/presend.rs` (non `ai/presend.rs`) perché `ai/*`
  era fuori dal perimetro di quel subagente; i nomi sono `controlla()`, `Tipo`, `Gravita`, `puo_inviare()`.
- **Controllo Ccn omesso**: la v1 non ha campo Ccn e `mail_invia` non ha parametro bcc, quindi il controllo
  "molti destinatari con copia nascosta" non ha senso finché non esiste il campo.
- **Tono**: la preferenza è esposta nel pannello impostazioni (`controlloTonoAttivo`, spenta di default)
  e nella stessa sede si scelgono tono delle bozze e lingue; il controllo del tono usa sempre e solo il
  modello locale, mai il cloud.
- **Impostazioni (Milestone 8)** — scelte e scostamenti:
  - l'endpoint locale predefinito resta `http://127.0.0.1:8000/v1` (l'endpoint reale di Splash-M1
    verificato), mentre il mockup mostra `8080`: il valore del mockup non è quello del motore.
  - "Registra le richieste inviate al cloud" è **attivo di default** come nel mockup; se l'utente lo
    spegne, il registro non cresce più: la tracciabilità resta la scelta predefinita, non un obbligo
    che l'utente non può disfare.
  - spegnendo "Chiedi conferma prima di ogni invio al cloud" il dialogo non compare più, ma il kernel
    riceve comunque `consensoCloud: true`: la conferma è pre-autorizzata, non rimossa a metà.
  - l'avvio del modello locale usa il comando configurato in `config.json` (`comandoAvvioLocale`,
    default `open -a Splash-M1`), con timeout di 15 s e un esito in italiano che, se fallisce, dice di
    avviarlo a mano.
  - le caselle di testo delle impostazioni salvano su `change` (blur o Invio), non a ogni tasto: il file
    non si riscrive a metà parola. Gli interruttori e i selettori salvano subito.
  - l'hub delle impostazioni si apre col "?" della barra titolo e con ⌘, (la finestra Account del
    riferimento non è collegata: il riquadro lo dichiara). Nel percorso browser restano `?view=impostazioni`
    e `?view=assistente-ia`.
  - il registro mostra a schermo l'impronta **abbreviata** a 12 caratteri; l'hash completo resta nel
    database (il valore tecnico è intatto, quello a schermo serve a riconoscere la riga).
---

## Blocchi di completamento (richiesta: "rendere funzionante tutto il resto")

Obiettivo: portare a funzionamento le voci di interfaccia oggi presenti ma inerte, replicando il
**comportamento** dell'app di riferimento sopra protocolli standard. Non si copiano codice, icone o
immagini del fornitore: si riproducono layout, etichette e comportamento osservabile, e per le funzioni
legate a servizi Microsoft (regole lato server, riunioni Teams, Copilot) si realizza l'equivalente
locale o via IMAP, dichiarandolo.

| Blocco | Contenuto | Stato |
|---|---|---|
| A | Operazioni sui messaggi: letto/da leggere, contrassegna, completato, categorie, elimina, archivia, sposta, indesiderato, elenco cartelle, filtra posta elettronica, invia e ricevi | **fatto** (99 test Rust, 39 JS) |
| B | Ricerca nel campo "Cerca" sulla cache FTS5 (l'indice esiste già) | **fatto** (comando `mail_cerca`: prefissi `da:`, `oggetto:`, `con:allegato`, `non:letto`; ripiego per sottostringa dichiarato in `nota`; 111 test Rust, 55 JS) |
| C | Composizione: allegati in invio, tabella, immagine da file, inserisci collegamento, ritaglia | **fatto** (124 test Rust, 63 JS) |
| D | Impostazioni che governano il comportamento: Lettura, Composizione, Tipi di carattere, Correzione automatica, Ortografia, Firme, Posta indesiderata, Privacy | **fatto** (Lettura, Composizione, Tipi di carattere, Correzione automatica, Ortografia, Firme, Posta indesiderata, Privacy, Generale con svuota cache; 144 test Rust, 91 JS) |
| E | Notifiche di sistema e suoni | **fatto** (plugin ufficiale `tauri-plugin-notification`, con ripiego `osascript`; «non disturbare», suono di sistema con prova, pannello collegato; 168 test Rust, 102 JS) |
| F | Rubrica e Trova contatto | **fatto** (tabella `contatti` con dedup per email, comandi `contatti_elenco`/`contatto_salva`/`contatto_elimina`/`contatti_importa_vcard`/`contatti_esporta_vcard`/`contatti_suggerisci`, vCard 3.0 con round-trip, completamento A/Cc/Ccn; **184 test Rust, 112 JS**) |
| G | Calendario e Riunione — **versione inviti**: parser iCalendar, tabella `inviti`, risposta METHOD:REPLY, agenda a elenco, invito in uscita | **fatto** (parser iCal con folding/escape/date UTC-offset-giornata intera, tabella `inviti` con aggiornamento per SEQUENCE e `CANCEL`→annullato, comandi `inviti_elenco`/`invito_da_messaggio`/`invito_rispondi`/`invito_crea`, barra dell'invito in lettura e agenda a elenco; **210 test Rust, 143 JS**) |
| H | Regole (motore locale) e threading vero delle conversazioni | **fatto** (conversazioni per References/In-Reply-To con ripiego sull'oggetto normalizzato, comando `mail_conversazioni`, lista raggruppata **espandibile** con preferenza salvata; motore locale applicato durante `mail_sync`, condizioni in AND e azioni in ordine, pannello «Regole» con statistiche e riordino; **199 test Rust, 132 JS**) |
| M | **Diagnostica della connessione**: un comando che prova i passi in ordine e dice *dove* si ferma | **fatto** (comandi `diagnostica_account` e `diagnostica_smtp`: `nome server` → `connessione` → `certificato` → `saluto del server` → `accesso` → `cartelle`, arresto al primo errore col **testo esatto del server**, riepilogo leggibile, password dal Portachiavi e **mai** in un esito; pulsante «Prova connessione…» e «Copia il risultato» nella finestra Account; **331 test Rust, 215 JS**) |
| R | **Carattere e dimensione applicati davvero**: pannello di lettura (Posta inviata compresa), menu del gruppo «Carattere» nella composizione, HTML del messaggio inviato, scala di lettura A⁻/A⁺ | **fatto** (preferenza `letturaZoom` in `config.json` con normalizzazione e rifiuto; `documentoCorpo` veste la scelta; `CARATTERI_COMPOSIZIONE`/`elencoDimensioni` con menu vivi; `htmlConCarattere` mette il font nel messaggio inviato. Dentro l'app un messaggio si legge col carattere scelto **dal lettore** — lo `style` proprio del messaggio è rimosso dal sanificatore, di proposito — mentre il carattere scelto **dal mittente** viaggia nel MIME ed è quello che vede il destinatario esterno; **316 test JS, 357 Rust**) |

**Blocco C — due scelte dichiarate.** (1) La scelta del file **non** usa
`@tauri-apps/plugin-dialog` (il plugin non è fra le dipendenze): si legge con un
`<input type="file">` + `FileReader` e il contenuto viaggia in base64 via IPC. (2) Grassetto,
corsivo, sottolineato ed elenchi usano `document.execCommand`, **deprecato** ma ancora
implementato dalle webview di sistema: la selezione non si gestisce a mano. Il ritaglio è
implementato su `canvas` per l'immagine selezionata nel corpo; senza immagine selezionata lo
dichiara invece di restare muto.

Voci del ribbon che nella v1 dichiarano esplicitamente di non essere disponibili, invece di restare mute:
Nuovi elementi, Cambia sfondo (blocchi E–H). Dal blocco G «Riunione» è invece viva: apre l'agenda a
elenco degli inviti di riunione.

**Blocco D, prima metà — scelte e scostamenti.** Ogni voce toccata ha un consumatore vero (nessuna
preferenza salvata e mai letta):

- **Lettura.** Posizione del pannello (`letturaPannello`): "sotto" (layout della v1), "destra"
  (griglia: lista a sinistra, lettura a destra) e "nascosto" — la classe di layout è calcolata da
  `classePannelloLettura` (test JS) e applicata a `.main` da `main.js`. Immagini
  (`letturaImmagini`): "mai" **non chiama** `mail_body_con_immagini` e toglie il pulsante;
  "sempre" la chiama all'apertura; "chiedi" (default) lascia il pulsante, com'era. Segna come
  letto dopo N secondi (`letturaSegnaLettoDopo`, 0 = mai, tetto 600): timer che chiama
  `mail_set_seen`. Anteprima del testo in lista (`letturaAnteprima`): aggiunge l'anteprima in coda
  all'oggetto; il testo arriva dal corpo **già in cache** (`MessageRow::body_text` → `MailRow::anteprima`),
  quindi per i messaggi mai aperti l'anteprima è assente finché non si scarica il corpo — non è un
  limite della preferenza ma della cache. Scelta dichiarata: l'anteprima sta **sulla stessa riga**,
  in coda all'oggetto (il riferimento la mostra su una riga dedicata; con le righe a altezza fissa
  della v1 la riga dedicata richiederebbe di rivedere l'altezza di ogni riga).
- **Composizione.** Formato (`composizioneFormato`): "testo" azzera `corpoHtml` all'invio (parte solo
  il testo). A capo automatico (`composizioneACapo`): classe sul corpo. Includi il messaggio
  originale in Rispondi (`composizioneIncludiOriginale`, attivo): con `false` la bozza parte senza
  citazione. "Nuova finestra" (`composizioneNuovaFinestra`): con `true` una bozza aperta non viene
  sostituita, la nuova si affianca con uno scarto. **Scostamento dichiarato**: la v1 usa una sola
  finestra di sistema, quindi "nuova finestra" non apre una finestra di macOS distinta; la
  differenza osservabile è la coesistenza e l'affiancamento delle bozze. È l'unica voce del blocco
  che non può avere l'effetto pieno del riferimento in una sola finestra.
- **Tipi di carattere.** Famiglia e dimensione (`carattereFamiglia`/`carattereDimensione`) vestono il
  corpo `contenteditable` della composizione (stile in linea) e la casella del gruppo "Carattere" del
  ribbon. Famiglia vuota → "Aptos"; dimensione fuori 8–72 → 12.
- **Correzione automatica.** Tabella di sostituzioni (`correzioneSostituzioni`, tre predefinite:
  `nn`→`non`, `ke`→`che`, `xche`→`perché`), modificabile nel pannello (aggiungi/rimuovi). Agisce a
  **parola intera** mentre si scrive nel corpo (`applicaCorrezione` sul nodo del cursore): «nn» dentro
  «Anna»/«nnn» non si tocca. La logica pura sta in `src/views/sostituzioni.js` ed è collaudata.
- **Ortografia.** `ortografiaAttiva` toglie o mette `spellcheck` sul corpo e `ortografiaLingua` è la
  lingua suggerita (`lang`). **Dichiarato nel pannello**: il correttore è quello della webview di
  sistema (WKWebView/WebView2); l'app non ha un correttore proprio e non finge di averne uno — se il
  sistema non supporta la lingua, ripiega sulla lingua di macOS.
- **Migrazione**: i nuovi campi hanno tutti un default e `#[serde(default)]`, quindi un `config.json`
  scritto prima del blocco D resta valido; i valori fuori scala (secondi negativi, dimensione oltre il
  massimo, famiglia vuota, enumerativi inventati, sostituzioni vuote o duplicate) sono normalizzati
  **in lettura**; il salvataggio rifiuta gli enumerativi sconosciuti. Nessun campo password.

Prove visive del blocco D (headless Chrome, `?view=impostazioni-lettura|composizione|carattere|correzione|ortografia`,
più `?lettura=destra|sotto|nascosto&anteprima=1&carattere=Georgia&dimensione=18&ortografia=1`):
`bloccoD-*.png`.

**Blocco D, seconda metà — scelte e scostamenti.** Firme, Posta indesiderata, Privacy e le voci
nuove di Generale hanno tutte un effetto reale:

- **Firme.** `config.rs` porta `firme: Vec<Firma>` (`{ id, nome, contenuto, html }`) e
  `firma_predefinita_per_account` (id account → id firma). La firma singola storica
  (`firmaDelMittente`) **non si perde**: `firme_effettive()` la migra in lettura nel pannello e nella
  finestra di composizione (la stessa migrazione esiste in JS, `firmeEffettive`). La firma predefinita
  dell'account entra nelle nuove composizioni; la finestra di composizione ha un riquadro **Firma** che
  permette di sceglierne un'altra **sostituendo** quella precedente (`sostituisciFirma`, non la
  duplica). Scostamento dichiarato: la sostituzione dalla finestra di composizione opera sul testo del
  corpo, quindi cambiare firma dopo aver formattato il testo ne azzera la formattazione ricca (le
  firme si scelgono di norma prima di scrivere).
- **Posta indesiderata.** La protezione (`protezionePostaIndesiderata`, `"spenta" | "attiva"`) agisce
  **durante `mail_sync`**: con «Attiva» i messaggi appena arrivati da mittenti bloccati vengono
  spostati nella cartella Posta indesiderata (server con `server_sposta`, poi cache); con «Spenta»
  vengono solo marcati (`messages.indesiderato = 1`) e restano dove sono. Se il server non ha una
  cartella indesiderata — o rifiuta lo spostamento — la protezione **degrada alla marcatura** invece di
  far fallire la sincronizzazione. Il pannello elenca i mittenti bloccati (comando di sblocco nuovo,
  `mail_sblocca_mittente`; sbloccare un indirizzo non bloccato non è un errore), dice quanti sono e
  l'ultima volta che la protezione ha agito (`protezioneUltimaAzione`, aggiornata dal kernel).
- **Privacy.** Il pannello mostra il registro `ai_audit` con i **soli campi che esistono davvero**
  (data e ora, provider, modello, azione, versione del prompt, impronta SHA-256 abbreviata): nessun
  campo inventato, nessun contenuto. Due comandi nuovi: `registro_ia_svuota` (svuota il registro) e
  `registro_ia_esporta` (scrive un file di testo in Download, solo impronte e metadati). Il pannello
  dichiara che il consenso al cloud è esplicito e che non c'è telemetria — coerente col kernel
  (`consenso_richiesto`, `registro_attivo`).
- **Generale.** Oltre al tema, ora ha lingua delle risposte IA, **cartella iniziale** all'avvio
  (`cartellaIniziale`, letta da `main.js`) e **Svuota la cache locale** (comando nuovo `svuota_cache`).
  Svuotare la cache rimuove i **messaggi** e nient'altro: configurazione, firme, mittenti bloccati e
  registro IA restano intatti (test dedicato). La configurazione è in `config.json`, il resto nel
  database della cache: due file distinti, così l'invariante è verificabile.
- **Migrazione e nessuna password.** Tutti i campi nuovi hanno default e `#[serde(default)]`: un
  `config.json` precedente resta valido; nessun campo password entra nel file.

Prove visive del blocco D, seconda metà (headless Chrome,
`?view=impostazioni-firme|posta|privacy|generale`, più `?view=impostazioni-generale` che apre il hub e
clicca il riquadro Generale, e `?view=compose` per il riquadro Firma): `bloccoD2-*.png`.

**Blocco E — notifiche di sistema e suoni: scelte e scostamenti.**

- **Meccanismo.** Si usa il **plugin ufficiale** `tauri-plugin-notification` (v2),
  registrato in `run()`; su macOS passa da Notification Center (`notify-rust` →
  `mac-notification-sys`). La chiamata `show()` prepara il payload e lo consegna
  su un task separato. **Scostamento dichiarato**: in modalità sviluppo il plugin
  attribuisce la notifica a «Terminal» (`tauri::is_dev()` → `com.apple.Terminal`);
  nell'app impacchettata il mittente è l'identificatore `it.esempio.outlookai`.
  Come **ripiego**, se `show()` fallisce si mostra la notifica con
  `osascript -e 'display notification …'` (la funzione `osascript_notifica`,
  con la messa in sicurezza della stringa AppleScript collaudata).
- **Momento.** La notifica si emette **dopo** il ciclo di rete di `mail_sync`
  (funzione `notifica_dopo_sync`), mai dentro; i messaggi nuovi sono quelli con
  UID più alto del massimo in cache **prima** dell'upsert — la stessa soglia che
  produce `FolderSyncSummary::new_messages`. Il conteggio viene quindi dal
  riepilogo reale, non da una stima.
- **Regole (funzione pura `notifiche::decidi`).** Non si notificano i messaggi
  **già letti**, quelli dei **mittenti bloccati**, quelli in **Posta indesiderata**
  e quelli dentro l'intervallo di **«non disturbare»** (anche a cavallo della
  mezzanotte, es. 22:00–07:00). **Scelta dichiarata**: se la **finestra dell'app
  è in primo piano non si notifica affatto** (l'utente sta già guardando la posta;
  non c'è una notifica «discreta» separata). Con l'**interruttore generale spento**
  non si notifica.
- **Testo.** Un solo messaggio: mittente e oggetto. Più di uno: «N nuovi
  messaggi» con il più recente citato se l'anteprima è attiva; oltre **99** il
  conteggio mostrato è «99+». Con l'**anteprima spenta** la notifica non rivela
  né mittente né oggetto.
- **Suoni.** Sette voci: `nessuno`, `Basso`, `Vetro`, `Ping`, `Pop`, `Sosumi`,
  `Tink`, riprodotte dai file `/System/Library/Sounds/*.aiff`. La notifica porta
  il suono scelto tramite il plugin; il pulsante **«Prova»** suona il file con
  **`afplay`** (riproduttore di sistema). **«Prova notifica»** mostra una notifica
  vera e, essendo un'azione esplicita dell'utente, ignora di proposito «non
  disturbare» e lo stato della finestra: il pannello lo dichiara.
- **Impostazioni.** `notificheAttive`, `notificheAnteprima`, `notificheSuono`,
  `nonDisturbareAttivo`, `nonDisturbareInizio`, `nonDisturbareFine` (orari
  `HH:MM`). Tutti con default e `#[serde(default)]`: un `config.json` precedente
  resta valido; i valori fuori elenco o gli orari storti sono **normalizzati in
  lettura** e **rifiutati al salvataggio** se non ammessi. Nessuna password.
- **Prove visive** (headless Chrome, `?view=impostazioni-notifiche&theme=dark|light`):
  `bloccoE-notifiche-scuro.png`, `bloccoE-notifiche-chiaro.png`.
- **Limite dichiarato della prova in sessione.** La sessione SSH non ha accesso
  allo schermo (`screencapture` rifiuta «could not create image from display»),
  quindi la notifica vera non è stata fotografata: si è verificato che i comandi
  che la producono (`osascript …`, `afplay …`) terminano con esito 0 sul Mac.

**Blocco F — rubrica e completamento dei destinatari: scelte e scostamenti.**

- **Tabella `contatti`.** Vive nella stessa cache SQLite dei messaggi ed è creata
  con `CREATE TABLE IF NOT EXISTS` nello schema, quindi la migrazione è
  idempotente e un database precedente la riceve all'apertura senza perdere
  nulla. L'**email è la chiave logica**, salvata e confrontata in minuscolo
  (`UNIQUE`), con i campi nome, cognome, telefono, azienda, note e le date di
  creazione/modifica.
- **Deduplicazione per email.** `contatto_salva` ha **due casi distinti**,
  dichiarati: con un `id` esistente è una **modifica** dal modulo della rubrica
  (i campi inviati sostituiscono i precedenti, anche se vuoti); senza `id`, se
  l'indirizzo è già in rubrica la voce viene **aggiornata** e i campi **vuoti non
  cancellano** quelli presenti (così «Aggiungi ai contatti» da un messaggio con
  il solo indirizzo non perde il nome già salvato). Il risultato dice se è stato
  un inserimento o un aggiornamento.
- **vCard 3.0 con round-trip.** Export e import coprono le proprietà che il
  modello possiede davvero: `N` (cognome, nome), `FN`, `EMAIL`, `TEL`, `ORG`,
  `NOTE`, con la sfuggitura di `\`, a capo, `,` e `;` (RFC 6350 §3.4) e lo
  scioglimento delle righe di continuazione (§3.2). Il file esportato è
  leggibile da **Contatti di macOS**. Il round-trip è collaudato: esportare e
  reimportare lascia i dati identici.
- **Cosa del formato vCard NON è supportato — dichiarato, mai inventato né
  perso in silenzio.** Le proprietà che la rubrica non ha (`BDAY`, `ADR`,
  `URL`, `PHOTO`, `X-*`, …) non vengono lette: il comando di importazione
  restituisce il loro **nome** in `ignorati`, e il pannello lo mostra. Una scheda
  **senza indirizzo email** non può diventare un contatto (l'email è la chiave):
  è contata in `senzaEmail` e dichiarata. `VERSION` è riconosciuta ma non mappata.
  L'export scrive vCard **3.0** (non 4.0): è la versione letta da Contatti di macOS.
- **Suggerimenti dei destinatari.** `contatti_suggerisci(testo, limite)` unisce i
  contatti della rubrica e gli indirizzi già visti nella cache dei messaggi
  (mittente e destinatari, estratti con `estrai_indirizzo`), **deduplicati per
  email** (la rubrica ha la precedenza sul «già visto») e ordinati per pertinenza:
  corrispondenza **all'inizio dell'indirizzo** (0), **all'inizio del nome** (1),
  **interna all'indirizzo** (2), **interna al nome** (3). La stessa logica esiste
  in JS (`filtroSuggerimenti`) per il percorso browser, ed è collaudata.
- **Ccn (copia nascosta).** La finestra di composizione ha ora i campi **A / Cc /
  Ccn**, tutti con il completamento. Il kernel costruisce il messaggio con
  `build_message_completo`, che aggiunge i destinatari di `Ccn` alla **busta
  SMTP** senza metterli nell'intestazione `Bcc` (RFC 5322 §3.6.3, come Outlook).
  La firma di `build_message_con_allegati` **non cambia**: è rimasta un guscio che
  delega con `Ccn` vuota, così i test e i chiamanti esistenti restano validi.
- **Interfaccia.** La **Rubrica** è una finestra propria (token e misure del
  progetto, chiaro/scuro) con ricerca, aggiunta, modifica ed eliminazione **con
  conferma**, importazione/esportazione vCard e **doppio clic che apre una nuova
  composizione** su quell'indirizzo. La voce **«Trova contatto»** apre la rubrica
  già col **fuoco nella ricerca**; **«Rubrica»** la apre normalmente. Nel pannello
  di lettura un pulsante **«Aggiungi ai contatti»** salva il mittente in un clic e
  dice se è stato aggiunto o **aggiornato** (mai duplicato). Il completamento nei
  campi dei destinatari funziona anche col **solo indirizzo** (senza nome) e, se
  non c'è alcun suggerimento, **non compare alcun riquadro vuoto**.
- **Scostamento dichiarato.** La finestra della rubrica è un pannello sopra la
  vista principale, come le altre finestre della v1 (una sola finestra di
  sistema); non ci sono finestre di macOS distinte.
- **Prove visive del blocco F** (headless Chrome): `bloccoF-rubrica-scuro.png`,
  `bloccoF-rubrica-chiaro.png`, `bloccoF-rubrica-ricerca-scuro.png` (ricerca
  «beta»), `bloccoF-trova-contatto-scuro.png` (fuoco nella ricerca),
  `bloccoF-suggerimenti-scuro.png` / `bloccoF-suggerimenti-chiaro.png`
  (completamento dei destinatari in composizione), `bloccoF-aggiungi-contatti-scuro.png`.
  Le viste si aprono con `?view=rubrica[&q=…&focus=1]` e
  `?view=compose-suggerimenti&q=…` (vedi `docs/uso-e-prova.md`).

**Blocco H — regole locali e conversazioni: scelte e scostamenti.**

- **Threading delle conversazioni.** Il raggruppamento (`mail/conversazioni.rs`,
  funzione pura `chiavi_conversazione`) usa, nell'ordine: (1) **References /
  In-Reply-To** — i messaggi che si citano stanno insieme **anche con oggetti
  diversi**; (2) in mancanza di riferimenti, l'**oggetto normalizzato** — si
  tolgono i prefissi `Re:`, `R:`, `I:`, `Rif:`, `Fwd:`, `Fw:` e i marcatori come
  `[externa]` (ripetutamente), poi spazi e maiuscole; oggetti diversi **non** si
  uniscono. La chiave di ogni riga si ricalcola a ogni sincronizzazione su **tutte**
  le righe della cartella (una risposta può riferirsi a un messaggio di ieri) e si
  scrive in `messages.thread_key`. Colonne nuove `in_reply_to` e `references_hdr`
  (migrazione `ALTER TABLE` idempotente).
- **Scostamento dichiarato sulle References.** L'`ENVELOPE` IMAP porta
  `In-Reply-To` e `Message-ID`, **non** `References`: il client reale popola
  quindi `in_reply_to` (che basta a incatenare risposta→risposta→radice), mentre
  il campo `References` resta valorizzato solo dove la sorgente lo fornisce
  (i test). Leggere `References` dall'IMAP richiederebbe un fetch
  dell'intestazione dedicato per ogni messaggio: non è stato fatto nella v1.
- **Lista raggruppata ed espandibile.** Con «Raggruppa per conversazione» attivo
  la lista usa `mail_conversazioni` (una riga per conversazione, con il
  **numero di messaggi** e il **badge dei non letti**, espandibile col
  triangolino per vedere i singoli messaggi indentati). La modalità si
  attiva/disattiva dal pulsante **«▤ Conversazioni»** in testa alla lista e la
  preferenza `raggruppaConversazioni` si salva in `config.json`. Nel percorso
  browser (senza Tauri) il raggruppamento lo fa la funzione pura JS
  `raggruppaConversazioni`.
- **Motore delle regole durante la sincronizzazione.** `mail/regole.rs`: dopo
  l'inserimento in cache e **fuori dal ciclo di rete** (come la notifica del
  blocco E), per ogni cartella si pianifica (`pianifica`), si esegue la **rete**
  (`esegui_rete`) e si applica alla **cache** (`applica_cache`) — le due fasi non
  incrociano mai la cache, così il future del comando resta `Send`.
- **Condizioni in AND, azioni in ordine.** Le condizioni (`mittente contiene`,
  `oggetto contiene`, `corpo contiene`, `destinatario contiene`, `con allegato
  sì/no`) sono combinate in **AND** (un campo vuoto è indifferente); le azioni
  (`sposta`, `contrassegna`, `categorizza`, `segna come letto`, `elimina`) si
  applicano **nell'ordine dichiarato**. Dopo uno **spostamento** o
  un'**eliminazione** riusciti, le azioni successive sullo stesso messaggio sono
  saltate (il messaggio non è più nella cartella di partenza). Una regola
  **disattivata non agisce**.
- **Trasparenza e nessun doppio spostamento.** Ogni messaggio è valutato **una
  volta sola** (colonna `regole_applicate`, marcata **prima** delle azioni perché
  dopo uno spostamento la riga è altrove): ai sincronismi successivi non viene
  rielaborato. Ogni regola porta `esecuzioni` (quante volte ha agito) e
  `ultimaEsecuzione`, che il pannello mostra. Se il server **rifiuta** un'azione,
  l'errore è registrato, la regola risulta non applicata e **le altre proseguono**.
  Limite dichiarato: come le regole di Outlook, si applicano ai messaggi **in
  arrivo**, non a quelli già in cache prima dell'attivazione della regola.
- **Pannello «Regole».** Si apre dalla voce **«Regole»** del ribbon e dal riquadro
  **Regole** delle impostazioni. Elenca le regole (nome, attiva/disattiva,
  condizioni e azioni in chiaro, statistiche), permette di **crearne, modificarne,
  attivare/disattivare, riordinare (▲▼) ed eliminarne**. I comandi del kernel
  `regole_elenco`, `regola_salva`, `regola_elimina`, `regole_riordina`
  restituiscono sempre l'elenco aggiornato.
- **Impostazioni e migrazione.** `raggruppaConversazioni` (bool, default attivo) e
  `regole` (elenco) vivono in `config.rs` con default e `#[serde(default)]`; le
  regole si **normalizzano in lettura** (id/nome generati, id duplicati scartati,
  azioni fuori elenco o «sposta» senza destinazione tolte, ordine rispettato) e si
  **validano al salvataggio**. Nessun campo password.
- **Prove visive del blocco H** (headless Chrome): `bloccoH-conversazioni-scuro.png`,
  `bloccoH-conversazioni-chiaro.png` (lista raggruppata, una conversazione
  **aperta** con i messaggi indentati e le altre chiuse), `bloccoH-regole-scuro.png`,
  `bloccoH-regole-chiaro.png` (pannello con due regole), `bloccoH-regola-form-scuro.png`
  (modulo di modifica con condizioni e azioni). Le viste si aprono con
  `?view=conversazioni` e `?view=regole[&form=1]` (vedi `docs/uso-e-prova.md`).

**Blocco G — inviti di riunione (versione inviti): scelte e scostamenti.**

- **Cos'è e cosa non è.** Il blocco G è realizzato come **versione a inviti**, non
  come calendario. Si leggono gli inviti che arrivano per posta (allegato
  `text/calendar`/`application/ics`), si risponde con un iCalendar reale e si
  creano inviti in uscita. **Non** ci sono: viste mese/settimana/giorno a griglia,
  calcolo delle occorrenze di una ricorrenza, promemoria, sala riunioni, invio
  automatico di risposte. L'interfaccia lo dichiara (l'agenda scrive di essere un
  **elenco**, non una griglia).
- **Parser iCalendar senza dipendenze** (`src-tauri/src/inviti.rs`, tutto puro).
  Legge `METHOD`, `UID`, `SEQUENCE`, `SUMMARY`, `DTSTART`, `DTEND`, `DTSTAMP`,
  `LOCATION`, `ORGANIZER`, `ATTENDEE`, `DESCRIPTION`, `RRULE`; scioglie il
  **folding** (righe di continuazione con spazio/tab iniziali) e gli **escape**
  (`\n`, `\,`, `\;`, `\\`); interpreta le date **UTC** (`Z`), con **offset**
  esplicito (`+HHMM`/`-HHMM`) e **solo-data** (evento di giornata intera, che
  senza `DTEND` dura un giorno come da RFC 5545 §3.6.1). **Scostamento
  dichiarato**: un `TZID` non è risolvibile senza un database dei fusi — la data
  viene letta come ora locale e lo si annota.
- **Ricorrenze.** Una `RRULE` è letta e descritta (`descrivi_ricorrenza`). Una
  ricorrenza **semplice** (`FREQ` con al più `INTERVAL`/`COUNT`/`UNTIL`) non
  produce avvisi; una **complessa** (`BYDAY`, `BYMONTH`, `BYSETPOS`, …) fa
  comparire la dichiarazione che **la v1 mostra solo la prima occorrenza** e non
  ne calcola le altre.
- **Tabella `inviti`** nella stessa cache SQLite, creata con
  `CREATE TABLE IF NOT EXISTS` (migrazione idempotente: un database precedente la
  riceve all'apertura senza perdere nulla). L'`UID` è la chiave: lo **stesso UID
  con `SEQUENCE` più alta aggiorna la riga** invece di crearne una seconda; una
  `SEQUENCE` uguale o più bassa **non riscrive** (lo stato scelto dall'utente non
  si perde a ogni sincronizzazione); un `METHOD:CANCEL` porta sempre lo stato ad
  `annullato`. Gli stati sono `in_attesa`, `accettato`, `tentativo`, `rifiutato`,
  `annullato`.
- **Risposta solo su azione dell'utente.** `invito_rispondi(id, risposta)` genera
  un **`METHOD:REPLY`** con lo stesso `UID` e il `PARTSTAT`
  `ACCEPTED|TENTATIVE|DECLINED`, e lo invia **all'organizzatore** con la macchina
  di invio già esistente (allegato `text/calendar`). **Nessuna risposta parte mai
  da sé**: solo al clic su Accetta / Tentativo / Rifiuta. L'accettazione non crea
  un evento di calendario (non c'è un calendario): cambia lo stato dell'invito.
- **Invito in uscita.** `invito_crea(dati, destinatari)` costruisce un
  `METHOD:REQUEST` con **UID nuovo** (`uid_nuovo`, millis + contatore),
  `ORGANIZER` = utente e un `ATTENDEE` per invitato, e lo invia come allegato
  `text/calendar`. Una copia entra nell'agenda come invito **in uscita**
  (`uscita = 1`): a un proprio invito non si risponde, e l'agenda lo dichiara.
- **Interfaccia.** (1) **Barra dell'invito** in cima al messaggio aperto, quando
  il messaggio porta un calendario: «Richiesta di riunione da <organizzatore>»,
  quando (`formattaDataOra`/`formattaDurata` in italiano) e dove; pulsanti
  Accetta / Tentativo / Rifiuta e «Apri l'agenda». Se l'invito è già stato
  risposto (o è annullato) la barra **mostra lo stato** invece dei pulsanti.
  (2) **Agenda a elenco** (voce «Riunione» del ribbon e riquadro **Calendario**
  delle impostazioni): inviti raggruppati in **Oggi / Prossimi / Passati**, con
  stato e possibilità di rispondere da lì, più «＋ Nuova riunione». (3) Il
  **modulo di una nuova riunione** (oggetto, inizio, fine, luogo, invitati con
  completamento dalla rubrica, messaggio accompagnatorio) invia l'invito.
  (4) Dalla **composizione**, la voce «Riunione» del ribbon apre lo stesso modulo
  con i destinatari di A/Cc e **il corpo scritto come messaggio accompagnatorio**
  (punto 7 della richiesta).
- **Scostamento dichiarato sulla voce «Riunione».** La richiesta dice sia
  «voce ribbon → finestra con l'elenco», sia «la voce ribbon apre la creazione di
  una nuova riunione». Le due letture sono unificate così: la voce **apre
  l'agenda a elenco**, che ha in testa il pulsante **«＋ Nuova riunione»** che apre
  il modulo. Da lì si crea, e dall'agenda si risponde. Il modulo di creazione è
  anche raggiungibile dalla composizione (punto 7).
- **Doppio fetch dichiarato.** `invito_da_messaggio` rilegge il corpo del
  messaggio per estrarre l'allegato calendario: sui messaggi che **non** portano
  un `.ics` la barra non fa alcuna chiamata (si guardano prima i metadati degli
  allegati), quindi il costo è solo per i messaggi di invito.
- **Prove visive del blocco G** (headless Chrome): `bloccoG-invito-scuro.png`,
  `bloccoG-invito-chiaro.png` (barra dell'invito nel pannello di lettura),
  `bloccoG-agenda-scuro.png`, `bloccoG-agenda-chiaro.png` (agenda a elenco, con
  Oggi/Prossimi, stati e pulsanti), `bloccoG-nuova-riunione-scuro.png`,
  `bloccoG-nuova-riunione-chiaro.png` (modulo di una nuova riunione). Le viste si
  aprono con `?view=invito`, `?view=agenda`, `?view=nuova-riunione` (vedi
  `docs/uso-e-prova.md`).

### Blocco I1 — operazioni su messaggi e cartelle (inventario `docs/riferimento-outlook/inventario-funzioni.md`)

- **Etichette dal riferimento**: le voci dei menu contestuali usano i nomi esatti
  dei cataloghi di localizzazione di Outlook installato (`Rinvia`,
  `Inoltra come allegato`, `Copia nella cartella…`, `Ignora conversazione` /
  `Non ignorare più`, `Nuova cartella`, `Rinomina cartella`, `Elimina cartella`,
  `Svuota cartella`, `Segna tutti come già letti`, `Salva come bozza`,
  `Aggiungi a Preferiti` / `Rimuovi da Preferiti`, `Più tardi oggi`,
  `Questa sera`, `Domani`, `Prossima settimana`, `Rimuovi contrassegno`).
- **`scadenza` è metadato locale.** IMAP non ha una data di contrassegno: la data
  vive nella nuova colonna `scadenza` della cache (ISO senza offset) e il flag
  `\Flagged` è l'unica parte rappresentabile sul server (aggiornato con un
  tentativo non fatale). Le date proposte sono calcolate da una **funzione pura**
  (`mail::scadenza`), collaudata a cavallo di mezzanotte e di fine settimana.
- **`Rinvia` pulisce l'oggetto** dai prefissi di risposta/inoltro (`R:`, `I:`,
  `Fwd:`, `[Esterna]`) e conserva gli allegati originali; **`Inoltra come
  allegato`** produce una parte `message/rfc822` con nome `<oggetto>.eml`.
- **Separatore gerarchico delle cartelle.** `cartella_crea(nome, genitore?)`
  compone `genitore/nome`: il separatore varia da server a server e non è
  deducibile a priori; se il server rifiuta l'errore è in italiano e la cache
  resta invariata. L'interfaccia attuale crea al livello radice (`genitore`
  assente).
- **Conversazioni ignorate**: nuova tabella `conversazioni_ignorate(thread_key)`;
  durante «Invia e ricevi» i messaggi di una conversazione ignorata vengono
  segnati letti e spostati in Posta eliminata. La scelta è **reversibile**.
- **Preferiti**: nuova tabella `cartelle(nome, preferita, aggiornato)`; le cartelle
  viste dal sync si registrano qui e la barra laterale le disegna con le
  preferite (★) in alto.
- **Menu con sottomenu.** `apriMenu` supporta ora un secondo livello (usato da
  «Contrassegna» → scadenze) senza chiudere il livello padre.
- **Prove visive** (headless Chrome): `bloccoI1-menu-messaggio-scuro.png`,
  `bloccoI1-menu-messaggio-chiaro.png`, `bloccoI1-menu-messaggio-sottomenu-chiaro.png`
  (sottomenu «Contrassegna»), `bloccoI1-menu-cartella-scuro.png`,
  `bloccoI1-menu-cartella-chiaro.png`. Le viste si aprono con
  `?view=menu-messaggio`, `?view=menu-conversazione`, `?view=menu-cartella`.

### Blocco J — più caselle

Richiesta: «dammi la possibilità da app di inserire altri account». Prima del
blocco il kernel **sapeva già** gestire più account (`config::Account` con
`Vec<Account>` e upsert per `id`; cache con `UNIQUE(account, folder, uid)`;
`mail_sync(accountId)`), ma l'interfaccia ne apriva **solo il primo**: la lista a
sinistra era piatta, non c'era modo di passare a un'altra casella, né di
eliminarne una, e all'avvio si sincronizzava solo la prima. Il blocco chiude
questo divario.

**Etichette del riferimento**: «Tutti gli account», «Posta in arrivo», «Nuovo
account», «Account predefinito», «Invia e ricevi», «Sincronizza ora».

**Kernel (Rust).**

- `account_elimina(id)` — rimuove la voce da `config.json`, la password dal
  **Portachiavi** e **solo i messaggi di quella casella** dalla cache
  (`store::Store::elimina_account` filtra su `account`). Gli altri account, le
  firme, i contatti, le regole e il registro IA non si toccano; se l'account
  eliminato era il **predefinito** la preferenza si azzera. **Non tocca nulla sul
  server**: sparisce la casella configurata nell'app, non l'account di posta.
- `account_predefinito(id)` — segna la casella aperta all'avvio; con `id` vuoto
  azzera la preferenza (torna il primo). `account_predefinito_letto()` restituisce
  l'account effettivo. La preferenza è `Preferenze::account_predefinito`: un campo
  nuovo su `Account` (che non ha `#[serde(default)]`) renderebbe **illeggibili** i
  `config.json` esistenti.
- `cartelle_elenco(accountId?)` — **raggruppata per account**: con `accountId`
  il solo gruppo richiesto, senza un gruppo per ogni casella, con i conteggi dei
  **non letti** presi dalla cache. La parte pura è `gruppi_cartelle(...)`, i test
  le passano un contatore finto.
- `mail_list` / `mail_conversazioni` / `mail_count` accettano `accountId`
  **opzionale**: con esso la sola casella, senza tutte insieme. Senza `accountId`
  ogni riga porta il suo **account** (e la **cartella**), e con **una sola**
  casella il risultato è **identico a prima** — c'è un test di non regressione che
  confronta gli stessi ordinamenti con `list_ordinato`. Le conversazioni si
  raggruppano anche per account, così due caselle con la stessa chiave restano
  righe distinte.
- `mail_sync_tutti()` — sincronizza **ogni** account e restituisce un
  `EsitoSyncAccount` per casella (email, ok, nuovi, cartelle, errore). **Un
  account che fallisce non ferma gli altri**: login rifiutato e rete restano
  nell'`errore` di quella casella. La parte pura è `sync_tutti_con(...)`, provata
  nei test con una sorgente finta (una riesce, una fallisce).
- **Lettura per account**: `primo_account()` ora preferisce l'account
  **predefinito**; `mail_body`, `mail_body_con_immagini`, `mail_allegato_salva`,
  `mail_bozza_risposta/inoltro`, `mail_allegati_messaggio`, `mail_rinvia`,
  `mail_inoltra_allegato`, `invito_da_messaggio`, `conferme_stato` e
  `conferma_rispondi` accettano `accountId` opzionale, così in «Tutti gli account»
  il corpo si scarica dalla casella giusta (stessa coppia cartella+UID esiste in
  più caselle).

**Interfaccia.**

- **Barra laterale** (`views/cartelle-account.js` + `renderSidebar`): «Tutti gli
  account» in cima con la sua **Posta in arrivo aggregata** (totale dei non letti
  di tutte le caselle), poi un nodo **espandibile** (▸/▾) per ogni casella con le
  sue cartelle; i **Preferiti** (★) restano in alto dentro il loro account. La
  voce attiva è evidenziata (`.folder--sel`) e il clic porta la lista su
  **quell'account e quella cartella**; «Tutti gli account → Posta in arrivo»
  mostra la posta di tutte le caselle insieme.
- **Finestra Account**: elenco **reale** di tutti gli account con «Account
  predefinito» segnalato; cliccando una riga la si modifica; **«＋ Nuovo
  account»** apre un modulo vuoto e **aggiunge** senza toccare gli altri (il
  salvataggio per id è un upsert: un indirizzo diverso crea una riga nuova);
  **«−»** elimina con conferma; **«Rendi predefinito»** cambia la casella
  d'avvio; **«Sincronizza ora»** agisce sull'account aperto. Dopo ogni operazione
  la lista si aggiorna **senza** riaprire la finestra (`onRicarica`).
- **Barra di stato**: l'account attivo, o «Tutti gli account» quando la lista è
  aggregata.
- **«Invia e ricevi»** del ribbon: con **una** casella l'esito unico di sempre;
  con **più** caselle `mail_sync_tutti` e una riga per account, con l'errore
  riferito alla casella che non si è aggiornata.

**Scostamenti e limiti dichiarati.**

- **Il registro delle cartelle è globale** (tabella `cartelle`, chiave `nome`),
  non per account. Per non rompere i file esistenti non è stato reso per-account:
  il registro si aggancia all'**account predefinito**, le altre caselle mostrano
  le cartelle che hanno **in cache** (una cartella di una casella secondaria,
  ancora **vuota**, compare dopo il primo sync che le porta almeno un messaggio).
- **Le azioni sui messaggi restano sull'account predefinito.**
  `mail_set_seen`, `mail_set_flag`, `mail_set_categorie`, `mail_sposta`,
  `mail_elimina`, `mail_archivia`, `mail_indesiderato`, `mail_copia`,
  `mail_set_scadenza` e il motore IA continuano a usare l'account predefinito e a
  chiave la coppia (cartella, UID) in cache: con più caselle che condividono
  cartella e UID la scrittura in cache può toccare la riga omonima dell'altra
  casella. La **lettura** (corpo, allegati, bozze di risposta/inoltro, inviti,
  conferme) è invece per account. Rendere per-account anche le azioni richiede di
  scoping ogni metodo di `store::ops` sull'account: è il seguito naturale del
  blocco, non è stato fatto qui. **→ Risolto dal blocco K** (vedi sotto): tutte
  le operazioni sui messaggi sono ora chiavate su `(account, folder, uid)`.
- **Un account vuoto non mostra le sue cartelle** (vedi sopra): il modulo Account
  resta il posto dove configurarla.
- **Nessuna password** in codice, test, config o file di esempio, come sempre: la
  scrive l'utente nella finestra Account e finisce nel Portachiavi.

**Test.** Rust: `src-tauri/tests/blocco_j_test.rs` (16 test) su eliminazione per
account, predefinito (salvataggio, rilettura, ricaduta sul primo, azzeramento),
`gruppi_cartelle` per account, lista aggregata con ordine per data e account di
provenienza, **non regresso a una sola casella**, conversazioni per casella e
`sync_tutti_con` con un fallito che non ferma gli altri. JS:
`tests/blocco-j.test.mjs` (13 test) sull'albero per account (Preferiti e
conteggi), lo stato attivo account+cartella, le etichette del riferimento, il
testo della conferma di eliminazione, il riepilogo per account e le righe della
finestra Account.

**Prove visive del blocco J** (headless Chrome, due caselle):
`bloccoJ-cartelle-scuro.png` / `bloccoJ-cartelle-chiaro.png` (barra laterale con
«Tutti gli account» e due caselle, con i non letti),
`bloccoJ-cartelle-gmail-scuro.png` (la seconda casella selezionata),
`bloccoJ-account-scuro.png` / `bloccoJ-account-chiaro.png` (finestra Account con
due account e l'account predefinito indicato),
`bloccoJ-nuovo-account-scuro.png` / `bloccoJ-nuovo-account-chiaro.png` (modulo di
un nuovo account vuoto, coi suggerimenti in grigio). Le viste si aprono con
`?view=cartelle[&account=tutti|gmail]`, `?view=account` e `?view=nuovo-account`
(vedi `docs/uso-e-prova.md`).

### Blocco K — operazioni per account

Il blocco J ha reso possibile avere **più caselle**, ma aveva lasciato un difetto
di correttezza dichiarato (vedi sopra, «Le azioni sui messaggi restano
sull'account predefinito»): le operazioni sui messaggi chiavavano la cache sulla
sola coppia **`(cartella, UID)`**. Due caselle reali hanno entrambe «Posta in
arrivo» e UID che si ripetono (1, 2, 3…): agire su un messaggio della seconda
poteva modificare la riga omonima della prima, sia in cache sia — peggio — sul
**server** (la sorgente IMAP era sempre quella dell'account predefinito). Il
blocco K risolve il difetto, non lo dichiara soltanto.

**Kernel (Rust).**

- **`store.rs`**: ogni operazione sui messaggi è ora chiavata su
  `(account, folder, uid)` — `set_seen`, `set_flagged`, `set_completato`,
  `set_categorie`/`categorie`, `flagged`/`completato`, `sposta`, `rimuovi`,
  `mittente`, `set_indesiderato`/`indesiderato`, `copia`, `set_scadenza`/`scadenza`,
  `thread_messages`, `thread_inputs`, `set_thread_key`, `messaggi_conversazione`,
  `messaggi_da_regole`, `segna_regole_applicate`, `aggiungi_categoria`,
  `messaggi_di_conversazioni_ignorate`, `messaggi_da_mittenti_bloccati`. Le
  firme che prendevano solo `(folder, uid)` sono state **estese** con `account`.
  Le condizioni usano `COALESCE(account, '')` per non perdere le righe legacy.
- **`lib.rs`**: gli stessi comandi accettano `accountId` **opzionale**
  (`mail_set_seen`, `mail_set_flag`, `mail_set_completato`, `mail_set_categorie`,
  `mail_set_scadenza`, `mail_sposta`, `mail_copia`, `mail_elimina`,
  `mail_archivia`, `mail_indesiderato`, `ai_azione`). Convenzione identica a
  quella del blocco J: `accountId` assente → **account predefinito**; un
  `accountId` **presente ma non configurato** dà un errore in italiano
  (`account non configurato: <id>`), **non** un silenzio. La risoluzione è la
  funzione **pura** `risolvi_account(accounts, id, predefinito)`, provata dai
  test. La sorgente IMAP è risolta con `sorgente_imap_per(accountId)`: la rete
  e la cache agiscono sulla **stessa** casella.
- **Motore delle regole** (`mail/regole.rs`): `applica_cache` prende l'account e
  agisce solo sulle sue righe; la pianificazione legge `messaggi_da_regole(account,
  folder)`. Una regola dell'account A non tocca i messaggi dell'account B.
- **Conversazioni e fili** (`mail/conversazioni.rs` + `mail/sync.rs`):
  `aggiorna_thread(store, account, folder)` calcola `thread_key` **dentro una sola
  casella**; `conversazioni`/`conversazioni_per_account` già raggruppavano per
  account. Il risultato: lo **stesso oggetto in due caselle diverse non si unisce**
  in un'unica conversazione; nello stesso account sì.
- **Protezione posta indesiderata** (`mail/protezione.rs`): `aggiorna_cache` agisce
  per account, come il resto del `mail_sync`.

**Interfaccia.** Ogni azione sui messaggi passa l'`accountId` della riga (o della
selezione attiva) risolto dalla funzione **pura** `risolviAccountAzione` in
`views/cartelle-account.js`: riga → selezione attiva → (con **una** casella) il
predefinito. Con **più** caselle e nessun account determinabile (una riga di
ricerca senza `account`) l'azione **non parte**: la riga di stato dice «Seleziona
una casella nella barra laterale prima di agire sul messaggio», invece di agire
su un'altra casella per sbaglio.

**Test.** Rust: `src-tauri/tests/blocco_k_test.rs` (16 test) su due caselle con la
stessa cartella e lo stesso UID — letto, contrassegnato/completato, categorie,
scadenza, sposta, copia, rimozione, indesiderato, e le operazioni combinate
(`ops::sposta/elimina/archivia/indesiderato`) — più l'`accountId` inesistente, il
confinamento di conversazioni e regole e la **non regressione** a una sola
casella. JS: `tests/blocco-k.test.mjs` (5 test) sulla propagazione
dell'`accountId` attivo e sul caso senza account. I test Rust restano **287 + 16
= 303**, i JS **189 + 5 = 194**.

**Non regressione.** Le firme sono state estese, non riscritte: i test
preesistenti (che usano una sola casella) restano verdi senza cambiare
comportamento; i loro call-site passano l'account della riga.

**Prove visive del blocco K** (headless Chrome, due caselle):
`bloccoK-operazioni-scuro.png` / `bloccoK-operazioni-chiaro.png` (barra laterale
con due caselle e i conteggi; la riga di stato dichiara l'azione «Segna come
letto» eseguita sulla sola `mario.rossi@esempiogroup.it` — non letti `13484 →
13483` — con `m.rossi@gmail.com` «invariata»). La vista si apre con
`?view=operazioni-account` (vedi `docs/uso-e-prova.md`).

**Limiti dichiarati.** Restano **globali** (fuori dall'elenco di questo blocco):
il registro delle cartelle (blocco J), la tabella `conversazioni_ignorate` (chiave
`thread_key`) e la tabella `conferme` (chiave `folder, uid, tipo`): due caselle con
la stessa chiave condividono la scelta «ignora conversazione» e la conferma
registrata. Le operazioni **sulle cartelle** (`cartella_svuota`,
`cartella_segna_tutta_letta`, `cartella_rinomina`, `cartella_elimina`) agiscono
sulla cartella per nome, senza account: non sono nell'elenco delle operazioni sui
messaggi di questo blocco. **→ Risolti dal blocco L** (vedi sotto).

### Blocco L — completare lo scoping per account

Il blocco K aveva reso **per account** le operazioni sui **messaggi** (chiave
`(account, folder, uid)`), ma aveva lasciato globali — e quindi difettose con due
caselle che hanno cartelle omonime («Posta in arrivo», «Posta eliminata»,
«Archivio»…) — quattro cose dichiarate qui sopra: le **operazioni sulle cartelle**,
il **registro delle cartelle**, le **conferme** di lettura/recapito e le
**conversazioni ignorate**. Svuotare la Posta eliminata della casella B agiva su
quella della A: una perdita di dati vera. Il blocco L chiude il difetto, non lo
dichiara soltanto.

**Kernel (Rust).**

- **`store.rs` — tabelle per account.** `conferme` passa a `(account, folder, uid,
  tipo)`, `conversazioni_ignorate` a `(account, thread_key)`, `cartelle` a
  `(account, nome)`. Le query usano `COALESCE(account, '')`, così le righe
  storiche restano valide. `registra_cartella`, `set_cartella_preferita`,
  `cartelle_registrate`, `cartelle_preferite`, `rinomina_cartella_cache`,
  `elimina_cartella_cache`, `svuota_cartella_cache`, `segna_cartella_letta_cache`,
  `conversazione_ignora`, `conversazioni_ignorate`, `e_conversazione_ignorata`,
  `conferma_registra` e `conferme_scelte` prendono ora l'**account** e agiscono
  solo sulle sue righe. `migra_tabelle_per_account` (idempotente) ricostruisce le
  tre tabelle con la chiave nuova copiando le righe esistenti come dell'account
  **predefinito** (`account = ''`), senza perdere dati.
- **`lib.rs` — comandi per account.** `cartella_crea`, `cartella_rinomina`,
  `cartella_elimina`, `cartella_svuota`, `cartella_segna_tutta_letta`,
  `cartella_preferita`, `cartelle_elenco`, `conversazione_ignora`,
  `conversazioni_ignorate`, `conferme_stato` e `conferma_rispondi` accettano
  `accountId` **opzionale** con la stessa convenzione del blocco K
  (`risolvi_account`: assente → predefinito; presente ma inesistente → errore in
  italiano `account non configurato: <id>`). Le operazioni IMAP passano dalla
  sorgente dell'account giusto (`sorgente_imap_per`): rete e cache agiscono sulla
  **stessa** casella. La sincronizzazione registra le cartelle e legge le
  conversazioni ignorate **per l'account sincronizzato**.
- **`mail/ops.rs`.** `crea_cartella`, `rinomina_cartella`, `elimina_cartella`,
  `svuota_cartella`, `segna_cartella_letta` prendono l'account e lo passano alla
  cache (blocco I1 esteso, non riscritto).

**Interfaccia.** Le voci del menu contestuale delle cartelle e le azioni della
barra laterale passano l'**account della cartella** cliccata, risolto dalla
funzione **pura** `risolviAccountCartella` in `views/cartelle-account.js`: cartella
→ selezione attiva → (con **una** casella) il predefinito. L'unico nodo senza
account è «Tutti gli account»: con **più** caselle l'azione **non parte** e la riga
di stato dice «Seleziona una casella nella barra laterale prima di agire sulla
cartella», invece di agire su una casella a caso. Le conversazioni ignorate
diventano un insieme **per account** (`ignoratePerAccount`), caricato per ogni
casella; le conferme di lettura/recapito si registrano e si leggono per la casella
del messaggio.

**Test.** Rust: `src-tauri/tests/blocco_l_test.rs` (10 test) su due caselle con
cartelle omonime e gli stessi UID — `svuota`, `elimina`, `rinomina`,
`segna tutti letti` via `mail::ops` (una casella non tocca l'altra), un rifiuto del
server che lascia tutto invariato, conferme e conversazioni ignorate per account, il
registro cartelle che non mischia i Preferiti, la convenzione dell'account e la
**non regressione** a una sola casella. Più un test di migrazione in `store.rs`
(righe storiche preservate, idempotenza) e tre test in `src/lib.rs`
(`test_account_inesistente`): i comandi non sono `pub` (Tauri genera macro omonime
e non ammette comandi pubblici), quindi la verifica che **ogni** comando rifiuti un
`accountId` inesistente vive dentro il crate. JS: `tests/blocco-l.test.mjs` (5
test) sulla risoluzione dell'account per le azioni sulle cartelle. I test Rust
restano **303 + 14 = 317**, i JS **194 + 5 = 199**.

**Non regressione.** Le firme sono state estese, non riscritte: i test preesistenti
(che usano una sola casella) restano verdi; i loro call-site passano l'account.
Le tabelle si migrano senza perdere dati e le righe storiche restano dell'account
predefinito.

**Prove visive del blocco L** (headless Chrome, due caselle con la stessa «Posta
eliminata»): `bloccoL-cartella-account-scuro.png` / `-chiaro.png` mostrano il menu
contestuale della «Posta eliminata» della **seconda** casella
(`m.rossi@gmail.com`), con la riga di stato che dichiara l'azione per account:
«le azioni (svuota, elimina, rinomina) agiscono per account.
mario.rossi@esempiogroup.it resta intatta». La vista si apre con
`?view=cartella-account` (vedi `docs/uso-e-prova.md`).

**Limiti dichiarati.** Restano **globali** (fuori dall'elenco di questo blocco): il
**motore IA** in lettura e in composizione continua a usare l'account predefinito
(l'IA in lettura segue la conversazione solo nella stessa cartella) e i **contatti**
e le **regole** restano unici per l'app, non per casella — come già dichiarato dai
blocchi F e H.

### Blocco M — diagnostica della connessione

**Perché.** L'app era completa di funzioni ma non era mai stata provata contro un
server di posta vero, e con «nulla funziona» non si sapeva **dove** si fermasse: se
il DNS, la porta, il TLS, l'accesso o l'elenco cartelle. La diagnostica fa dire
all'app, da sola, a che punto si è fermata — e lo fa con parole comprensibili a chi
non è tecnico.

**Come funziona.** `mail::diagnostica` definisce sei passi
(`nome server`, `connessione`, `certificato`, `saluto del server`, `accesso`,
`cartelle`) e una sequenza pura che li esegue **nell'ordine** e si ferma al primo
errore. Ogni passo è indipendente dagli altri: apre la propria connessione, non
legge né scrive la **cache** (quindi la diagnostica funziona anche quando la
sincronizzazione è rotta) e non dipende dalla password per i primi quattro passi —
se il Portachiavi non ha una password, lo dice il solo passo `accesso`.

- `diagnostica_account(accountId)` — ricezione, fino a `LIST`: il passo `certificato`
  riporta soggetto, emittente, validità e giorni alla scadenza; il passo `saluto`
  riporta il banner e le `CAPABILITY`; il passo `accesso` esegue il `LOGIN` vero e,
  se il server lo rifiuta, riporta **il suo testo esatto** (`NO
  [AUTHENTICATIONFAILED] Authentication failed.`); `cartelle` riporta il numero e i
  nomi.
- `diagnostica_smtp(accountId)` — invio: connessione, `EHLO`, TLS **implicito o
  `STARTTLS`** e `AUTH` (`PLAIN`, oppure `LOGIN` se il server dichiara solo quello),
  **senza inviare nulla**.
- Il riepilogo finale è una frase: «La diagnostica si ferma al passo 5 (accesso):
  …», oppure «Tutti i passi sono andati a buon fine (6 su 6)».

**La password non entra in un esito.** Arriva solo dal Portachiavi dentro il comando
che prova la connessione; ogni testo prodotto passa da `diagnostica::occulta`, che
sostituisce i segreti dichiarati dalla sorgente (per SMTP anche la forma base64 che
viaggia in `AUTH PLAIN`). Un test serializza l'esito e verifica che la password non
compaia.

**Interfaccia.** Nella finestra Account, sezione «Prova della connessione»: il
pulsante **«Prova connessione…»** esegue entrambe le prove e mostra i passi con ✓/✗,
il testo del server e — sotto ogni passo fallito — **una riga in italiano** che dice
che cosa significa e che cosa controllare (es. «Il server ha rifiutato utente o
password. Verifica il nome utente: su Esempio Host è di solito l'indirizzo completo»).
**«Copia il risultato»** mette negli appunti il testo completo (intestazione, passi
con ✓/✗, consigli, riepilogo), pronto da incollare a chi assiste. Se un passo
fallisce il riquadro si posiziona da solo sull'errore: senza quello, in una finestra
da 742 pt l'errore resterebbe sotto la piega e sembrerebbe che sia andato tutto bene.

**Test.** Rust: `src-tauri/tests/diagnostica_test.rs` (8 test, sorgente finta) —
l'ordine dei passi è sempre lo stesso, un login rifiutato è `errore` al passo
`accesso` col testo del server e **non** prosegue, un nome che non risolve si ferma
al primo passo, il riepilogo nomina passo e causa, l'invio usa gli stessi passi senza
`cartelle`, un errore al certificato nomina il passo, e **il testo prodotto non
contiene la password**. Più 6 test puri dentro il modulo (ordine, `estrai_cartelle`
con nomi accentati, `meccanismi_auth`, `occulta`, riepilogo). JS:
`tests/diagnostica.test.mjs` (16 test) su `consiglioDiagnostica`/`formattaPassi`/
`testoDiagnostica`. I test Rust passano da **317 a 331**, i JS da **199 a 215**.

**Prove visive.** `?view=diagnostica` (con `&theme=dark` / `&theme=light`) apre la
finestra Account con i passi già provati sul caso «accesso rifiutato»: il DOM contiene
10 righe di passo (5 IMAP + 5 SMTP), le due intestazioni, i consigli e i riepiloghi.
Le schermate non stanno nel repository (come le altre prove visive).

**Che cosa la diagnostica NON sa distinguere** (limiti dichiarati): se il DNS risolve
ma l'indirizzo IP è di un server sbagliato (una `A` di troppo non si vede); se il
rifiuto dell'accesso dipende dal nome utente o dalla password (il server risponde
`AUTHENTICATIONFAILED` in entrambi i casi, e il consiglio copre le due possibilità); un
blocco selettivo di un firewall che lascia passare la porta 993 ma non la 465 (si vede
come due esiti diversi, non come una causa comune). Ogni passo apre la propria
connessione invece di riusare una sola sessione: è più lento di qualche centinaio di
millisecondi, in cambio ogni passo riporta la risposta del server **sul proprio
tentativo** e un errore di rete transitorio non sporca i passi precedenti.

