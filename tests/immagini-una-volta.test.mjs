/**
 * «Mostra immagini» si propone una sola volta per messaggio: dopo il clic il
 * pulsante sparisce, e riaprendo il messaggio (il kernel ricorda il consenso e
 * manda il corpo con `immaginiBloccate: false`) non torna. Non compare neppure
 * quando il corpo non ha immagini remote da mostrare.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let window_;
let main;
let pane;
const invocazioni = [];
/** Cosa dice il kernel finto del corpo: ci sono immagini remote bloccate? */
let bloccate = true;

function kernel() {
  return {
    core: {
      invoke: async (nome, args) => {
        invocazioni.push({ nome, args });
        if (nome === "mail_body") {
          return { html: "<p>Newsletter</p>", text: "Newsletter", attachments: [], immaginiBloccate: bloccate };
        }
        if (nome === "mail_body_con_immagini") {
          // Come il kernel vero: da qui in poi il consenso resta per il messaggio.
          bloccate = false;
          return { html: '<p>Newsletter</p><img src="https://esempiohost.it/logo.png">', text: "Newsletter", attachments: [], immaginiBloccate: false };
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
  Object.defineProperty(window_.document, "readyState", { value: "loading", configurable: true });
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window_.__TAURI__ = kernel();
  globalThis.window = window_;
  globalThis.document = window_.document;
  main = await import("../src/main.js");
});

beforeEach(() => {
  invocazioni.length = 0;
  bloccate = true;
  pane = window_.document.querySelector("#reading-pane");
  pane.replaceChildren();
});

function messaggio() {
  return {
    uid: "42", account: "mario.rossi@esempiogroup.it", folder: "INBOX",
    from: "Luca Bianchi <luca@esempiohost.it>", subject: "Newsletter",
    date: "", timestamp: 1, seen: true, flagged: false, has_attachments: false,
  };
}

const lasciaGirare = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};
const pulsante = () => pane.querySelector(".mail-body-tools .mail-btn");

test("con immagini remote bloccate il pulsante «Mostra immagini» c'è", async () => {
  await main.apriMessaggio(pane, messaggio());
  assert.ok(pulsante());
});

test("dopo il clic su «Mostra immagini» il pulsante sparisce", async () => {
  await main.apriMessaggio(pane, messaggio());
  pulsante().dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();
  assert.ok(invocazioni.some((i) => i.nome === "mail_body_con_immagini"), "premessa: il consenso è arrivato al kernel");
  assert.equal(pulsante(), null);
});

test("riaprendo un messaggio già consentito il pulsante non si ripropone", async () => {
  await main.apriMessaggio(pane, messaggio());
  pulsante().dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();
  await main.apriMessaggio(pane, messaggio());
  assert.equal(pulsante(), null);
});

test("dopo il clic un ridisegno sul posto non rimette il pulsante", async () => {
  const m = messaggio();
  await main.apriMessaggio(pane, m);
  pulsante().dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));
  await lasciaGirare();
  main.renderLettura(pane, m);
  assert.equal(pulsante(), null);
});

test("un corpo senza immagini remote non propone il pulsante", async () => {
  bloccate = false;
  await main.apriMessaggio(pane, messaggio());
  assert.equal(pulsante(), null);
});
