/**
 * Test della logica pura del pannello «Accessibilità» (node --test):
 * normalizzazione delle opzioni, classi da mettere sul <html> (movimento
 * ridotto, contrasto elevato, etichette dei pulsanti) e scala del testo.
 * L'effetto visivo si verifica con la prova `?view=impostazioni-accessibilita`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCALE_TESTO,
  SCALA_TESTO_DEFAULT,
  normScalaTesto,
  normOpzioni,
  classeMovimentoRidotto,
  classiAccessibilita,
  variabiliAccessibilita,
  NON_DISPONIBILI,
  apriPannelloAccessibilita,
} from "../src/views/accessibilita.js";

test("le dimensioni del testo seguono i termini del sistema (macOS)", () => {
  // Etichette dai cataloghi di macOS: «Aumenta/Riduci le dimensioni del testo».
  assert.deepEqual(
    SCALE_TESTO.map((s) => s.id),
    [90, 100, 115],
  );
  assert.equal(SCALE_TESTO[1].id, SCALA_TESTO_DEFAULT);
});

test("normScalaTesto limita la scala all'intervallo ammesso", () => {
  assert.equal(normScalaTesto(100), 100);
  assert.equal(normScalaTesto(90), 90);
  assert.equal(normScalaTesto(115), 115);
  assert.equal(normScalaTesto(10), 80, "troppo piccola → minimo");
  assert.equal(normScalaTesto(999), 150, "troppo grande → massimo");
  assert.equal(normScalaTesto("boh"), SCALA_TESTO_DEFAULT);
  assert.equal(normScalaTesto(null), SCALA_TESTO_DEFAULT);
});

test("normOpzioni applica i default prudenti alle preferenze grezze", () => {
  const vuote = normOpzioni({});
  assert.equal(vuote.movimentoRidotto, false);
  assert.equal(vuote.contrastoElevato, false);
  assert.equal(vuote.etichettePulsanti, true, "le etichette sono visibili di default");
  assert.equal(vuote.testoScala, SCALA_TESTO_DEFAULT);

  const scelte = normOpzioni({
    accessibilitaMovimentoRidotto: true,
    accessibilitaContrastoElevato: true,
    accessibilitaEtichettePulsanti: false,
    accessibilitaTestoScala: 130,
  });
  assert.equal(scelte.movimentoRidotto, true);
  assert.equal(scelte.contrastoElevato, true);
  assert.equal(scelte.etichettePulsanti, false);
  assert.equal(scelte.testoScala, 130);
});

test("classeMovimentoRidotto è vuota quando l'opzione è spenta", () => {
  assert.equal(classeMovimentoRidotto(true), "movimento-ridotto");
  assert.equal(classeMovimentoRidotto(false), "");
  assert.equal(classeMovimentoRidotto(undefined), "");
});

test("classiAccessibilita elenca solo le classi attive", () => {
  assert.deepEqual(classiAccessibilita(normOpzioni({})), ["etichette-pulsanti"]);
  assert.deepEqual(
    classiAccessibilita(
      normOpzioni({
        accessibilitaMovimentoRidotto: true,
        accessibilitaContrastoElevato: true,
      }),
    ),
    ["movimento-ridotto", "contrasto-elevato", "etichette-pulsanti"],
  );
  assert.deepEqual(
    classiAccessibilita(normOpzioni({ accessibilitaEtichettePulsanti: false })),
    [],
  );
});

test("variabiliAccessibilita espone la scala del testo come numero", () => {
  assert.equal(variabiliAccessibilita(normOpzioni({})).uiScalaTesto, "1");
  assert.equal(variabiliAccessibilita(normOpzioni({ accessibilitaTestoScala: 115 })).uiScalaTesto, "1.15");
  assert.equal(variabiliAccessibilita(normOpzioni({ accessibilitaTestoScala: 90 })).uiScalaTesto, "0.9");
});

test("le voci non disponibili sono dichiarate, non finte", () => {
  // Un client IMAP locale non può pilotare il lettore schermo di sistema.
  assert.ok(NON_DISPONIBILI.some((v) => /lettore schermo/i.test(v.titolo)));
  for (const v of NON_DISPONIBILI) {
    assert.ok(typeof v.ragione === "string" && v.ragione.length > 10);
  }
});

test("apriPannelloAccessibilita è una funzione (interfaccia, non testata nel DOM)", () => {
  assert.equal(typeof apriPannelloAccessibilita, "function");
});
