/**
 * Pannello «Cerca» (blocco N) — le opzioni della ricerca.
 *
 * Etichetta del riferimento (`/ERPreferencesWindow/Views/Search = Cerca`,
 * descrizione `Preferences.Panes.All.strings`: «Imposta opzioni di ricerca»).
 *
 * Due parti, come gli altri moduli:
 * - le funzioni PURE (ambito, limite, filtro dei risultati): le collaudano i
 *   test `node:test`, senza DOM;
 * - il pannello, che salva in `config.json` e ha effetto subito.
 *
 * Effetti reali: l'**ambito** «Cartella corrente» restringe i risultati alla
 * cartella aperta (il motore FTS5 cerca in tutte le cartelle della cache); il
 * **limite** è il numero massimo di risultati chiesto a `mail_cerca`;
 * «Cerca mentre si digita» abilita/disabilita la ricerca automatica (con
 * disattivata, si cerca con Invio). **Non** è offerta la scelta dei campi:
 * l'indice locale cerca oggetto, mittente e corpo **insieme**, e restringerli
 * richiederebbe un motore diverso — dichiarato nel pannello, non finto.
 */

import { apriOverlayPannello, fuga } from "./blocco-i2.js";

/** Ambiti di ricerca predefiniti. */
export const AMBITI_RICERCA = [
  { id: "tutte", etichetta: "Tutte le cartelle" },
  { id: "cartella", etichetta: "Cartella corrente" },
];

/** Limite predefinito e intervallo ammesso per il numero di risultati. */
export const RICERCA_LIMITE_DEFAULT = 50;
export const RICERCA_LIMITE_MIN = 10;
export const RICERCA_LIMITE_MAX = 500;

/** Ambito valido o il default «tutte». */
export function normAmbito(id) {
  return AMBITI_RICERCA.some((a) => a.id === id) ? id : "tutte";
}

/** Etichetta di un ambito (fallback: Tutte le cartelle). */
export function etichettaAmbito(id) {
  const a = AMBITI_RICERCA.find((x) => x.id === normAmbito(id));
  return a.etichetta;
}

/** Limite valido: intero fra il minimo e il massimo, altrimenti il default. */
export function normLimiteRicerca(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return RICERCA_LIMITE_DEFAULT;
  return Math.max(RICERCA_LIMITE_MIN, Math.min(RICERCA_LIMITE_MAX, v));
}

/**
 * Restringe i risultati all'ambito scelto. Con «tutte» li restituisce tutti;
 * con «cartella» tiene solo quelli della cartella indicata. Non muta l'elenco.
 */
export function filtraPerAmbito(risultati, ambito, cartella) {
  const elenco = Array.isArray(risultati) ? risultati : [];
  if (normAmbito(ambito) !== "cartella") return elenco.slice();
  return elenco.filter((r) => r && r.folder === cartella);
}

/**
 * Apre il pannello «Cerca». Salva e applica subito come gli altri pannelli.
 */
export function apriPannelloCerca(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const ambito = normAmbito(prefs.ricercaAmbito);
  const limite = normLimiteRicerca(prefs.ricercaLimite);
  const digita = prefs.ricercaMentreSiDigita !== false;

  const p = apriOverlayPannello(
    "Cerca",
    `<div class="settings-sec">Risultati</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Ambito predefinito:</div>
       <select class="settings-fld" id="c-ambito">
         ${AMBITI_RICERCA.map(
           (a) => `<option value="${fuga(a.id)}"${a.id === ambito ? " selected" : ""}>${fuga(a.etichetta)}</option>`,
         ).join("")}
       </select>
       <div class="settings-lbl">Numero massimo di risultati:</div>
       <input class="settings-fld settings-fld--num" type="number" id="c-limite" min="${RICERCA_LIMITE_MIN}" max="${RICERCA_LIMITE_MAX}" value="${limite}" />
     </div>
     <label class="ai-check"><input type="checkbox" id="c-digita"${digita ? " checked" : ""}> Cerca mentre si digita (altrimenti con Invio)</label>
     <p class="im-nota">Con «Cartella corrente» i risultati restano nella cartella aperta; con «Tutte le cartelle» l'indice cerca nell'intera cache locale.</p>
     <p class="im-nota">La scelta dei campi non è disponibile: l'indice locale cerca <b>oggetto, mittente e corpo insieme</b>, e restringerli richiederebbe un motore diverso. I prefissi <b>da:</b>, <b>oggetto:</b>, <b>a:</b> restano la via per limitare un singolo campo.</p>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";

  const salva = async () => {
    const nuove = Object.assign({}, opzioni.preferenze, {
      ricercaAmbito: q("c-ambito").value,
      ricercaLimite: normLimiteRicerca(q("c-limite").value),
      ricercaMentreSiDigita: q("c-digita").checked,
    });
    q("c-limite").value = nuove.ricercaLimite;
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(nuove);
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({ theme: getTema(), preferenze: nuove });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  };

  for (const id of ["c-ambito", "c-limite", "c-digita"]) q(id).addEventListener("change", salva);
  return p.overlay;
}
