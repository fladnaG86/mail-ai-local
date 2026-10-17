/**
 * «Nuova cartella» dal clic destro, come in Outlook: su una cartella crea la
 * nuova **dentro** quella cartella, sull'account la crea al primo livello. Prima
 * il genitore era sempre nullo (`kind === "group" ? null : null`).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
const GRUPPO = {
  account: ACCOUNT, email: ACCOUNT, predefinito: true,
  cartelle: [
    { nome: "INBOX", preferita: false, nonLetti: 0 },
    { nome: "INBOX.Drafts", preferita: false, nonLetti: 0 },
  ],
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

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const create = [];
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        if (nome === "impostazioni_leggi") return { preferenze: { raggruppaConversazioni: false } };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "cartelle_elenco") return [GRUPPO];
        if (nome === "cartella_crea") {
          create.push(args);
          return `Cartella «${args.nome}» creata.`;
        }
        if (["mail_list", "mail_conversazioni", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  const doc = w.document;
  /** Clic destro su `nodo`, «Nuova cartella», scrive `nome` e conferma. */
  const nuova = async (nodo, nome) => {
    nodo.dispatchEvent(new w.MouseEvent("contextmenu", { clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
    const voce = [...doc.querySelectorAll(".rb-menu .rb-menu-voce")].find((b) => /Nuova cartella/.test(b.textContent));
    voce.click();
    await attendi();
    const campo = doc.querySelector(".i1-modale-input");
    campo.value = nome;
    const conferma = [...doc.querySelectorAll("button")].find((b) => b.textContent.trim() === "Conferma");
    conferma.click();
    await attendi(20);
  };
  return { doc, create, nuova };
}

test("su una cartella «Nuova cartella» la crea dentro quella cartella", async () => {
  const x = await avvia();
  const inbox = [...x.doc.querySelectorAll("#sidebar .folder")].find((n) => /^INBOX\s*\d*$/.test(n.textContent.trim()));
  assert.ok(inbox, "premessa: INBOX è in barra laterale");
  await x.nuova(inbox, "Clienti");
  assert.deepEqual(x.create.map((c) => [c.nome, c.genitore]), [["Clienti", "INBOX"]]);
});

test("sull'account «Nuova cartella» la crea al primo livello (decide il kernel dove)", async () => {
  const x = await avvia();
  const gruppo = [...x.doc.querySelectorAll("#sidebar .folder")].find((n) => n.textContent.includes(ACCOUNT));
  assert.ok(gruppo, "premessa: il nodo dell'account è in barra laterale");
  await x.nuova(gruppo, "Clienti");
  assert.deepEqual(x.create.map((c) => [c.nome, c.genitore]), [["Clienti", null]]);
});
