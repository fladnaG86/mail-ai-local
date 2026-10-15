# Blocco T — Le due barre sopra il corpo sopravvivono al ridisegno

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sopravvivere al ridisegno sul posto del pannello di lettura anche le due barre che stanno **sopra** il corpo — quella della richiesta di riunione (`invito_da_messaggio`) e quella delle conferme di lettura/recapito (`conferme_stato`) — così che un'azione su un messaggio aperto non le faccia sparire fino all'azione successiva.

**Architecture:** È l'ultimo difetto della famiglia aperta dal blocco S. `renderReading` (`src/views/main-view.js`) ricostruisce il pannello da capo (`root.replaceChildren()`), quindi tutto ciò che non sta nel modello del messaggio va rimesso dal chokepoint `renderLettura` (`src/main.js`). Il blocco S aveva provveduto per il corpo (`corpoCorrente` + `ripristinaCorpo`); qui si fa lo stesso per le due barre, con **una differenza sostanziale**: il corpo è un dato che arriva una volta e non cambia, mentre le due barre portano **stato** che il kernel ricalcola e che l'utente modifica rispondendo. Quindi non basta conservare l'HTML: si conserva l'ultimo stato **disegnato** — risposta compresa — invece di interrogare di nuovo il kernel a ogni disegno (sarebbe una chiamata di rete per un disegno, la ragione già addotta per il corpo).

**Tech Stack:** JavaScript ES modules senza framework (`src/main.js`), `node --test tests/*.mjs` con jsdom, `cargo test --manifest-path src-tauri/Cargo.toml`.

**Spec:** `docs/plans/2026-10-12-outlook-clone-ia-v1.md`; il difetto è elencato in coda a `docs/superpowers/plans/2026-10-15-blocco-s-ridisegno-lettura.md` («Difetti della stessa famiglia, ancora aperti», primo punto).

## Global Constraints

- Tutto in italiano: interfaccia, commenti, messaggi di commit.
- TDD: prima il test che fallisce, poi l'implementazione minima, poi il commit.
- Ogni task termina coi test verdi: `node --test tests/*.mjs` e `cargo test --manifest-path src-tauri/Cargo.toml`.
- Nessun pulsante muto: la barra rimessa dal ridisegno deve avere i suoi ascoltatori, e dove l'azione non può partire (browser, senza kernel) va **dichiarato**, non taciuto.
- La copia conservata vale solo per il messaggio a cui appartiene: la stessa guardia `messaggio === msg` del blocco S.
- Nessuna seconda interrogazione del kernel per un disegno: si usa la copia.
- Prove visive senza Tauri: `python3 -m http.server 8099 --directory ~/outlook-ai-clone` poi `?view=…` (elenco in `docs/uso-e-prova.md`).

## Review Focus

1. **Risposta persa** — la barra ridisegnata da `barraInvito`/`barraConferma` dopo la risposta deve lasciare la copia allineata: altrimenti un ridisegno sul posto rimostra i pulsanti di una richiesta già decisa. Difesa: la copia si aggiorna dalla **stessa porta** che disegna (`applicaInvito`, `applicaConferme`). Test: «una conferma già decisa resta decisa dopo il ridisegno».
2. **Invito di un altro messaggio** — la copia va confrontata col messaggio ridisegnato, o si vedrebbe l'invito del primo nel pannello del secondo. Test: «il ridisegno di un altro messaggio non trascina l'invito conservato» — provato con la guardia **e** senza (mutazione), perché anche l'azzeramento in `apriMessaggio` maschera il difetto.
3. **Il secondo ingresso alla copia** — se un'altra via riscrive `invitoCorrente`/`confermeCorrente` fuori da `applica*`, le due fonti divergono. Difesa: le `disegna*` non toccano la copia; solo le `applica*` la scrivono.
4. **Ordine dei `prepend`** — entrambe le barre si mettono in cima: l'ordine dev'essere lo stesso dell'apertura (prima l'invito, poi le conferme), o le due barre si scambiano di posto a ogni ridisegno.
5. **Allegati dopo il ridisegno** — `collegaInvito` leggeva gli allegati dal parametro `corpo`, che dopo un ridisegno non esiste più: passa a `corpoCorrente.allegati` (con guardia), una sola fonte come `stileLetturaCorrente`.

---

### Task 1: Le prove che il ridisegno perde le due barre

Prima di toccare il codice, le prove che oggi falliscono. Il kernel finto di `tests/lettura-persistenza.test.mjs` diventa configurabile: `invitoDelKernel`, `confermeDelKernel`, `allegatiDelKernel`, riportati al caso vuoto da `beforeEach`.

**Files:**
- Test: `tests/lettura-persistenza.test.mjs`

