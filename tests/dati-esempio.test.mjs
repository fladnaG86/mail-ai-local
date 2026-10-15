/**
 * I dati d'esempio del percorso browser devono rispettare il **contratto del
 * kernel** (`daRigaKernel`, `src/views/main-view.js`): ogni riga porta `uid`,
 * `account` e `folder`.
 *
 * Perché serve una prova: nel browser `messaggiCorrenti = sampleMessages`
 * (`src/main.js`), quindi una riga senza `account` fa finire `accountDi` /
 * `risolviAccountAzione` in `mancante` e **ogni azione sul messaggio si ferma**
 * con «Seleziona una casella nella barra laterale prima di agire sul
 * messaggio» — la prova visiva mentiva, e con due caselle in barra laterale
 * (`gruppiDiEsempio`) quel blocco compariva davvero.
 *
 * Senza `timestamp`, inoltre, `etichettaGruppo` ripiega su «Oggi» per tutte le
 * righe e `ordinaMessaggi` le ordina tutte come `0`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { sampleMessages, formatDate } from "../src/views/main-view.js";

test("ogni riga d'esempio porta uid, account e folder non vuoti", () => {
  for (const m of sampleMessages) {
    assert.equal(typeof m.uid, "string", `uid non è una stringa: ${JSON.stringify(m.uid)}`);
    assert.ok(m.uid.length > 0, "uid vuoto: le azioni sul messaggio non sanno quale riga è");
    assert.ok(
      typeof m.account === "string" && m.account.includes("@"),
      `account mancante o non valido: ${JSON.stringify(m.account)}`,
    );
    assert.ok(
      typeof m.folder === "string" && m.folder.length > 0,
      `folder mancante: ${JSON.stringify(m.folder)}`,
    );
  }
});

test("l'uid è unico dentro la stessa casella e cartella", () => {
  // La chiave nel kernel è (account, folder, uid): due righe con la stessa
  // terna sarebbero lo stesso messaggio, e le azioni ne colpirebbero una sola.
  const viste = new Set();
  for (const m of sampleMessages) {
    const chiave = `${m.account}/${m.folder}/${m.uid}`;
    assert.ok(!viste.has(chiave), `riga duplicata: ${chiave}`);
    viste.add(chiave);
  }
});

test("ogni riga porta un timestamp positivo, e `date` ne è la resa", () => {
  for (const m of sampleMessages) {
    assert.ok(
      Number.isInteger(m.timestamp) && m.timestamp > 0,
      `timestamp assente o non valido: ${JSON.stringify(m.timestamp)}`,
    );
    // Una sola fonte: la data mostrata è la formattazione del timestamp, così
    // non possono divergere.
    assert.equal(m.date, formatDate(m.timestamp), "`date` non corrisponde al `timestamp`");
  }
});

test("i dati d'esempio coprono più di una casella", () => {
  // È il caso che il difetto richiede: la vista aggregata «Tutti gli account»
  // con più caselle. Con una sola, `risolviAccountAzione` ripiega sempre e il
  // difetto non è osservabile.
  const caselle = new Set(sampleMessages.map((m) => m.account));
  assert.ok(caselle.size > 1, `serve più di una casella, trovate: ${[...caselle].join(", ")}`);
});
