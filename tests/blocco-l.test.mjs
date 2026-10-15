/**
 * Test del blocco L — risoluzione dell'account per le **azioni sulle cartelle**
 * (funzioni pure, `node --test tests/*.mjs`).
 *
 * Verificano che l'account su cui agire sia quello della **cartella** cliccata,
 * poi la **selezione attiva** e, solo con **una** casella, il predefinito. Con
 * **più** caselle e l'account non risolvibile — il nodo aggregato «Tutti gli
 * account» — l'azione va fermata (`mancante`) invece di agire su una casella
 * scelta a caso (svuotare/eliminare la Posta eliminata sbagliata).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { risolviAccountCartella } from "../src/views/cartelle-account.js";

test("l'account della cartella vince su tutto", () => {
  const r = risolviAccountCartella({
    accountCartella: "personale@example.it",
    accountAttivo: "lavoro@example.it",
    accountCorrente: "lavoro@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.accountId, "personale@example.it");
  assert.equal(r.mancante, false);
});

test("senza account di cartella si usa la selezione attiva", () => {
  const r = risolviAccountCartella({
    accountCartella: "",
    accountAttivo: "lavoro@example.it",
    accountCorrente: "personale@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.accountId, "lavoro@example.it");
  assert.equal(r.mancante, false);
});

test("con una sola casella il predefinito va bene: nessun blocco", () => {
  const r = risolviAccountCartella({
    accountCartella: "",
    accountAttivo: "",
    accountCorrente: "unica@example.it",
    numeroAccount: 1,
  });
  assert.equal(r.mancante, false, "una sola casella non deve mai bloccare");
  const senzaId = risolviAccountCartella({ numeroAccount: 1 });
  assert.equal(senzaId.mancante, false);
  assert.equal(senzaId.accountId, "");
});

test("il nodo «Tutti gli account» con più caselle ferma l'azione", () => {
  const r = risolviAccountCartella({
    accountCartella: "",
    accountAttivo: "",
    accountCorrente: "lavoro@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.mancante, true);
  assert.equal(r.accountId, "");
});

test("un elenco di account assente o non numerico è trattato con prudenza", () => {
  assert.equal(risolviAccountCartella({ accountCorrente: "a@x.it" }).mancante, false);
  assert.equal(
    risolviAccountCartella({ accountCartella: "", accountAttivo: "", numeroAccount: "2" }).mancante,
    true,
  );
});
