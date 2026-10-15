/**
 * Pannello «Impostazioni di sincronizzazione» (blocco N).
 *
 * Etichetta del riferimento: il riquadro è `Sincronizzazione`
 * (`Preferences.Panes.All.strings`, `Pq2-75-JRO.title`), con la descrizione
 * «Impostazioni di sincronizzazione» (`vcY-Tt-Kwt.ibShadowedToolTip`) — da cui
 * il titolo del pannello.
 *
 * Due parti:
 * - le funzioni PURE (intervallo e decisione del timer): test `node:test`;
 * - il pannello, che salva in `config.json` e ha effetto subito.
 *
 * Effetti reali: l'**intervallo** avvia un timer che, mentre l'app è aperta,
 * esegue un «Invia e ricevi» ogni N minuti; **Sincronizza all'avvio** lancia la
 * sincronizzazione all'apertura **solo se la casella è spuntata** (spenta di
 * default: senza di essa l'app non tocca la rete al lancio). Allinea anche
 * `ultimaSyncMs`, così il timer non risincronizza subito dopo. **Non** è offerta
 * la sincronizzazione in push (IMAP IDLE / Exchange): non è implementata, quindi
 * non la si finge.
 */

import { apriOverlayPannello, fuga } from "./blocco-i2.js";

/** Preset dell'intervallo di sincronizzazione automatica (minuti). */
export const PRESET_INTERVALLO = [
  { minuti: 0, etichetta: "Mai" },
  { minuti: 5, etichetta: "Ogni 5 minuti" },
  { minuti: 15, etichetta: "Ogni 15 minuti" },
  { minuti: 30, etichetta: "Ogni 30 minuti" },
  { minuti: 60, etichetta: "Ogni ora" },
  { minuti: 120, etichetta: "Ogni 2 ore" },
];

/** Minuti massimi accettati per l'intervallo (una giornata). */
export const INTERVALLO_MAX = 1440;

/** Intervallo valido: intero fra 0 (mai) e `INTERVALLO_MAX`, altrimenti 0. */
export function normIntervalloMinuti(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(INTERVALLO_MAX, v);
}

/** Etichetta leggibile dell'intervallo (0 = «Mai»). */
export function etichettaIntervallo(minuti) {
  const m = normIntervalloMinuti(minuti);
  if (m === 0) return "Mai";
  const preset = PRESET_INTERVALLO.find((p) => p.minuti === m);
  if (preset) return preset.etichetta;
  if (m % 60 === 0) return `Ogni ${m / 60} ore`;
  return `Ogni ${m} minuti`;
}

/**
 * Vero se è ora di sincronizzare: `false` con intervallo 0 (mai); `true` se non
 * si è mai sincronizzato; altrimenti solo se è passato l'intervallo.
 */
export function deveSincronizzare(intervalloMin, ultimaMs, adessoMs) {
  const m = normIntervalloMinuti(intervalloMin);
  if (m === 0) return false;
  if (!ultimaMs) return true;
  return adessoMs - ultimaMs >= m * 60_000;
}

/**
 * Vero se all'avvio dell'app va eseguita una sincronizzazione: solo con la
 * preferenza «Sincronizza all'avvio» attiva (`syncAllAvvio`; il kernel la vuole
 * attiva di default, com'era il comportamento storico dell'app). Il numero di
 * account lo decide chi chiama: con zero account non c'è nulla da sincronizzare.
 */
export function deveSincronizzareAvvio(preferenze) {
  return !!(preferenze && preferenze.syncAllAvvio);
}

/**
 * Apre il pannello «Impostazioni di sincronizzazione».
 * `opzioni.onSincronizzaOra()` esegue una sincronizzazione immediata (facoltativa).
 */
export function apriPannelloSincronizzazione(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const intervallo = normIntervalloMinuti(prefs.syncIntervalloMinuti);
  const avvio = !!prefs.syncAllAvvio;

  const p = apriOverlayPannello(
    "Impostazioni di sincronizzazione",
    `<div class="settings-sec">Sincronizzazione automatica</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Intervallo:</div>
       <select class="settings-fld" id="s-intervallo">
         ${PRESET_INTERVALLO.map(
           (x) => `<option value="${x.minuti}"${x.minuti === intervallo ? " selected" : ""}>${fuga(x.etichetta)}</option>`,
         ).join("")}
       </select>
     </div>
     <label class="ai-check"><input type="checkbox" id="s-avvio"${avvio ? " checked" : ""}> Sincronizza all'avvio dell'app</label>
     <p class="im-nota">Il timer agisce <b>mentre l'app è aperta</b>: alla riapertura la sincronizzazione riparte. Non è un servizio in background.</p>
     <p class="im-nota">La sincronizzazione <b>in push</b> (IMAP IDLE / Exchange) non è disponibile: non è implementata, quindi non è offerta.</p>
     <div class="ai-avvia-riga">
       <button type="button" class="ai-btn2" id="s-ora">Sincronizza ora</button>
     </div>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";

  const salva = async () => {
    const nuove = Object.assign({}, opzioni.preferenze, {
      syncIntervalloMinuti: normIntervalloMinuti(q("s-intervallo").value),
      syncAllAvvio: q("s-avvio").checked,
    });
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

  q("s-intervallo").addEventListener("change", salva);
  q("s-avvio").addEventListener("change", salva);
  const prova = q("s-ora");
  if (prova) {
    prova.addEventListener("click", async () => {
      if (typeof opzioni.onSincronizzaOra !== "function") {
        p.nota("Sincronizzazione non collegata in questa prova.");
        return;
      }
      p.nota("Sincronizzazione in corso…");
      try {
        p.nota((await opzioni.onSincronizzaOra()) || "Cartelle aggiornate.");
      } catch (e) {
        p.nota(`Non riuscita: ${e && e.message ? e.message : e}`, true);
      }
    });
  }
  return p.overlay;
}
