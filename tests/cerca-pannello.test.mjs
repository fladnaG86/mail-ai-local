/**
 * Test della logica pura del pannello «Cerca» (blocco N, node --test):
 * normalizzazione dell'ambito e del limite, filtro dei risultati per ambito.
 * L'effetto reale (limite passato a `mail_cerca`, filtro per cartella) è usato
 * da `eseguiRicerca` in `src/main.js`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AMBITI_RICERCA,
  normAmbito,
  etichettaAmbito,
  normLimiteRicerca,
  filtraPerAmbito,
  RICERCA_LIMITE_DEFAULT,
} from "../src/views/cerca.js";

test("gli ambiti di ricerca sono due, con le etichette del riferimento", () => {
  assert.deepEqual(
    AMBITI_RICERCA.map((a) => a.etichetta),
    ["Tutte le cartelle", "Cartella corrente"],
  );
  assert.equal(normAmbito("cartella"), "cartella");
  assert.equal(normAmbito("ovunque"), "tutte");
  assert.equal(etichettaAmbito("cartella"), "Cartella corrente");
  assert.equal(etichettaAmbito("boh"), "Tutte le cartelle");
});

test("il limite dei risultati resta nell'intervallo ammesso", () => {
  assert.equal(RICERCA_LIMITE_DEFAULT, 50);
  assert.equal(normLimiteRicerca(50), 50);
  assert.equal(normLimiteRicerca(5), 10, "troppo basso → minimo");
  assert.equal(normLimiteRicerca(9999), 500, "troppo alto → massimo");
  assert.equal(normLimiteRicerca("boh"), 50);
  assert.equal(normLimiteRicerca(0), 50);
  assert.equal(normLimiteRicerca(30.6), 31, "arrotonda");
});

test("l'ambito «cartella corrente» filtra i risultati; «tutte» li lascia", () => {
  const risultati = [
    { folder: "INBOX", uid: "1" },
    { folder: "Archivio", uid: "2" },
    { folder: "INBOX", uid: "3" },
  ];
  assert.deepEqual(filtraPerAmbito(risultati, "tutte", "INBOX").map((r) => r.uid), ["1", "2", "3"]);
  assert.deepEqual(filtraPerAmbito(risultati, "cartella", "INBOX").map((r) => r.uid), ["1", "3"]);
  assert.deepEqual(filtraPerAmbito(risultati, "cartella", "Archivio").map((r) => r.uid), ["2"]);
  assert.deepEqual(filtraPerAmbito(null, "cartella", "INBOX"), []);
});
