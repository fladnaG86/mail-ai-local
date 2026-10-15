# Blocco S — Il ridisegno sul posto del pannello di lettura non perde più nulla

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sopravvivere al ridisegno del pannello di lettura ciò che non sta nel modello del messaggio — il corpo arrivato dal kernel e gli ascoltatori dei pulsanti — così che un'azione su un messaggio aperto (segna come letto, categorizza, contrassegna, completa) non lasci più il segnaposto «(corpo del messaggio)» né pulsanti muti.

**Architecture:** `renderReading` (`src/views/main-view.js`) ricostruisce il pannello da capo a ogni chiamata: `root.replaceChildren()`, poi l'intestazione, la barra dell'Assistente, il `.mail-body` col corpo **d'esempio** e il contenitore degli allegati. Il corpo vero però non è nel modello: arriva una volta sola da `mail_body` e vive dentro l'iframe, disegnato da `applicaCorpo`. Allo stesso modo gli ascoltatori della barra dell'Assistente e del pulsante della rubrica nascevano solo in `apriMessaggio`, quindi ogni ridisegno li lasciava orfani. Il rimedio sta nel chokepoint `renderLettura` (`src/main.js`), per cui passano **tutti** i ridisegni: lì si ricollega ciò che `renderReading` ricrea e si rimette il corpo conservato. Il blocco R aveva già usato questo punto per A⁻/A⁺; qui si completa il lavoro per il corpo, i quattro pulsanti IA, il selettore locale/cloud, «Aggiungi ai contatti» e «Mostra immagini».

**Tech Stack:** JavaScript ES modules senza framework (`src/main.js`, `src/views/main-view.js`), `node --test tests/*.mjs` con **jsdom** (prima prova con DOM vero del progetto) e `cargo test --manifest-path src-tauri/Cargo.toml`.

**Spec:** `docs/plans/2026-10-12-outlook-clone-ia-v1.md`; stato precedente in `docs/superpowers/plans/2026-10-14-blocco-r-carattere-lettura.md` (che aveva elencato i due difetti come preesistenti e aperti).

## Global Constraints

- Tutto in italiano: interfaccia, commenti, messaggi di commit.
- TDD: prima il test che fallisce, poi l'implementazione minima, poi il commit.
- Ogni task termina coi test verdi: `node --test tests/*.mjs` e `cargo test --manifest-path src-tauri/Cargo.toml`.
- Nessun pulsante muto: se una voce non può funzionare va **dichiarata**, non disegnata e basta.
- Il corpo del messaggio non si rilegge dal kernel per un ridisegno: sarebbe una chiamata di rete per un disegno. Si conserva l'ultimo disegnato.
- Prove visive senza Tauri: `python3 -m http.server 8099 --directory ~/outlook-ai-clone` poi `?view=…` (elenco in `docs/uso-e-prova.md`).

## Review Focus

1. **Rilegatura doppia degli ascoltatori** — `renderReading` ricrea i nodi, quindi ricollegarli in `renderLettura` è sicuro; ma se qualcuno li ricollega **anche** altrove, un clic esegue l'azione due volte (una doppia azione IA = due richieste al modello). Difesa: le chiamate restano in un posto solo (`renderLettura`), e `apriMessaggio` non ricollega più nulla. Test: `tests/lettura-persistenza.test.mjs`.
2. **Corpo di un altro messaggio** — il corpo conservato è valido solo per il messaggio a cui appartiene: `corpoCorrente.messaggio` si confronta prima di rimetterlo. Senza questo confronto, aprendo un secondo messaggio comparirebbe il corpo del primo. Test: `tests/lettura-persistenza.test.mjs` (premessa del primo test).
3. **Immagini già mostrate** — chi ha dato il consenso per un messaggio non deve vedersi richiedere di nuovo il consenso (né una seconda chiamata al kernel) dopo un ridisegno: con `conImmagini` il pulsante si toglie e basta. Test: caso «Mostra immagini» in `tests/lettura-persistenza.test.mjs`.
4. **Consenso al cloud** — il selettore locale/cloud non deve far partire nulla prima della conferma esplicita. Test: ultimo caso di `tests/lettura-persistenza.test.mjs`.
5. **Percorso browser (prove visive)** — senza Tauri non c'è corpo dal kernel: `corpoCorrente` resta `null` e il ridisegno deve continuare a mostrare il corpo d'esempio, senza errori. Verificato a browser con una casella attiva in barra laterale.

