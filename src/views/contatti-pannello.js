/**
 * Blocco Q — pannello «Contatti» (finestra delle impostazioni di Outlook).
 *
 * Rende viva la voce **Contatti** dell'hub (riquadro `AddressBook`): configura
 * il comportamento della **rubrica** e del **completamento dei destinatari**
 * con effetto osservabile, non solo interfaccia.
 *
 * Come gli altri moduli delle viste, ha due parti ben separate:
 * - le funzioni PURE (ordinamento della rubrica, formattazione del nome,
 *   normalizzazione) vivono in `contatti.js`, accanto alla rubrica che le usa,
 *   e le collauda `tests/contatti-pannello.test.mjs` senza DOM né kernel;
 * - il pannello (`apriPannelloContatti`), costruito con `chromePannello` /
 *   `apriOverlayPannello` del blocco I2.
 *
 * Etichette del riferimento (`Preferences.Panes.AddressBook.strings`):
 * «Ordina i risultati nel riquadro Ricerca contatti per:», `Nome`, `Cognome`,
 * «Formato indirizzo predefinito:», «Anteprima:». Il riquadro si chiama
 * **Contatti** (`Preferences.Panes.All.strings`, voce 301: «Consente di
 * impostare opzioni quali i formati predefiniti di indirizzi e numeri di
 * telefono»). Le etichette dei tre campi sono del riferimento; «Azienda» e
 * «Numero di suggerimenti» sono di questo clone e sono dichiarati come tali.
 */

import { fugaHtml } from "./mail-actions.js";
import { apriOverlayPannello } from "./blocco-i2.js";
import {
  anteprimaFormato,
  FORMATI_NOME_CONTATTO,
  FORMATO_NOME_DEFAULT,
  LIMITE_SUGGERIMENTI_MAX,
  LIMITE_SUGGERIMENTI_MIN,
  normFormatoNome,
  normOrdinamento,
  normSuggerimentiLimite,
  ORDINAMENTI_RUBRICA,
  ORDINAMENTO_RUBRICA_DEFAULT,
} from "./contatti.js";

/**
 * Voci del pannello di Outlook che **non** si possono far funzionare qui: si
 * dichiarano con la ragione, invece di mostrare pulsanti muti.
 */
export const VOCI_NON_DISPONIBILI = [
  {
    etichetta: "Rubrica predefinita / Cartella indirizzi",
    motivo:
      "Un client IMAP locale ha una sola rubrica. Le rubriche di rete — Cartella indirizzi di " +
      "Exchange, LDAP, contatti di Google — appartengono al server e non si configurano da qui.",
  },
  {
    etichetta: "Verifica gli indirizzi dei destinatari prima di inviare il messaggio",
    motivo:
      "In Outlook la verifica risolve i nomi sulla Rubrica globale del server. Senza un server di " +
      "directory non c'è nulla da verificare: la rubrica locale non risolve nomi di altre persone.",
  },
  {
    etichetta: "Formatta automaticamente i numeri di telefono · Indicativo località predefinito",
    motivo:
      "La rubrica memorizza il telefono così com'è stato scritto: non esiste un formattatore di " +
      "numeri né un indicativo di località da applicare.",
  },
];

/** Il contatto dell'«Anteprima:», con dati reali della rubrica di esempio. */
const CONTATTO_ANTEPRIMA = {
  nome: "Luca",
  cognome: "Bianchi",
  email: "luca.bianchi@esempiogroup.it",
  azienda: "Azienda Esempio",
};

/** `options` di un `<select>` a partire da un elenco `{ id, etichetta }`. */
function opzioniSelect(elenco, scelto) {
  return elenco
    .map(
      (x) =>
        `<option value="${fugaHtml(x.id)}"${x.id === scelto ? " selected" : ""}>${fugaHtml(x.etichetta)}</option>`,
    )
    .join("");
}

/** Le voci non disponibili come elenco (etichetta in grassetto + ragione). */
function htmlNonDisponibili() {
  return VOCI_NON_DISPONIBILI.map(
    (v) => `<p class="im-nota"><b>${fugaHtml(v.etichetta)}</b> — ${fugaHtml(v.motivo)}</p>`,
  ).join("");
}

