/**
 * Una cartella senza posta (es. «Drafts») con una casella configurata non è
 * «Nessun account configurato»: è una cartella vuota, e lo deve dire. Lo stato
 * «Nessun account configurato» resta solo quando davvero non c'è una casella.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
const GRUPPO = {
  account: ACCOUNT,
  email: ACCOUNT,
  predefinito: true,
  cartelle: [
    { nome: "INBOX", preferita: false, nonLetti: 1 },
    { nome: "Drafts", preferita: false, nonLetti: 0 },
  ],
};
const RIGA = {
  uid: "1", account: ACCOUNT, folder: "INBOX", from: "Luca Bianchi <luca@esempiohost.it>",
  subject: "Ciao", date: "", timestamp: 1, seen: false, flagged: false, has_attachments: false,
};
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

/** Un'app nuova: `gruppi` sono le caselle del kernel, `posta` la posta per cartella. */
async function avvia({ gruppi, posta }) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        if (nome === "impostazioni_leggi") return { preferenze: { raggruppaConversazioni: false } };
        if (nome === "account_list") return gruppi.map((g) => ({ id: g.account, email: g.email }));
        if (nome === "cartelle_elenco") return gruppi;
        if (nome === "mail_list") return posta[args.folder] || [];
        if (nome === "mail_conversazioni") return [];
        if (["inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  const doc = w.document;
  return {
    doc,
    lista: () => doc.querySelector("#message-list").textContent,
    entra: async (cartella) => {
      doc.querySelector("#sidebar").dispatchEvent(
        new w.CustomEvent("folder-selected", { detail: { account: ACCOUNT, cartella } }),
      );
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    },
  };
}

test("entrando in una cartella vuota con la casella configurata non dice «Nessun account configurato»", async () => {
  const x = await avvia({ gruppi: [GRUPPO], posta: { INBOX: [RIGA] } });
  await x.entra("Drafts");
  assert.doesNotMatch(x.lista(), /Nessun account configurato/);
  assert.match(x.lista(), /Nessun elemento/);
});

test("all'avvio su una cartella vuota con la casella configurata dice che è vuota", async () => {
  const x = await avvia({ gruppi: [GRUPPO], posta: {} });
  assert.doesNotMatch(x.lista(), /Nessun account configurato/);
  assert.match(x.lista(), /Nessun elemento/);
});

test("senza nessuna casella resta «Nessun account configurato» col pulsante per configurarla", async () => {
  const x = await avvia({ gruppi: [], posta: {} });
  assert.match(x.lista(), /Nessun account configurato/);
  assert.ok(x.doc.querySelector("#message-list .lista-vuota button"));
});

test("tornando in una cartella con posta la lista la mostra di nuovo", async () => {
  const x = await avvia({ gruppi: [GRUPPO], posta: { INBOX: [RIGA] } });
  await x.entra("Drafts");
  await x.entra("INBOX");
  assert.match(x.lista(), /Ciao/);
});