---

### Task 1: La prova che il ridisegno perde corpo e pulsanti

Prima di toccare il codice, si scrive la prova che oggi fallisce. Il progetto non aveva alcun test con DOM: le 316 prove esistenti sono tutte su funzioni pure, ed è la ragione per cui questa classe di difetti era passata attraverso il blocco R.

**Files:**
- Test: `tests/lettura-persistenza.test.mjs` (nuovo)
- Modify: `package.json` (jsdom fra le `devDependencies`)

**Interfaces:**
- Il test importa `apriMessaggio` e `renderLettura` da `src/main.js` (nuovi export, in coda al file, accanto a quelli già esportati per le prove).
- Kernel finto in memoria: `mail_body` → `{ html, text, attachments }`; `ai_azione` → `{ testo, modello, provider }`; `conferme_stato` → `null`.

- [x] `npm i -D jsdom`
- [x] jsdom monta un DOM minimo; `document.readyState` forzato a `loading` perché `boot()` non parta; `matchMedia` stubbato (`theme.js` lo interroga all'import).
- [x] Cinque casi: corpo dentro l'iframe all'apertura; corpo che sopravvive al ridisegno; pulsanti IA vivi dopo il ridisegno; «Mostra immagini» vivo dopo il ridisegno; selettore locale/cloud che cambia davvero la destinazione (con la conferma di consenso come prova osservabile).

### Task 2: Il corpo conservato e rimesso dal chokepoint

**Files:**
- Modify: `src/main.js` — stato `corpoCorrente`; `applicaCorpo` che lo registra; `renderLettura` che lo rimette (`ripristinaCorpo`); `collegaZoomLettura` e `applicaPreferenze` che leggono da lì.

**Interfaces:**
- `corpoCorrente = { messaggio, html, allegati, conImmagini }` — `null` finché il kernel non ha consegnato il corpo.
- `stileLetturaCorrente()` → `{ famiglia, dimensione, zoom }`: un posto solo per lo stile del corpo letto, che prima era copiato in tre funzioni.
- `ripristinaCorpo(el, msg)` non rilegge nulla dal kernel: ridisegna barra, iframe e allegati dall'ultimo corpo disegnato, e solo se è quello del messaggio ridisegnato.

- [x] Il corpo si conserva in `applicaCorpo` (unico punto che lo riceve dal kernel).
- [x] `renderLettura` rimette il corpo quando è quello del messaggio ridisegnato.
- [x] `corpoCorrenteHtml` (stringa) sostituito da `corpoCorrente` (oggetto): una sola fonte, non due.

### Task 3: Gli ascoltatori ricollegati dove i nodi nascono

**Files:**
- Modify: `src/main.js` — `renderLettura` richiama `collegaAssistente` e `collegaAggiungiContatti`; `apriMessaggio` smette di farlo; la politica delle immagini diventa `collegaImmagini(lettura, messaggio)`, usata sia all'apertura sia al ridisegno.

- [x] Quattro pulsanti IA e selettore della destinazione vivi dopo ogni ridisegno.
- [x] «Aggiungi ai contatti» non sparisce più dal pannello ridisegnato (la sua guardia `sender.querySelector(".add-contact")` lo rende idempotente).
- [x] «Mostra immagini» ricollegato, con la politica «mai» / «sempre» / «chiedi» in un posto solo.

### Task 4: Verifica

- [x] `node --test tests/*.mjs` → **322 prove, 0 fallite** (316 prima + 6 nuove).
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` → **357 prove, 0 fallite**.
- [x] Riproduzione a browser prima della correzione (Chrome DevTools MCP, con casella attiva in barra laterale): dopo «Categorizza» l'iframe spariva e la scheda IA non compariva più al clic; dopo la correzione il ridisegno avviene, i 4 pulsanti restano e la scheda compare.
- [ ] **Prova manuale dentro l'app** su un messaggio vero della casella (e su Posta inviata): apertura → «Categorizza» → il corpo resta; «Riassumi» → la scheda compare. L'agente non può eseguirla: servono i permessi di Registrazione schermo/Accessibilità.

### Task 5: «Completa» aggiorna il pannello aperto

Stessa famiglia dei due difetti chiusi qui sopra, trovato durante la verifica: la barra informativa del pannello porta «✔ Completato», ma `alternaCompletato` chiamava solo `ridisegna()` (che è la lista) e non `renderLettura`, quindi il pannello aperto restava indietro finché non si riapriva il messaggio — mentre contrassegno e categoria lo aggiornavano già.

**Files:**
- Modify: `src/main.js` — la riga di aggiornamento in `alternaCompletato`; `apriMessaggio` che registra il pannello in `readingEl`.
- Test: `tests/lettura-persistenza.test.mjs` (sesto caso).

- [x] Rosso: il sesto caso fallisce con «il pannello aperto non è stato aggiornato: manca la barra informativa».
- [x] `alternaCompletato` ridisegna il pannello quando il messaggio toccato è quello aperto.
- [x] `apriMessaggio` registra in `readingEl` il pannello su cui disegna: prima lo impostava **solo** `boot()` (dove il parametro `readingEl` ombreggiava la variabile di modulo), quindi le guardie `if (readingEl && messaggioCorrente === m)` non potevano funzionare fuori dal bootstrap — ed è la ragione per cui questa riga non era sorvegliabile dalle prove con DOM vero. Il parametro si chiama `pane` per non ombreggiare la variabile di modulo.
- [x] Rosso mirato: tolta la sola riga nuova, fallisce **solo** il sesto caso.

## Difetti della stessa famiglia, ancora aperti

- **La barra dell'invito e quella delle conferme** non vengono rimesse dal ridisegno sul posto: si riproducono solo più tardi, quando l'utente compie un'altra azione che le ridisegna. Rimedio possibile: conservare l'invito e lo stato delle conferme accanto a `corpoCorrente`, come si è fatto per il corpo.
- **La ricerca non porta l'account**: `RisultatoRicerca` (`src-tauri/src/lib.rs`) non ha il campo, quindi `daRigaRicercaKernel` non può farne a meno. È una mancanza **lato kernel**, non un campo scartato in JavaScript: azioni su un risultato di ricerca in vista aggregata ricadono sulla selezione attiva. Da valutare a parte.

## Difetti confermati e chiusi fuori dal pannello di lettura

- **`daRigaKernel` scartava `account` e `folder`** (commit `41de025`). Il kernel li manda in ogni riga (`MailRow`, `src-tauri/src/lib.rs`), col commento che ne spiega il motivo; il mappatore li buttava via, mentre il commento di `accountDi` dichiarava l'intento opposto («Nella vista Tutti gli account ogni riga porta il suo `account`»). Nella vista aggregata con più caselle e nessuna casella attiva in barra laterale ogni azione si fermava con «Seleziona una casella nella barra laterale» (`risolviAccountAzione` → `mancante`), e `cartellaDi` ripiegava sulla cartella attiva invece di usare quella della riga. Due prove nuove in `tests/mail-actions.test.mjs`; **324 prove JS**.

**Nota per le prove visive a browser:** i `sampleMessages` di `src/views/main-view.js` non portano `account`/`folder` (usano `id`, non `uid`, e non hanno corpo), quindi nel browser il blocco «Seleziona una casella» continua a comparire anche dopo questa correzione: è una lacuna dei dati d'esempio, non del codice — nell'app le righe arrivano dal kernel con i due campi. Allineare i dati d'esempio al contratto del kernel renderebbe la prova visiva più fedele (e permetterebbe di provare lì le azioni in vista aggregata).