/**
 * Apre il pannello «Contatti».
 *
 * `opzioni.preferenze` è l'oggetto preferenze corrente; le modifiche si applicano
 * subito con `opzioni.onApplica(preferenze)` e si salvano con
 * `opzioni.onSalva({ theme, preferenze })` — le stesse della finestra delle
 * impostazioni.
 */
export function apriPannelloContatti(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const ordinamento = normOrdinamento(prefs.rubricaOrdinamento || ORDINAMENTO_RUBRICA_DEFAULT);
  const formato = normFormatoNome(prefs.rubricaFormatoNome || FORMATO_NOME_DEFAULT);
  const limite = normSuggerimentiLimite(prefs.contattiSuggerimentiLimite);

  const contenuto = `
    <div class="settings-sec">Rubrica</div>
    <div class="settings-hr"></div>
    <p class="im-nota">L'ordine e il formato del nome si applicano alla <b>rubrica</b> (la finestra «Rubrica»): cambiano davvero come sono elencati e mostrati i contatti.</p>
    <div class="settings-grid">
      <div class="settings-lbl">Ordina i risultati nel riquadro Ricerca contatti per:</div>
      <select class="settings-fld" id="q-ordine" autocomplete="off">${opzioniSelect(ORDINAMENTI_RUBRICA, ordinamento)}</select>
      <div class="settings-lbl">Formato indirizzo predefinito:</div>
      <select class="settings-fld" id="q-formato" autocomplete="off">${opzioniSelect(FORMATI_NOME_CONTATTO, formato)}</select>
    </div>
    <div class="settings-grid">
      <div class="settings-lbl">Anteprima:</div>
      <div class="q-anteprima" id="q-anteprima" aria-live="polite">${fugaHtml(anteprimaFormato(formato, CONTATTO_ANTEPRIMA))}</div>
    </div>
    <div class="settings-sec">Destinatari</div>
    <div class="settings-hr"></div>
    <p class="im-nota">Quanti suggerimenti mostrare sotto i campi A / Cc / Ccn mentre si scrive un indirizzo (dalla rubrica e dagli indirizzi già visti).</p>
    <div class="settings-grid">
      <div class="settings-lbl">Numero di suggerimenti:</div>
      <input class="settings-fld settings-fld--num" type="number" id="q-limite" min="${LIMITE_SUGGERIMENTI_MIN}" max="${LIMITE_SUGGERIMENTI_MAX}" step="1" value="${limite}" />
    </div>
    <div class="ai-avvia-riga">
      <button type="button" class="ai-btn2" id="q-salva">Salva</button>
    </div>
    <div class="settings-sec">Non disponibile in questa versione</div>
    <div class="settings-hr"></div>
    ${htmlNonDisponibili()}`;

  const p = apriOverlayPannello("Contatti", contenuto, opzioni);
  const q = (sel) => p.overlay.querySelector(sel);

  const aggiornaAnteprima = () => {
    q("#q-anteprima").textContent = anteprimaFormato(q("#q-formato").value, CONTATTO_ANTEPRIMA);
  };
  q("#q-formato").addEventListener("change", aggiornaAnteprima);

  q("#q-salva").addEventListener("click", async () => {
    const nuove = {
      rubricaOrdinamento: normOrdinamento(q("#q-ordine").value),
      rubricaFormatoNome: normFormatoNome(q("#q-formato").value),
      contattiSuggerimentiLimite: normSuggerimentiLimite(q("#q-limite").value),
    };
    // Rimette i valori normalizzati nei campi (un numero scritto a mano fuori
    // scala torna al default invece di essere salvato com'è).
    q("#q-ordine").value = nuove.rubricaOrdinamento;
    q("#q-formato").value = nuove.rubricaFormatoNome;
    q("#q-limite").value = String(nuove.contattiSuggerimentiLimite);
    aggiornaAnteprima();

    const preferenze = Object.assign({}, prefs, nuove);
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze);
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({
        theme: typeof opzioni.getTema === "function" ? opzioni.getTema() : "system",
        preferenze,
      });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  });

  return p.overlay;
}
