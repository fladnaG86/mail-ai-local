/**
 * Blocco W3: posta in push lato interfaccia.
 *
 * - `testoStatoPush`: la frase del pannello per ogni stato del kernel.
 * - `creaRaggruppatore`: più avvisi ravvicinati della stessa casella danno una
 *   sola sincronizzazione; mai due insieme sulla stessa casella (un avviso che
 *   arriva durante la sincronizzazione ne provoca **una** dopo, non si perde).
 * - il pannello Sincronizzazione: la casella «push» salva `syncPush` e mostra gli stati.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { testoStatoPush, creaRaggruppatore } from "../src/views/push.js";

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

test("testoStatoPush: una frase per ogni stato", () => {
  assert.match(testoStatoPush({ stato: "attivo" }), /attivo/i);
  assert.match(testoStatoPush({ stato: "connessione" }), /connessione in corso/i);
  assert.match(testoStatoPush({ stato: "non_supportato" }), /non offre IDLE/);
  assert.match(
    testoStatoPush({ stato: "riconnessione", errore: "rete giù", traSecondi: 20 }),
    /rete giù.*20 s/,
  );
  assert.match(testoStatoPush({ stato: "errore", errore: "LOGIN rifiutato" }), /fermo.*LOGIN rifiutato/);
  assert.equal(testoStatoPush(null), "");
});

test("raggruppatore: tre avvisi ravvicinati → una sola sincronizzazione", async () => {
  const chiamate = [];
  const avvisa = creaRaggruppatore(async (k) => chiamate.push(k), 20);
  avvisa("a");
  avvisa("a");
  avvisa("a");
  await attesa(50);
  assert.deepEqual(chiamate, ["a"]);
});

test("raggruppatore: caselle diverse non si aspettano a vicenda", async () => {
  const chiamate = [];
  const avvisa = creaRaggruppatore(async (k) => chiamate.push(k), 10);
  avvisa("a");
  avvisa("b");
  await attesa(40);
  assert.deepEqual(chiamate.sort(), ["a", "b"]);
});

test("raggruppatore: un avviso durante la sincronizzazione ne provoca una sola dopo", async () => {
  let inCorso = 0;
  let massimo = 0;
  const chiamate = [];
  const avvisa = creaRaggruppatore(async (k) => {
    inCorso++;
    massimo = Math.max(massimo, inCorso);
    chiamate.push(k);
    await attesa(40);
    inCorso--;
  }, 5);
  avvisa("a");
  await attesa(15); // la prima è in corso
  avvisa("a");
  avvisa("a");
  await attesa(150);
  assert.equal(chiamate.length, 2, "una seconda, non due");
  assert.equal(massimo, 1, "mai due insieme sulla stessa casella");
});

test("raggruppatore: un errore non blocca le sincronizzazioni successive", async () => {
  let n = 0;
  const avvisa = creaRaggruppatore(async () => {
    n++;
    if (n === 1) throw new Error("rete");
  }, 5);
  avvisa("a");
  await attesa(20);
  avvisa("a");
  await attesa(20);
  assert.equal(n, 2);
});

// --- Pannello -----------------------------------------------------------------

let doc;
let pannello;

beforeEach(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  doc = dom.window.document;
  pannello = pannello || (await import("../src/views/sincronizzazione.js"));
});

test("pannello: niente più «non è disponibile», c'è la casella push con lo stato delle caselle", () => {
  pannello.apriPannelloSincronizzazione({
    preferenze: { syncPush: true },
    statiPush: [{ account: "io@esempio.it", stato: "attivo" }],
  });
  const testo = doc.body.textContent;
  assert.doesNotMatch(testo, /non è disponibile/);
  assert.equal(doc.querySelector("#s-push").checked, true);
  assert.match(doc.querySelector("#s-push-stato").textContent, /io@esempio\.it.*attivo/i);
});

test("pannello: accendere il push salva syncPush, riconcilia e mostra i nuovi stati", async () => {
  const salvate = [];
  let riconciliazioni = 0;
  pannello.apriPannelloSincronizzazione({
    preferenze: { syncPush: false, syncIntervalloMinuti: 15 },
    onSalva: async (imp) => {
      salvate.push(imp.preferenze);
      return "Salvato.";
    },
    onPush: async () => {
      riconciliazioni++;
      return [{ account: "io@esempio.it", stato: "connessione" }];
    },
  });
  const casella = doc.querySelector("#s-push");
  casella.checked = true;
  casella.dispatchEvent(new window.Event("change"));
  await attesa(10);
  assert.equal(salvate.at(-1).syncPush, true);
  assert.equal(salvate.at(-1).syncIntervalloMinuti, 15, "il resto delle preferenze resta");
  assert.equal(riconciliazioni, 1);
  assert.match(doc.querySelector("#s-push-stato").textContent, /connessione in corso/i);
});

test("pannello: gli stati si aggiornano dal vivo con aggiornaStatiPush", () => {
  const overlay = pannello.apriPannelloSincronizzazione({ preferenze: { syncPush: true }, statiPush: [] });
  overlay.aggiornaStatiPush([{ account: "io@esempio.it", stato: "non_supportato" }]);
  assert.match(doc.querySelector("#s-push-stato").textContent, /non offre IDLE/);
});
