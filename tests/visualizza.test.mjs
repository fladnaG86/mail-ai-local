/**
 * Test della logica pura del pannello «Visualizza» (blocco N, node --test):
 * normalizzazione del colore di sfondo della riga contrassegnata e etichette
 * del riferimento. L'effetto visivo (sfondo della riga) è verificato con la
 * prova `?view=impostazioni-visualizza`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COLORI_RIGA,
  normColore,
  etichettaColore,
  applicaColoreContrassegnata,
  richiedeRidisegno,
} from "../src/views/visualizza.js";

test("i colori della riga contrassegnata sono quelli misurati dal riferimento", () => {
  assert.deepEqual(
    COLORI_RIGA.map((c) => c.etichetta),
    ["Giallo", "Nessuno"],
  );
});

test("un colore sconosciuto ricade sul giallo (MessageListFlaggedBackgroundColor)", () => {
  assert.equal(normColore("giallo"), "giallo");
  assert.equal(normColore("nessuno"), "nessuno");
  assert.equal(normColore("fucsia"), "giallo");
  assert.equal(normColore(null), "giallo");
  assert.equal(etichettaColore("giallo"), "Giallo");
  assert.equal(etichettaColore("boh"), "Giallo");
  assert.equal(etichettaColore("nessuno"), "Nessuno");
});

test("applicaColoreContrassegnata scrive l'attributo giusto sul contenitore", () => {
  const contenitore = { dataset: {} };
  applicaColoreContrassegnata(contenitore, "nessuno");
  assert.equal(contenitore.dataset.coloreContrassegnata, "nessuno");
  applicaColoreContrassegnata(contenitore, "inventato");
  assert.equal(contenitore.dataset.coloreContrassegnata, "giallo");
  // Un contenitore assente non fa esplodere nulla.
  assert.doesNotThrow(() => applicaColoreContrassegnata(null, "giallo"));
});

test("richiedeRidisegno: anteprima e raggruppamento sì, densità e colore no", () => {
  const base = { letturaAnteprima: false, raggruppaConversazioni: true, densitaVisualizzazione: "accogliente" };
  assert.equal(richiedeRidisegno(base, Object.assign({}, base)), false, "nulla cambia");
  assert.equal(richiedeRidisegno(base, Object.assign({}, base, { letturaAnteprima: true })), true);
  assert.equal(
    richiedeRidisegno(base, Object.assign({}, base, { raggruppaConversazioni: false })),
    true,
  );
  assert.equal(
    richiedeRidisegno(base, Object.assign({}, base, { densitaVisualizzazione: "compatta" })),
    false,
    "la densità basta al CSS, non ridisegna",
  );
  assert.equal(
    richiedeRidisegno(base, Object.assign({}, base, { visualizzaColoreContrassegnata: "nessuno" })),
    false,
    "il colore va per attributo dati, non ridisegna",
  );
});

test("richiedeRidisegno: raggruppamento assente vale come attivo", () => {
  assert.equal(richiedeRidisegno({}, { raggruppaConversazioni: true }), false);
  assert.equal(richiedeRidisegno({ raggruppaConversazioni: true }, {}), false);
  assert.equal(richiedeRidisegno({ raggruppaConversazioni: false }, {}), true);
});
