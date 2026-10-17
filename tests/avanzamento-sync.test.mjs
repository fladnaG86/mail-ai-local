/**
 * Avanzamento di «Invia e ricevi» nella barra di stato, come in Outlook: una
 * barra che si riempie cartella per cartella, col nome della cartella in corso.
 * Il kernel emette `sync-avanzamento` prima di ogni cartella; finché non arriva
 * il primo evento la barra è indeterminata (strisce che scorrono).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { statoAvanzamento, etichettaCartellaSync } from "../src/views/avanzamento-sync.js";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const LAVORO = { id: "mario.rossi@esempiogroup.it", email: "mario.rossi@esempiogroup.it" };
const CASA = { id: "mario@esempiohost.it", email: "mario@esempiohost.it" };

// --- funzioni pure -----------------------------------------------------------

test("INBOX si legge «Posta in arrivo», le altre cartelle col loro nome", () => {
  assert.equal(etichettaCartellaSync("INBOX"), "Posta in arrivo");
  assert.equal(etichettaCartellaSync("Posta inviata"), "Posta inviata");
});

test("una casella: la frazione lascia l'ultimo passo all'aggiornamento dell'elenco", () => {
  const s = statoAvanzamento({ account: LAVORO.id, cartella: "INBOX", indice: 0, totale: 3 }, [LAVORO]);
  assert.equal(s.frazione, 1 / 4);
  assert.equal(s.testo, "Invia e ricevi — Posta in arrivo (1 di 3)");
});

test("più caselle: la seconda casella parte da metà barra e il testo la nomina", () => {
  const s = statoAvanzamento({ account: CASA.id, cartella: "Bozze", indice: 0, totale: 1 }, [LAVORO, CASA]);
  assert.equal(s.frazione, (1 + 1 / 2) / 2);
  assert.equal(s.testo, "Invia e ricevi — mario@esempiohost.it (2 di 2): Bozze (1 di 1)");
});

test("un evento di una casella sconosciuta o con totale 0 non rompe la barra", () => {
  const s = statoAvanzamento({ account: "altro", cartella: "X", indice: 0, totale: 0 }, [LAVORO]);
  assert.ok(s.frazione >= 0 && s.frazione <= 1);
});

// --- DOM vero, kernel finto ---------------------------------------------------

let main;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.defineProperty(dom.window.document, "readyState", { value: "loading", configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  impostaGlobali(dom.window);
  main = await import("../src/main.js");
});

function impostaGlobali(w) {
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.location = w.location;
  globalThis.localStorage = w.localStorage;
  globalThis.KeyboardEvent = w.KeyboardEvent;
  globalThis.CustomEvent = w.CustomEvent;
}

/** Un'app nuova; `emetti(payload)` simula l'evento del kernel, `sbloccaSync()` chiude la sincronizzazione. */
async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const ascoltatori = {};
  let sblocca = () => {};
  w.__TAURI__ = {
    event: {
      listen: async (nome, f) => {
        ascoltatori[nome] = f;
        return () => {};
      },
    },
    core: {
      invoke: async (nome) => {
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        if (nome === "account_list") return [LAVORO];
        if (nome === "mail_sync") {
          await new Promise((r) => { sblocca = r; });
          return { folders: [] };
        }
        if (["cartelle_elenco", "mail_list", "mail_conversazioni", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  const doc = w.document;
  return {
    doc,
    barra: doc.querySelector("#sync-progress"),
    riempimento: doc.querySelector("#sync-progress .sync-progress-fill"),
    testo: () => doc.querySelector("#status-sync").textContent,
    emetti: (payload) => ascoltatori["sync-avanzamento"] && ascoltatori["sync-avanzamento"]({ payload }),
    sbloccaSync: () => sblocca(),
    clicSync: () => doc.querySelector('#ribbon-groups [data-rb="sync"]').click(),
  };
}

const attendi = () => new Promise((r) => setImmediate(r));

test("a riposo la barra di avanzamento non si vede", async () => {
  const x = await avvia();
  assert.ok(x.barra, "premessa: la barra esiste nella barra di stato");
  assert.equal(x.barra.hidden, true);
});

test("al clic su «Invia e ricevi» compare indeterminata, prima di ogni evento", async () => {
  const x = await avvia();
  x.clicSync();
  await attendi();
  assert.equal(x.barra.hidden, false);
  assert.ok(x.barra.classList.contains("sync-progress--indeterminato"));
  assert.equal(x.barra.getAttribute("role"), "progressbar");
  x.sbloccaSync();
});

test("un evento del kernel riempie la barra e nomina la cartella", async () => {
  const x = await avvia();
  x.clicSync();
  await attendi();
  x.emetti({ account: LAVORO.id, cartella: "INBOX", indice: 1, totale: 3 });
  assert.ok(!x.barra.classList.contains("sync-progress--indeterminato"));
  assert.equal(x.barra.getAttribute("aria-valuenow"), "50");
  assert.equal(x.riempimento.style.width, "50%");
  assert.equal(x.testo(), "Invia e ricevi — Posta in arrivo (2 di 3)");
  x.sbloccaSync();
});

test("a sincronizzazione finita la barra arriva in fondo e poi sparisce", async () => {
  const x = await avvia();
  x.clicSync();
  await attendi();
  x.emetti({ account: LAVORO.id, cartella: "INBOX", indice: 0, totale: 1 });
  x.sbloccaSync();
  for (let i = 0; i < 10; i++) await attendi();
  assert.equal(x.barra.getAttribute("aria-valuenow"), "100");
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(x.barra.hidden, true);
});

test("gli eventi della sincronizzazione automatica non accendono la barra", async () => {
  const x = await avvia();
  x.emetti({ account: LAVORO.id, cartella: "INBOX", indice: 0, totale: 2 });
  assert.equal(x.barra.hidden, true);
});
