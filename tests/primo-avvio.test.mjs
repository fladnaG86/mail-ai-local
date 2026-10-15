/**
 * Alla prima apertura dell'app, senza nessun account configurato, la finestra
 * di configurazione della casella si apre **da sola**: l'utente non deve
 * scoprire da un pulsante che la posta non arriva perché manca la casella.
 *
 * La finestra è la stessa di sempre (`apriAccount`, blocco J): campi IMAP e
 * SMTP, validazione, prova della connessione, password nel Portachiavi. Qui si
 * prova solo la condizione che la fa comparire all'avvio.
 *
 * Perché jsdom: questa è una decisione di `boot()`, non una funzione pura.
 * Il kernel finto risponde `account_list`.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let window_;
let document_;
let main;
/** Cosa risponde `account_list`: vuoto = prima apertura senza caselle. */
let accountDelKernel = [];

/** Kernel finto: il minimo per far girare `boot()` senza errori. */
function kernel() {
  return {
    core: {
      invoke: async (nome, args) => {
        if (nome === "account_list") return accountDelKernel;
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        if (nome === "cartelle_elenco") return [];
        if (nome === "mail_list") return [];
        if (nome === "inviti_elenco") return [];
        if (nome === "scadenze_voci") return [];
        if (nome === "conversazioni_ignorate") return [];
        if (nome === "registro_ia") return [];
        if (nome === "cartelle_registro") return [];
        void args;
        return null;
      },
    },
  };
}

before(async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="app">
         <div class="ribbon"><div id="ribbon-groups"></div></div>
         <div class="body">
           <div class="sidebar" id="sidebar"></div>
           <div class="main">
             <div id="message-list"></div>
             <div id="reading-pane"></div>
             <div id="status-count"></div>
             <div id="status-sync"></div>
             <div id="status-account"></div>
           </div>
         </div>
       </div>
     </body></html>`,
    { url: "http://localhost/" },
  );
  window_ = dom.window;
  document_ = window_.document;
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window_.__TAURI__ = kernel();
  globalThis.window = window_;
  globalThis.document = document_;
  // `theme.js` e `main.js` leggono `location` e `localStorage` come globi:
  // in jsdom vivono sul window, non su `globalThis`.
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
  main = await import("../src/main.js");
});

beforeEach(() => {
  accountDelKernel = [];
  document_.querySelectorAll("#acc-overlay").forEach((el) => el.remove());
});

/** Vero se la finestra di configurazione dell'account è aperta. */
function finestraAccountAperta() {
  return document_.querySelector("#acc-overlay") !== null;
}

test("senza account configurati la finestra di configurazione si apre da sola", async () => {
  accountDelKernel = [];
  await main.boot();
  assert.ok(
    finestraAccountAperta(),
    "alla prima apertura la finestra Account non si è aperta: l'utente vedrebbe solo uno stato vuoto",
  );
});

test("con un account già configurato la finestra non si apre", async () => {
  accountDelKernel = [
    {
      id: "mario.rossi@example.com",
      description: "Posta",
      fullName: "Mario Rossi",
      email: "mario.rossi@example.com",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapSsl: true,
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSsl: true,
    },
  ];
  await main.boot();
  assert.equal(
    finestraAccountAperta(),
    false,
    "la finestra si è aperta pur essendoci già una casella configurata",
  );
});

test("la finestra aperta da sola si può chiudere senza configurare nulla", async () => {
  accountDelKernel = [];
  await main.boot();
  const overlay = document_.querySelector("#acc-overlay");
  assert.ok(overlay, "premessa: la finestra si è aperta");

  // Esc: è il modo in cui `apriAccount` la chiude. Chi vuole solo guardare
  // l'interfaccia non deve restare intrappolato.
  overlay.dispatchEvent(new window_.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(finestraAccountAperta(), false, "la finestra non si chiude con Esc");
});
