/**
 * Test della logica pura delle regole (blocco H), con `node --test`:
 * ordinamento delle regole, normalizzazione di condizioni e azioni, riepilogo e
 * testi di trasparenza. Il pannello e il motore nel kernel non si collaudano qui.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ordinaRegole,
  normRegola,
  normCondizioni,
  normAllegato,
  normAzione,
  normAzioni,
  riepilogoRegole,
  testoStatistiche,
  testoUltimaEsecuzione,
  descrizioneCondizioni,
  descrizioneAzioni,
  condizioniVuote,
  regoleDiEsempio,
  TIPI_AZIONE,
  ALLEGATO_CONDIZIONI,
} from "../src/views/regole.js";
import { PANNELLI_BLOCCO_H } from "../src/views/settings.js";

const regola = (ordine, nome, attiva = true, extra = {}) =>
  Object.assign({ id: nome, nome, attiva, ordine, condizioni: condizioniVuote(), azioni: [] }, extra);

test("ordinaRegole mette le regole in ordine di `ordine` e lo conserva a parità", () => {
  const a = regola(2, "Terza");
  const b = regola(0, "Prima");
  const c = regola(1, "Seconda");
  const d = regola(0, "Prima ancora"); // stesso ordine di b: vince l'inserimento
  const ordinate = ordinaRegole([a, b, c, d]);
  assert.deepEqual(
    ordinate.map((r) => r.nome),
    ["Prima", "Prima ancora", "Seconda", "Terza"],
  );
});

test("ordinaRegole non muta l'elenco originale e regge un elenco mancante", () => {
  const originali = [regola(1, "B"), regola(0, "A")];
  const copia = originali.slice();
  ordinaRegole(originali);
  assert.deepEqual(originali, copia);
  assert.deepEqual(ordinaRegole(null), []);
});

test("normAllegato accetta solo i valori dichiarati", () => {
  assert.equal(normAllegato("con"), "con");
  assert.equal(normAllegato("senza"), "senza");
  assert.equal(normAllegato("boh"), "indifferente");
  assert.deepEqual(ALLEGATO_CONDIZIONI, ["indifferente", "con", "senza"]);
});

test("normCondizioni ripulisce i campi e normalizza «con allegato»", () => {
  const c = normCondizioni({ mittenteContiene: "  beta ", allegato: "boh" });
  assert.equal(c.mittenteContiene, "beta");
  assert.equal(c.allegato, "indifferente");
  assert.equal(c.oggettoContiene, "");
});

test("normAzione scarta tipi sconosciuti e «sposta» senza destinazione", () => {
  assert.deepEqual(normAzione({ tipo: "categorizza", valore: " Lavoro " }), {
    tipo: "categorizza",
    valore: "Lavoro",
  });
  assert.equal(normAzione({ tipo: "boh", valore: "x" }), null);
  assert.equal(normAzione({ tipo: "sposta", valore: "  " }), null);
  assert.deepEqual(normAzione({ tipo: "sposta", valore: "Archivio" }), {
    tipo: "sposta",
    valore: "Archivio",
  });
});

test("normAzioni conserva l'ordine dichiarato", () => {
  const azioni = normAzioni([
    { tipo: "categorizza", valore: "A" },
    { tipo: "contrassegna", valore: "" },
    { tipo: "categorizza", valore: "B" },
  ]);
  assert.deepEqual(
    azioni.map((a) => a.valore),
    ["A", "", "B"],
  );
});

test("i tipi di azione sono quelli dichiarati, nell'ordine", () => {
  assert.deepEqual(TIPI_AZIONE, ["sposta", "contrassegna", "categorizza", "segna_letto", "elimina"]);
});

test("normRegola genera nome, tiene lo stato e normalizza", () => {
  const r = normRegola({ condizione: "x", azioni: [{ tipo: "boh" }] }, 0);
  assert.equal(r.nome, "Regola 1");
  assert.equal(r.attiva, true);
  assert.deepEqual(r.azioni, []);
  const spenta = normRegola({ nome: "X", attiva: false }, 1);
  assert.equal(spenta.attiva, false);
});

test("riepilogoRegole conta totali e attive", () => {
  const r = riepilogoRegole([regola(0, "A"), regola(1, "B", false)]);
  assert.deepEqual(r, { totali: 2, attive: 1 });
  assert.deepEqual(riepilogoRegole(undefined), { totali: 0, attive: 0 });
});

test("testoUltimaEsecuzione e testoStatistiche dicono «mai» e i conteggi", () => {
  assert.equal(testoUltimaEsecuzione(0), "mai");
  assert.equal(testoUltimaEsecuzione(null), "mai");
  assert.match(testoStatistiche({ esecuzioni: 1, ultimaEsecuzione: 0 }), /1 azione/);
  assert.match(testoStatistiche({ esecuzioni: 0, ultimaEsecuzione: 0 }), /0 azioni/);
  assert.match(testoStatistiche({ esecuzioni: 5, ultimaEsecuzione: 1760281200 }), /\d{2}\/\d{2}\/\d{4}/);
});

test("descrizioneCondizioni e descrizioneAzioni raccontano la regola", () => {
  const r = regola(0, "Fornitori", true, {
    condizioni: normCondizioni({ mittenteContiene: "beta", allegato: "con" }),
    azioni: [
      { tipo: "sposta", valore: "Fornitori" },
      { tipo: "categorizza", valore: "Fornitori" },
    ],
  });
  const d = descrizioneCondizioni(r);
  assert.match(d, /beta/);
  assert.match(d, /Con allegato/);
  assert.match(descrizioneAzioni(r), /Sposta in cartella «Fornitori»/);
  assert.match(descrizioneAzioni(r), /Categorizza «Fornitori»/);
  assert.equal(descrizioneCondizioni(regola(0, "X")), "nessuna condizione (tutti i messaggi)");
});

test("le regole di esempio sono sensate e distinte", () => {
  const es = regoleDiEsempio();
  assert.ok(es.length >= 2);
  assert.notEqual(es[0].id, es[1].id);
});

test("il riquadro Regole del hub ha un pannello collegato", () => {
  assert.equal(PANNELLI_BLOCCO_H.regole, "regole");
});
