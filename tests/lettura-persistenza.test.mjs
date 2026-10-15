/**
 * Test del ridisegno **sul posto** del pannello di lettura (prima prova con DOM
 * vero, jsdom).
 *
 * Perché servono: le azioni su un messaggio aperto (segna come letto,
 * categorizza, contrassegna, completa) ridisegnano il pannello con
 * `renderLettura` → `renderReading`, che ricostruisce il pannello da capo. Il
 * corpo del messaggio però non sta nel modello: arriva dal kernel una volta sola
 * (`mail_body`) e vive dentro l'iframe. Senza ripristino il ridisegno lo perde e
 * al suo posto resta il segnaposto «(corpo del messaggio)». Per la stessa
 * ragione la barra dell'Assistente viene ricostruita senza i suoi ascoltatori, e
 * i quattro pulsanti IA diventano muti.
 *
 * Blocco T: stessa famiglia per le due barre in cima al pannello — quella
 * dell'invito di riunione (`invito_da_messaggio`) e quella delle conferme di
 * lettura/recapito (`conferme_stato`). Diversamente dal corpo, il loro contenuto
 * è **stato** che il kernel ricalcola: si conserva accanto a `corpoCorrente`
 * invece di richiederlo di nuovo a ogni disegno.
 *
 * I test parlano col kernel finto (`window.__TAURI__`), così il percorso è
 * quello vero dell'app e non la scorciatoia del browser.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let window_;
let document_;
let main;
let pane;
const invocazioni = [];

/**
 * Cosa risponde il kernel finto ai due comandi che non hanno una risposta fissa
 * — l'invito del messaggio aperto (`invito_da_messaggio`) e lo stato delle
 * conferme (`conferme_stato`) — e quali allegati porta il corpo. Ogni test li
 * imposta prima di aprire il messaggio; `beforeEach` li riporta al caso
 * «nessun invito, nessuna conferma, nessun allegato».
 */
let invitoDelKernel = null;
let confermeDelKernel = null;
/** Gli allegati del corpo: un `text/calendar` è ciò che fa chiedere l'invito. */
let allegatiDelKernel = [];

/** Kernel finto: risponde ai pochi comandi che servono al pannello di lettura. */
function kernel() {
  return {
    core: {
      invoke: async (nome, args) => {
        invocazioni.push({ nome, args });
        if (nome === "mail_body") {
          return {
            html: "<p>CORPO-REALE-DAL-KERNEL</p>",
            text: "CORPO-REALE-DAL-KERNEL",
            attachments: allegatiDelKernel,
          };
        }
        if (nome === "ai_azione") {
          return { testo: "Riassunto di prova.", modello: "finto", provider: "locale" };
        }
        if (nome === "invito_da_messaggio") return invitoDelKernel;
        if (nome === "conferme_stato") return confermeDelKernel;
        if (nome === "conferma_rispondi") {
          // Come il kernel vero: registrata la scelta, lo stato la riporta.
          confermeDelKernel = Object.assign({}, confermeDelKernel, { letturaInviata: args.invia });
          return "Conferma di lettura inviata.";
        }
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        return null;
      },
    },
  };
}

