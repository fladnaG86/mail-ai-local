/**
 * Test della logica pura del blocco D, seconda metà (node --test): firme
 * multiple (scelta, migrazione, inserimento che sostituisce e non duplica),
 * normalizzazione del livello di protezione della posta indesiderata e testo di
 * riepilogo del pannello Privacy. Il disegno è verificato con le prove visive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizzaFirme,
  firmeEffettive,
  idFirmaPredefinita,
  firmaPredefinita,
  sostituisciFirma,
} from "../src/views/firme.js";
import {
  PROTEZIONI,
  normProtezione,
  etichettaProtezione,
  riepilogoPosta,
  testoUltimaAzione,
} from "../src/views/posta-indesiderata.js";
import { riepilogoRegistro, testoStatoChiave } from "../src/views/ai-settings.js";
import { PANNELLI_BLOCCO_D2 } from "../src/views/settings.js";
import { TITOLI_PANNELLI_D2 } from "../src/views/blocco-d2.js";

test("sostituisciFirma inserisce e poi sostituisce senza duplicare", () => {
  assert.equal(sostituisciFirma("Ciao", "A", ""), "Ciao\n\nA");
  assert.equal(sostituisciFirma("Ciao\n\nA", "B", "A"), "Ciao\n\nB");
  // Ripetere la stessa firma non la duplica.
  assert.equal(sostituisciFirma("Ciao\n\nA", "A", "A"), "Ciao\n\nA");
  // Firma vuota: la toglie.
  assert.equal(sostituisciFirma("Ciao\n\nA", "", "A"), "Ciao");
  assert.equal(sostituisciFirma("", "A", ""), "A");
  assert.equal(sostituisciFirma("Corpo", "", ""), "Corpo");
});

test("migrazione in lettura dalla firma singola a più firme", () => {
  const eff = firmeEffettive({ firmaDelMittente: "Mario Rossi" });
  assert.equal(eff.length, 1);
  assert.equal(eff[0].id, "predefinita");
  assert.equal(eff[0].contenuto, "Mario Rossi");
  // Con firme proprie, la firma singola storica è ignorata.
  const p2 = {
    firmaDelMittente: "vecchia",
    firme: [{ id: "l", nome: "Lavoro", contenuto: "nuova" }],
  };
  assert.deepEqual(firmeEffettive(p2), [
    { id: "l", nome: "Lavoro", contenuto: "nuova", html: false },
  ]);
  assert.deepEqual(firmeEffettive({}), []);
});

test("la firma predefinita per account è rispettata", () => {
  const firme = [
    { id: "lavoro", nome: "Lavoro", contenuto: "Saluti L" },
    { id: "personale", nome: "Personale", contenuto: "Saluti P" },
  ];
  assert.equal(idFirmaPredefinita(firme, { acc: "personale" }, "acc"), "personale");
  assert.equal(firmaPredefinita(firme, { acc: "personale" }, "acc").contenuto, "Saluti P");
  // Mappa che punta a una firma inesistente → prima firma.
  assert.equal(idFirmaPredefinita(firme, { acc: "boh" }, "acc"), "lavoro");
  // Nessuna firma → null.
  assert.equal(firmaPredefinita([], {}, "acc"), null);
  assert.equal(idFirmaPredefinita([], {}, "acc"), null);
});

test("normalizzaFirme scarta id duplicati e genera id/nome mancanti", () => {
  const out = normalizzaFirme([
    { nome: "Lavoro", contenuto: "X" },
    { id: "a", contenuto: "Y" },
    { id: "a", contenuto: "Z" },
    { nome: "", contenuto: "" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "firma1");
  assert.equal(out[1].id, "a");
});

test("normalizzazione del livello di protezione", () => {
  assert.deepEqual(PROTEZIONI, ["spenta", "attiva"]);
  assert.equal(normProtezione("attiva"), "attiva");
  assert.equal(normProtezione("spenta"), "spenta");
  assert.equal(normProtezione("boh"), "attiva");
  assert.equal(normProtezione(undefined), "attiva");
  assert.match(etichettaProtezione("spenta"), /solo marcatura/);
  assert.match(etichettaProtezione("attiva"), /sposta/);
});

test("il riepilogo della posta indesiderata dice mittenti, effetto e ultima azione", () => {
  const s = riepilogoPosta({ mittenti: ["a@b.it"], protezione: "attiva", ultimaAzione: 0 });
  assert.match(s, /1 mittente bloccato/);
  assert.match(s, /spostati in Posta indesiderata/);
  assert.match(s, /ultima azione della protezione: mai/);
  const s2 = riepilogoPosta({
    mittenti: ["a@b.it", "c@d.it"],
    protezione: "spenta",
    ultimaAzione: 1760340000,
  });
  assert.match(s2, /2 mittenti bloccati/);
  assert.match(s2, /solo marcati/);
  assert.match(s2, /ultima azione della protezione: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  assert.equal(testoUltimaAzione(0), "mai");
  assert.equal(testoUltimaAzione("boh"), "mai");
});

test("il riepilogo Privacy dice cosa registra e cosa non registra mai", () => {
  const s = riepilogoRegistro([{ hash: "x" }], { registroAttivo: true, consensoRichiesto: true });
  assert.match(s, /Registro: 1 voce/);
  assert.match(s, /solo impronta SHA-256 e metadati/);
  assert.match(s, /mai registrato/i);
  assert.match(s, /consenso all'invio al cloud è chiesto ogni volta/);
  assert.match(s, /Nessuna telemetria/);
  const vuoto = riepilogoRegistro([], {});
  assert.match(vuoto, /Registro: 0 voci/);
  const spento = riepilogoRegistro([], { registroAttivo: false, consensoRichiesto: false });
  assert.match(spento, /registro è spento/);
  assert.match(spento, /già stato dato/);
});

test("i riquadri della seconda metà del blocco D hanno un pannello collegato", () => {
  const dalHub = Object.values(PANNELLI_BLOCCO_D2);
  assert.deepEqual(dalHub.slice().sort(), ["firme", "posta", "privacy"]);
  for (const chiave of dalHub) {
    assert.ok(TITOLI_PANNELLI_D2[chiave], `manca il titolo del pannello «${chiave}»`);
  }
});

// ---------------------------------------------------------------------------
// Chiave OpenRouter: la riga di stato dice cosa manca e cosa fare
// ---------------------------------------------------------------------------

test("senza chiave lo stato dice che il cloud non è utilizzabile", () => {
  const testo = testoStatoChiave({ presente: false });
  assert.match(testo, /[Nn]essuna chiave/);
  // Non basta dire «assente»: chi ha scelto il cloud deve sapere la conseguenza.
  assert.match(testo, /non part|non utilizzabile|non funziona/i);
});

test("con la chiave presente lo stato dice che il cloud è utilizzabile", () => {
  const testo = testoStatoChiave({ presente: true });
  assert.match(testo, /[Pp]resente/);
  assert.match(testo, /utilizzabile/);
  assert.doesNotMatch(testo, /[Nn]essuna chiave/, "non deve dire che manca, se c'è");
});

test("lo stato senza argomenti non mente: si comporta come «assente»", () => {
  // La chiamata senza `presente` non deve far credere che la chiave ci sia.
  assert.match(testoStatoChiave(), /[Nn]essuna chiave/);
  assert.match(testoStatoChiave({}), /[Nn]essuna chiave/);
  assert.doesNotMatch(testoStatoChiave(), /utilizzabile/);
});
