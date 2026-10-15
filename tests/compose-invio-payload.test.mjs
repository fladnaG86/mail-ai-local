/**
 * Il payload di `mail_invia`. Era il punto di un bug vero: `inviaConKernel`
 * passava `cc` ma non `ccn`, e il kernel rifiutava l'invio con
 * «missing required key ccn» **prima** di toccare la rete. Questi test
 * bloccano il ritorno di quella classe di errore: il kernel non accetta chiavi
 * mancanti, quindi il payload deve portarle tutte e sempre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { payloadInvio } from "../src/views/compose.js";

/** Chiavi che il comando Rust `mail_invia` richiede (vedi `src-tauri/src/lib.rs`). */
const CHIAVI_RICHIESTE = [
  "accountId",
  "a",
  "cc",
  "ccn",
  "oggetto",
  "corpoTesto",
  "corpoHtml",
  "allegati",
  "confermaLettura",
  "confermaRecapito",
];

test("il payload porta tutte le chiavi richieste dal kernel", () => {
  const p = payloadInvio({ a: "x@y.it" }, "acc1");
  for (const k of CHIAVI_RICHIESTE) {
    assert.ok(k in p, `manca «${k}»: il kernel rifiuterebbe l'invio`);
  }
});

test("`ccn` c'è anche quando la composizione lo omette", () => {
  // È esattamente il caso che ha rotto l'invio: campi senza `ccn`.
  const p = payloadInvio({ a: "x@y.it", cc: "c@y.it" }, "acc1");
  assert.equal(p.ccn, "");
  assert.equal(p.cc, "c@y.it");
});

test("i campi assenti diventano stringhe vuote, non `undefined`", () => {
  const p = payloadInvio({}, "acc1");
  for (const k of ["a", "cc", "ccn", "oggetto", "corpoTesto", "corpoHtml"]) {
    assert.equal(typeof p[k], "string", `«${k}» deve essere una stringa`);
  }
  assert.deepEqual(p.allegati, []);
  assert.equal(p.confermaLettura, false);
  assert.equal(p.confermaRecapito, false);
});

test("i valori presenti passano intatti, allegati compresi", () => {
  const allegati = [{ nome: "a.pdf", mime: "application/pdf", contenuto: "AAA" }];
  const p = payloadInvio(
    {
      a: "a@b.it",
      cc: "c@b.it",
      ccn: "d@b.it",
      oggetto: "Prova",
      corpoTesto: "ciao",
      corpoHtml: "<p>ciao</p>",
      allegati,
      confermaLettura: true,
    },
    "acc9",
  );
  assert.equal(p.accountId, "acc9");
  assert.equal(p.a, "a@b.it");
  assert.equal(p.ccn, "d@b.it");
  assert.equal(p.oggetto, "Prova");
  assert.equal(p.corpoHtml, "<p>ciao</p>");
  assert.equal(p.allegati, allegati);
  assert.equal(p.confermaLettura, true);
  assert.equal(p.confermaRecapito, false);
});

test("le conferme sono booleani anche se arrivano veritiere non booleane", () => {
  const p = payloadInvio({ confermaLettura: "sì", confermaRecapito: 0 }, "acc1");
  assert.equal(p.confermaLettura, true);
  assert.equal(p.confermaRecapito, false);
});
