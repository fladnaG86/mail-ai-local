/**
 * Test della decisione di ridisegnare il corpo letto (blocco R): cambiare il
 * carattere dal pannello mentre un messaggio è aperto deve aggiornarlo subito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { serveRidisegnareLettura } from "../src/views/main-view.js";

test("un cambio di famiglia richiede il ridisegno", () => {
  assert.equal(
    serveRidisegnareLettura({ carattereFamiglia: "Aptos" }, { carattereFamiglia: "Georgia" }),
    true,
  );
});

test("un cambio di dimensione richiede il ridisegno", () => {
  assert.equal(
    serveRidisegnareLettura({ carattereDimensione: 12 }, { carattereDimensione: 18 }),
    true,
  );
});

test("un cambio di scala di lettura richiede il ridisegno", () => {
  assert.equal(serveRidisegnareLettura({ letturaZoom: 100 }, { letturaZoom: 150 }), true);
});

test("una modifica che non tocca il carattere non ridisegna", () => {
  assert.equal(
    serveRidisegnareLettura(
      { carattereFamiglia: "Aptos", letturaAnteprima: false },
      { carattereFamiglia: "Aptos", letturaAnteprima: true },
    ),
    false,
  );
});

test("preferenze mancanti o vuote non fanno ridisegnare", () => {
  assert.equal(serveRidisegnareLettura(null, null), false);
  assert.equal(serveRidisegnareLettura({}, {}), false);
});