before(async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <main class="main">
         <div id="message-list"></div>
         <div id="reading-pane"></div>
         <div id="status-count"></div>
         <div id="status-sync"></div>
         <div id="status-account"></div>
       </main>
     </body></html>`,
    { url: "http://localhost/" },
  );
  window_ = dom.window;
  document_ = window_.document;
  // Il bootstrap dell'app non deve partire: qui si prova il solo pannello.
  Object.defineProperty(document_, "readyState", { value: "loading", configurable: true });
  // jsdom non ha `matchMedia`: `theme.js` lo interroga appena importato.
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window_.__TAURI__ = kernel();
  globalThis.window = window_;
  globalThis.document = document_;

  main = await import("../src/main.js");
});

beforeEach(() => {
  invocazioni.length = 0;
  invitoDelKernel = null;
  confermeDelKernel = null;
  allegatiDelKernel = [];
  pane = document_.querySelector("#reading-pane");
  pane.replaceChildren();
});

/** Un messaggio come lo consegna il kernel (niente `body`: quello arriva dopo). */
function messaggio(extra = {}) {
  return Object.assign(
    {
      uid: 7,
      folder: "INBOX",
      account: "mario.rossi@esempiogroup.it",
      subject: "Piano manutenzione Q4",
      from: "Mario Rossi",
      to: "Mario",
      date: "oggi",
      seen: true,
    },
    extra,
  );
}

/** Un allegato `text/calendar`: è la spia con cui `collegaInvito` decide. */
function allegatoCalendario() {
  return { mime: "text/calendar", name: "invito.ics", indice: 0 };
}

/** Un invito come lo consegna `invito_da_messaggio` (solo i campi che si leggono). */
function invito(extra = {}) {
  return Object.assign(
    {
      id: 1,
      uid: "riunione-q4@esempiogroup.it",
      sequenza: 0,
      oggetto: "Piano manutenzione Q4",
      organizzatore: "luca.bianchi@esempiogroup.it",
      organizzatoreNome: "Luca Bianchi",
      inizio: 1793000000,
      fine: 1793003600,
      giornataIntera: false,
      luogo: "Sala 1",
      stato: "in_attesa",
      metodo: "REQUEST",
      invitati: [],
      uscita: false,
    },
    extra,
  );
}

/** Lascia girare i microtask perché le azioni del pannello sono asincrone. */
async function lasciaGirare() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

test("aprendo un messaggio il corpo arriva dal kernel dentro l'iframe", async () => {
  await main.apriMessaggio(pane, messaggio());
  const frame = pane.querySelector(".mail-frame");
  assert.ok(frame, "l'iframe del corpo non è stato creato");
  assert.match(frame.getAttribute("srcdoc") || "", /CORPO-REALE-DAL-KERNEL/);
});

test("un ridisegno sul posto non perde il corpo del messaggio", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  assert.ok(pane.querySelector(".mail-frame"), "premessa: il corpo c'era");

  // È quello che fanno «segna come letto», categorizza, contrassegna, completa.
  main.renderLettura(pane, m);

  const frame = pane.querySelector(".mail-frame");
  assert.ok(frame, "il ridisegno ha perso il corpo: manca l'iframe");
  assert.match(
    frame.getAttribute("srcdoc") || "",
    /CORPO-REALE-DAL-KERNEL/,
    "il ridisegno ha perso il corpo: l'iframe è tornato al segnaposto",
  );
});

test("dopo un ridisegno sul posto i pulsanti dell'Assistente rispondono ancora", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  main.renderLettura(pane, m);

  const bottone = pane.querySelector('[data-ai="summarize"]');
  assert.ok(bottone, "il pulsante Riassumi non c'è");
  bottone.dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  assert.ok(
    pane.querySelector(".ai-card"),
    "il pulsante Riassumi è muto dopo il ridisegno: nessuna scheda",
  );
});

test("«Completa» aggiorna la barra informativa del pannello aperto", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  assert.equal(
    pane.querySelector(".info-bar"),
    null,
    "premessa: un messaggio non completato non porta la barra informativa",
  );

  await main.alternaCompletato();

  assert.equal(m.completed, true, "l'interruttore non ha segnato il messaggio come completato");
  const barra = pane.querySelector(".info-bar");
  assert.ok(barra, "il pannello aperto non è stato aggiornato: manca la barra informativa");
  assert.match(barra.textContent, /Completato/);
});

test("dopo un ridisegno sul posto «Mostra immagini» chiama ancora il kernel", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  main.renderLettura(pane, m);

  const bottone = pane.querySelector(".mail-body-tools .mail-btn");
  assert.ok(bottone, "il pulsante «Mostra immagini» non c'è");
  invocazioni.length = 0;
  bottone.dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  assert.ok(
    invocazioni.some((i) => i.nome === "mail_body_con_immagini"),
    "il pulsante «Mostra immagini» è muto dopo il ridisegno",
  );
});

test("dopo un ridisegno sul posto il selettore locale/cloud cambia la destinazione", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  main.renderLettura(pane, m);

  const selettore = pane.querySelector(".ai-model-select");
  assert.ok(selettore, "il selettore della destinazione non c'è");
  selettore.value = "cloud";
  selettore.dispatchEvent(new window_.Event("change", { bubbles: true }));

  pane
    .querySelector('[data-ai="summarize"]')
    .dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  // Sulla destinazione cloud la conferma è obbligatoria e precede la chiamata:
  // se compare, il selettore ha davvero cambiato `destinazioneIA`.
  const consenso = document_.querySelector(".consenso-velo");
  assert.ok(consenso, "il selettore è muto: nessuna conferma per il cloud è comparsa");
  assert.equal(
    invocazioni.filter((i) => i.nome === "ai_azione").length,
    0,
    "nulla può partire prima del consenso dell'utente",
  );
  consenso.querySelector(".consenso-si").dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  const scelta = invocazioni.filter((i) => i.nome === "ai_azione").pop();
  assert.ok(scelta, "col consenso dato l'azione deve partire");
  assert.equal(scelta.args.provider, "cloud", "il selettore non ha cambiato la destinazione");
});

// ---------------------------------------------------------------------------
// Blocco T — le barre in cima al pannello
// ---------------------------------------------------------------------------

test("l'invito resta dopo un ridisegno sul posto, senza richiederlo di nuovo", async () => {
  allegatiDelKernel = [allegatoCalendario()];
  invitoDelKernel = invito();
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  assert.ok(pane.querySelector(".invito-bar"), "premessa: la barra dell'invito c'era");

  invocazioni.length = 0;
  main.renderLettura(pane, m);

  const barra = pane.querySelector(".invito-bar");
  assert.ok(barra, "il ridisegno ha perso la barra dell'invito");
  assert.match(barra.textContent, /Luca Bianchi/, "la barra ripristinata è vuota o sbagliata");
  assert.equal(
    invocazioni.filter((i) => i.nome === "invito_da_messaggio").length,
    0,
    "l'invito è stato richiesto di nuovo al kernel: doveva venire dalla copia conservata",
  );
});

test("dopo un ridisegno la barra dell'invito risponde ancora all'organizzatore", async () => {
  allegatiDelKernel = [allegatoCalendario()];
  invitoDelKernel = invito();
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  main.renderLettura(pane, m);

  invocazioni.length = 0;
  pane
    .querySelector('.invito-bar [data-risp="accettato"]')
    .dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  assert.ok(
    invocazioni.some((i) => i.nome === "invito_rispondi"),
    "i pulsanti della barra sono muti dopo il ridisegno",
  );
});

test("l'invito di un altro messaggio non compare nel pannello ridisegnato", async () => {
  allegatiDelKernel = [allegatoCalendario()];
  invitoDelKernel = invito();
  const primo = messaggio({ uid: 7 });
  await main.apriMessaggio(pane, primo);

  // Secondo messaggio senza invito: la copia conservata è ancora quella del
  // primo e non deve trapelare nel suo pannello.
  invitoDelKernel = null;
  const secondo = messaggio({ uid: 8, subject: "Altro messaggio" });
  await main.apriMessaggio(pane, secondo);
  main.renderLettura(pane, secondo);

  assert.equal(
    pane.querySelector(".invito-bar"),
    null,
    "nel secondo messaggio è comparso l'invito del primo",
  );
});

test("il ridisegno di un altro messaggio non trascina l'invito conservato", async () => {
  allegatiDelKernel = [allegatoCalendario()];
  invitoDelKernel = invito();
  const primo = messaggio({ uid: 7 });
  await main.apriMessaggio(pane, primo);
  assert.ok(pane.querySelector(".invito-bar"), "premessa: l'invito del primo c'era");

  // Ridisegno sullo **stesso** nodo ma per un altro messaggio, senza ripassare da
  // `apriMessaggio` (che azzera le copie): qui decide solo il confronto.
  const secondo = messaggio({ uid: 8, subject: "Altro messaggio" });
  main.renderLettura(pane, secondo);

  assert.equal(
    pane.querySelector(".invito-bar"),
    null,
    "la guardia sul messaggio non ha retto: è comparso l'invito del primo",
  );
});

test("una risposta data dopo il ridisegno non si perde", async () => {
  allegatiDelKernel = [allegatoCalendario()];
  invitoDelKernel = invito();
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  // Il ridisegno rimette la barra: è **questa** copia che deve ricordare la
  // risposta, ed è il punto in cui la barra rimessa può perdere il collegamento
  // alla copia conservata.
  main.renderLettura(pane, m);

  pane
    .querySelector('.invito-bar [data-risp="rifiutato"]')
    .dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  main.renderLettura(pane, m);

  const barra = pane.querySelector(".invito-bar");
  assert.ok(barra, "il ridisegno ha perso la barra dell'invito");
  assert.match(barra.textContent, /Rifiutato/, "la barra è tornata a chiedere una risposta già data");
  assert.equal(
    barra.querySelector('[data-risp="accettato"]'),
    null,
    "dopo la risposta i pulsanti non devono ricomparire",
  );
});

test("le conferme restano dopo un ridisegno e i loro pulsanti rispondono", async () => {
  confermeDelKernel = { lettura: true, recapito: false };
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  assert.ok(pane.querySelector(".i2-conferma"), "premessa: la barra delle conferme c'era");

  invocazioni.length = 0;
  main.renderLettura(pane, m);

  assert.ok(pane.querySelector(".i2-conferma"), "il ridisegno ha perso la barra delle conferme");
  assert.equal(
    invocazioni.filter((i) => i.nome === "conferme_stato").length,
    0,
    "lo stato delle conferme è stato richiesto di nuovo: doveva venire dalla copia",
  );

  pane
    .querySelector(".i2-conferma .i2-conf-invia")
    .dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  assert.ok(
    invocazioni.some((i) => i.nome === "conferma_rispondi" && i.args.invia === true),
    "i pulsanti della barra delle conferme sono muti dopo il ridisegno",
  );
});

test("il ridisegno di un altro messaggio non trascina le conferme conservate", async () => {
  confermeDelKernel = { lettura: true, recapito: false };
  const primo = messaggio({ uid: 7 });
  await main.apriMessaggio(pane, primo);
  assert.ok(pane.querySelector(".i2-conferma"), "premessa: la conferma del primo c'era");

  // Come sopra: ridisegno sullo stesso nodo per un altro messaggio, senza
  // ripassare da `apriMessaggio`. Qui decide solo la guardia.
  const secondo = messaggio({ uid: 8, subject: "Altro messaggio" });
  main.renderLettura(pane, secondo);

  assert.equal(
    pane.querySelector(".i2-conferma"),
    null,
    "la guardia sul messaggio non ha retto: è comparsa la conferma del primo",
  );
});

test("una conferma già decisa resta decisa dopo il ridisegno", async () => {
  confermeDelKernel = { lettura: true, recapito: false };
  const m = messaggio();
  await main.apriMessaggio(pane, m);

  // Si risponde dalla barra: da qui in poi lo stato conservato è quello deciso.
  pane
    .querySelector(".i2-conferma .i2-conf-invia")
    .dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();

  main.renderLettura(pane, m);

  const barra = pane.querySelector(".i2-conferma");
  assert.ok(barra, "il ridisegno ha perso la barra delle conferme");
  assert.match(barra.textContent, /inviata/, "la barra è tornata a chiedere una conferma già data");
  assert.equal(
    pane.querySelector(".i2-conf-invia"),
    null,
    "dopo la scelta i pulsanti non devono ricomparire",
  );
});
