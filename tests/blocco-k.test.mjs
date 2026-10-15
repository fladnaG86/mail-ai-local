/**
 * Test del blocco K — propagazione dell'`accountId` attivo alle azioni
 * (funzioni pure, `node --test tests/*.mjs`).
 *
 * Verificano che l'account su cui agire sia: quello della **riga**, poi la
 * **selezione attiva** della barra laterale e, solo con **una** casella, il
 * predefinito. Con **più** caselle e nessuno dei due, l'azione va fermata
 * (`mancante`) invece di agire su un'altra casella per sbaglio.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { risolviAccountAzione } from "../src/views/cartelle-account.js";

test("l'account della riga vince su tutto", () => {
  const r = risolviAccountAzione({
    accountRiga: "personale@example.it",
    accountAttivo: "lavoro@example.it",
    accountCorrente: "lavoro@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.accountId, "personale@example.it");
  assert.equal(r.mancante, false);
});

test("senza account di riga si usa la selezione attiva", () => {
  const r = risolviAccountAzione({
    accountRiga: "",
    accountAttivo: "lavoro@example.it",
    accountCorrente: "personale@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.accountId, "lavoro@example.it");
  assert.equal(r.mancante, false);
});

test("con una sola casella il predefinito va bene: nessun blocco", () => {
  const r = risolviAccountAzione({
    accountRiga: "",
    accountAttivo: "",
    accountCorrente: "unica@example.it",
    numeroAccount: 1,
  });
  assert.equal(r.mancante, false, "una sola casella non deve mai bloccare");
  // Anche senza id noto (il kernel ricade sul predefinito = l'unica casella).
  const senzaId = risolviAccountAzione({ numeroAccount: 1 });
  assert.equal(senzaId.mancante, false);
  assert.equal(senzaId.accountId, "");
});

test("con più caselle e nessun account determinabile l'azione va fermata", () => {
  // Nessun account di riga, nessuna selezione attiva (vista «Tutti gli account»):
  // non si sceglie una casella a caso.
  const r = risolviAccountAzione({
    accountRiga: "",
    accountAttivo: "",
    accountCorrente: "lavoro@example.it",
    numeroAccount: 2,
  });
  assert.equal(r.mancante, true);
  assert.equal(r.accountId, "");
});

test("un elenco di account assente o non numerico è trattato con prudenza", () => {
  // Senza numero di account noto (0) si ricade sul predefinito, non si blocca.
  assert.equal(risolviAccountAzione({ accountCorrente: "a@x.it" }).mancante, false);
  // Con «2» come stringa il conteggio è comunque rispettato.
  assert.equal(
    risolviAccountAzione({ accountAttivo: "", accountRiga: "", numeroAccount: "2" }).mancante,
    true,
  );
});