**Interfaces:**
- Kernel finto: `invito_da_messaggio` → `invitoDelKernel`; `conferme_stato` → `confermeDelKernel`; `conferma_rispondi` → registra la scelta in `confermeDelKernel` e restituisce l'esito, come il kernel vero.
- Aiutanti: `allegatoCalendario()` (un `text/calendar`, la spia con cui `collegaInvito` decide), `invito(extra)`.

- [x] Rosso: quattro casi falliscono — invito perso; pulsanti dell'invito muti; conferme perse; conferma già decisa che torna a chiedere.
- [x] Sesto e settimo caso (guardie): l'invito e le conferme del primo messaggio non compaiono nel pannello ridisegnato per un altro — ridisegno **sullo stesso nodo**, senza ripassare da `apriMessaggio`, così decide solo il confronto.
- [x] Mutazione: tolto il solo confronto `messaggio !== msg`, i casi di guardia falliscono; tolto il passaggio del messaggio a `disegnaInvito`, fallisce la risposta data dopo il ridisegno.

### Task 2: Le copie conservate accanto a `corpoCorrente`

**Files:**
- Modify: `src/main.js` — stato `invitoCorrente` e `confermeCorrente`; `renderLettura` che le rimette; `apriMessaggio` che le azzera.

**Interfaces:**
- `invitoCorrente = { messaggio, invito }`; `confermeCorrente = { messaggio, statoConferme, dove }` con `dove = { folder, uid, accountId }` — come raggiungere il messaggio nel kernel, che serve alla barra rimessa dal ridisegno per non restare muta.
- `ripristinaInvito(el, msg)` / `ripristinaConferme(el, msg)` — sincrone, nessuna interrogazione del kernel, guardia sul messaggio.

- [x] `renderLettura` rimette le due barre accanto a `ripristinaCorpo`.
- [x] `apriMessaggio` azzera le due copie col corpo, così non trapelano da un messaggio all'altro.
- [x] L'ordine dei `prepend` resta quello dell'apertura.

### Task 3: Una sola porta d'ingresso a ciascuna copia

**Files:**
- Modify: `src/main.js` — `applicaInvito` / `disegnaInvito`, `applicaConferme` / `disegnaConferme`; `collegaInvito` che perde il parametro `corpo`; `collegaConferme` che prende `readingEl`.

- [x] `collegaInvito` legge gli allegati da `corpoCorrente.allegati` (guardia sul messaggio): una sola fonte, come `stileLetturaCorrente`.
- [x] La risposta aggiorna la copia: l'invito da `onRispondi` di `barraInvito`, le conferme ripassando da `applicaConferme` con lo stato riletto.
- [x] La barra rimessa dal ridisegno ha i suoi ascoltatori: `dove` viaggia con la copia.
- [x] Le due prove visive passano dal percorso nuovo: `?view=invito` → `disegnaInvito` (senza messaggio, nulla da conservare); `?view=conferma` → `disegnaConferme` con `dove` nullo, e i pulsanti **dichiarano** che fuori dall'app la conferma non parte, invece di restare muti.

### Task 4: Verifica

- [x] `node --test tests/*.mjs` → **332 prove, 0 fallite** (324 prima + 8 nuove).
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` → **357 prove, 0 fallite**, invariato: nessuna modifica al kernel.
- [x] Browser (Chrome DevTools MCP, server statico sulla 8099): `?view=conferma` rende la barra e «Invia la conferma» scrive «Prova visiva: conferma non inviata (solo dentro l'app).» — prima era muto; `?view=invito` rende la barra con Accetta / Tentativo / Rifiuta / Apri l'agenda.
- [ ] **Prova manuale dentro l'app** su un messaggio con invito e su uno con conferma: aprirlo → «Categorizza» → le due barre restano e i loro pulsanti rispondono. L'agente non può eseguirla: servono i permessi di Registrazione schermo/Accessibilità.

## Difetti della stessa famiglia, ancora aperti

- **La ricerca non porta l'account**: `RisultatoRicerca` (`src-tauri/src/lib.rs`) non ha il campo, quindi `daRigaRicercaKernel` non può farne a meno. È una mancanza **lato kernel**, non un campo scartato in JavaScript: azioni su un risultato di ricerca in vista aggregata ricadono sulla selezione attiva. Da valutare a parte (già annotato in coda al piano del blocco S).
- **I `sampleMessages` non portano `account`/`folder`** (`src/views/main-view.js`): usano `id` invece di `uid` e non hanno corpo, quindi la prova visiva nel browser resta infedele al contratto del kernel — è la ragione per cui il blocco «Seleziona una casella nella barra laterale» compare ancora lì. Lacuna di dati, non di codice.
