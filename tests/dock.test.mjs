/**
 * Blocco V1: il numero dei non letti sull'icona del Dock.
 *
 * Il numero è quello della Posta in arrivo di tutte le caselle (come Outlook),
 * zero toglie il numero, e lo stesso valore non viene rimandato al sistema a
 * ogni ridisegno della barra laterale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { conteggioDock, creaAggiornaDock } from "../src/views/dock.js";

const gruppi = [
  { account: "a", cartelle: [{ nome: "INBOX", nonLetti: 3 }, { nome: "Archivio", nonLetti: 50 }] },
  { account: "b", cartelle: [{ nome: "INBOX", nonLetti: 2 }] },
];

test("conteggioDock somma la Posta in arrivo di tutte le caselle, non le altre cartelle", () => {
  assert.equal(conteggioDock(gruppi), 5);
});

test("conteggioDock: zero o nessun dato → undefined (il numero sparisce)", () => {
  assert.equal(conteggioDock([{ account: "a", cartelle: [{ nome: "INBOX", nonLetti: 0 }] }]), undefined);
  assert.equal(conteggioDock([]), undefined);
  assert.equal(conteggioDock(null), undefined);
});

/** Finestra finta che registra le chiamate a `setBadgeCount`. */
function finestraFinta() {
  const chiamate = [];
  return { chiamate, setBadgeCount: async (n) => chiamate.push(n) };
}

test("aggiornaDock manda il numero al sistema e non ripete lo stesso valore", async () => {
  const f = finestraFinta();
  const aggiorna = creaAggiornaDock(() => f);
  await aggiorna(gruppi);
  await aggiorna(gruppi);
  await aggiorna([{ account: "a", cartelle: [{ nome: "INBOX", nonLetti: 0 }] }]);
  assert.deepEqual(f.chiamate, [5, undefined]);
});

test("aggiornaDock senza finestra Tauri (browser) non fa nulla e non lancia", async () => {
  const aggiorna = creaAggiornaDock(() => null);
  await aggiorna(gruppi);
});

test("aggiornaDock: un errore del sistema non blocca e il valore si riprova", async () => {
  let tentativi = 0;
  const f = { setBadgeCount: async () => { tentativi++; throw new Error("negato"); } };
  const aggiorna = creaAggiornaDock(() => f);
  await aggiorna(gruppi);
  await aggiorna(gruppi);
  assert.equal(tentativi, 2);
});
