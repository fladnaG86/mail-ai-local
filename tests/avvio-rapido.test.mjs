/**
 * All'avvio la posta già in cache si vede subito, come in Outlook: la rete non
 * blocca la prima schermata. Prima, con «Sincronizza all'avvio» attiva, `boot()`
 * aspettava l'intera sincronizzazione IMAP (e un LIST delle cartelle) prima di
 * mostrare la lista: per molti secondi si vedevano le cartelle d'esempio e
 * «Nessun account configurato». Ora la sincronizzazione parte dopo, in
 * background, con la barra di avanzamento, e a fine lavoro la lista si aggiorna
 * senza perdere il messaggio aperto.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
const GRUPPO = {
  account: ACCOUNT, email: ACCOUNT, predefinito: true,
  cartelle: [{ nome: "INBOX", preferita: false, nonLetti: 1 }],
};
const riga = (uid, subject) => ({
  uid, account: ACCOUNT, folder: "INBOX", from: "Luca Bianchi <luca@esempiohost.it>",
  subject, date: 1_760_000_000 + Number(uid), seen: true, hasAttachments: false,
});
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

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

/** Un'app nuova. `mail_sync` resta appeso finché non si chiama `sbloccaSync()`. */
async function avvia({ syncAllAvvio = true, posta = [riga("1", "Prima"), riga("2", "Seconda")] } = {}) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const chiamate = [];
  let sblocca = () => {};
  let righe = posta;
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        chiamate.push({ nome, args });
        if (nome === "impostazioni_leggi") return { preferenze: { syncAllAvvio, raggruppaConversazioni: false } };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "cartelle_elenco") return [GRUPPO];
        if (nome === "mail_list") return righe;
        if (nome === "mail_sync") {
          await new Promise((r) => { sblocca = r; });
          return { folders: [] };
        }
        if (nome === "mail_body") return { html: "<p>corpo</p>", text: "corpo", attachments: [] };
        if (["inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  // `boot` non deve restare appeso alla sincronizzazione: si dà un limite.
  const finito = await Promise.race([
    main.boot().then(() => true),
    new Promise((r) => setTimeout(() => r(false), 300)),
  ]);
  // La sincronizzazione parte in background: si lascia che arrivi al kernel.
  await attendi();
  const doc = w.document;
  return {
    w, doc, chiamate, finito,
    sbloccaSync: async () => { sblocca(); await attendi(20); },
    nuovaPosta: (r) => { righe = r; },
    lista: () => doc.querySelector("#message-list").textContent,
    rigaUid: (uid) => doc.querySelector(`#message-list .row[data-uid="${uid}"]`),
  };
}

test("con «Sincronizza all'avvio» la posta in cache si vede prima che la sincronizzazione finisca", async () => {
  const x = await avvia();
  assert.equal(x.finito, true, "boot() aspetta la sincronizzazione IMAP prima di mostrare la cache");
  assert.match(x.lista(), /Prima/);
  assert.ok(x.chiamate.some((c) => c.nome === "mail_sync"), "premessa: la sincronizzazione all'avvio parte");
  await x.sbloccaSync();
});

test("all'avvio l'elenco delle cartelle viene dalla cache, senza interrogare il server", async () => {
  const x = await avvia();
  const prima = x.chiamate.find((c) => c.nome === "cartelle_elenco");
  assert.ok(prima, "premessa: le cartelle si caricano");
  assert.equal(prima.args && prima.args.soloCache, true);
  await x.sbloccaSync();
});

test("durante la sincronizzazione all'avvio si vede la barra di avanzamento", async () => {
  const x = await avvia();
  await attendi();
  assert.equal(x.doc.querySelector("#sync-progress").hidden, false);
  await x.sbloccaSync();
});

test("a sincronizzazione finita compare la posta nuova", async () => {
  const x = await avvia();
  x.nuovaPosta([riga("3", "Arrivata adesso"), riga("1", "Prima"), riga("2", "Seconda")]);
  await x.sbloccaSync();
  assert.match(x.lista(), /Arrivata adesso/);
});

test("la sincronizzazione all'avvio non cambia il messaggio che si sta leggendo", async () => {
  const x = await avvia();
  x.rigaUid("2").click();
  await attendi();
  await x.sbloccaSync();
  const letto = x.doc.querySelector("#reading-pane .mail-subject");
  assert.equal(letto && letto.textContent, "Seconda");
  assert.ok(x.rigaUid("2").classList.contains("row--sel"), "la riga letta non è più selezionata");
});

test("senza «Sincronizza all'avvio» all'avvio non si sincronizza", async () => {
  const x = await avvia({ syncAllAvvio: false });
  assert.equal(x.finito, true);
  assert.equal(x.chiamate.some((c) => c.nome === "mail_sync" || c.nome === "mail_sync_tutti"), false);
});

test("prima del caricamento la barra di stato non dice «Nessun account configurato»", () => {
  const doc = new JSDOM(HTML).window.document;
  assert.doesNotMatch(doc.querySelector("#status-account").textContent, /Nessun account configurato/);
});
