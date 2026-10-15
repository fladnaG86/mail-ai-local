/**
 * Pannello «Archiviazione» (blocco N) — lo spazio occupato dalla cache locale.
 *
 * Etichetta del riferimento (`/ERPreferencesWindow/Views/StorageQuota =
 * Archiviazione`, descrizione `Preferences.Panes.All.strings`: «Impostazioni di
 * archiviazione»).
 *
 * Due parti:
 * - le funzioni PURE (formato della dimensione, soglia, riepilogo): test
 *   `node:test`;
 * - il pannello, che mostra la dimensione **vera** della cache (dal comando
 *   `archiviazione_stato`) e la può svuotare (comando `svuota_cache`).
 *
 * Effetti reali: la dimensione e il numero di messaggi della cache locale, e lo
 * svuotamento. **Non** è offerta la quota del server (IMAP QUOTA / Exchange):
 * non è interrogata, quindi si dichiara invece di inventare un numero.
 */

import { apriOverlayPannello, fuga } from "./blocco-i2.js";

/**
 * Dimensione leggibile in B/KB/MB/GB (una cifra decimale, virgola italiana).
 * Un valore non valido o negativo diventa «0 B».
 */
export function formattaByte(byte) {
  const n = Number(byte);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const unita = ["B", "KB", "MB", "GB", "TB"];
  let valore = n;
  let i = 0;
  while (valore >= 1024 && i < unita.length - 1) {
    valore /= 1024;
    i += 1;
  }
  if (i === 0) return `${Math.round(valore)} B`;
  return `${valore.toFixed(1).replace(".", ",")} ${unita[i]}`;
}

/** Massima soglia di avviso accettata, in MB: oltre, il kernel la riporta qui. */
export const SOGLIA_MB_MAX = 102_400;

/**
 * Soglia di avviso valida: intero fra 0 (mai) e `SOGLIA_MB_MAX`, altrimenti 0.
 * Il limite superiore è quello di `Preferenze::normalizzata` del kernel: senza
 * di esso un valore più alto farebbe fallire il salvataggio invece di essere
 * riportato dentro l'intervallo.
 */
export function normSogliaMb(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(SOGLIA_MB_MAX, v);
}

/** Vero se la cache supera la soglia di avviso (in MB). Soglia 0 = mai. */
export function sogliaSuperata(byte, sogliaMb) {
  const mb = Number(sogliaMb);
  if (!Number.isFinite(mb) || mb <= 0) return false;
  return Number(byte) > mb * 1024 * 1024;
}

/** Riepilogo leggibile dello stato della cache: dimensione e messaggi. */
export function riepilogoArchiviazione(stato) {
  if (!stato) return "La cache locale è vuota.";
  const messaggi = Number(stato.messaggi) || 0;
  const dimensione = formattaByte(stato.byte);
  const parola = messaggi === 1 ? "messaggio" : "messaggi";
  return `La cache locale occupa ${dimensione} con ${messaggi.toLocaleString("it-IT")} ${parola}.`;
}

/**
 * Apre il pannello «Archiviazione`.
 * `opzioni.stato` = `{ byte, messaggi }` letti dal kernel;
 * `opzioni.onSvuotaCache()` svuota la cache e restituisce l'esito leggibile.
 */
export function apriPannelloArchiviazione(opzioni = {}) {
  const stato = opzioni.stato || { byte: 0, messaggi: 0 };
  const prefs = opzioni.preferenze || {};
  const soglia = normSogliaMb(prefs.archiviazioneAvvisoMb);
  const superata = sogliaSuperata(stato.byte, soglia);
  const avviso = superata
    ? `<p class="im-nota settings-nota--errore">La cache ha superato la soglia di ${soglia} MB.</p>`
    : "";

  const p = apriOverlayPannello(
    "Archiviazione",
    `<div class="settings-sec">Cache locale</div>
     <div class="settings-hr"></div>
     <p class="im-nota" id="a-riepilogo">${fuga(riepilogoArchiviazione(stato))}</p>
     ${avviso}
     <div class="settings-grid">
       <div class="settings-lbl">Avvisa oltre (MB):</div>
       <input class="settings-fld settings-fld--num" type="number" id="a-soglia" min="0" max="${SOGLIA_MB_MAX}" value="${soglia}" />
     </div>
     <p class="im-nota">La cache contiene i messaggi scaricati; <b>non</b> tocca configurazione, firme, mittenti bloccati né registro IA.</p>
     <div class="ai-avvia-riga">
       <button type="button" class="ai-btn2" id="a-svuota">Svuota la cache locale</button>
       <span class="im-nota" id="a-esito"></span>
     </div>
     <p class="im-nota">La <b>quota del server</b> non è disponibile: un client IMAP locale non la interroga, quindi non viene mostrata.</p>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";

  q("a-soglia").addEventListener("change", async () => {
    const nuove = Object.assign({}, opzioni.preferenze, {
      archiviazioneAvvisoMb: normSogliaMb(q("a-soglia").value),
    });
    q("a-soglia").value = nuove.archiviazioneAvvisoMb;
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
  });

  q("a-svuota").addEventListener("click", async () => {
    const esitoEl = q("a-esito");
    if (typeof opzioni.onSvuotaCache !== "function") {
      esitoEl.textContent = "Svuotamento non collegato in questa prova.";
      return;
    }
    esitoEl.textContent = "Svuotamento…";
    try {
      esitoEl.textContent = (await opzioni.onSvuotaCache()) || "Cache locale svuotata.";
      const r = q("a-riepilogo");
      if (r) r.textContent = riepilogoArchiviazione({ byte: 0, messaggi: 0 });
    } catch (e) {
      esitoEl.textContent = `Non riuscito: ${e && e.message ? e.message : e}`;
    }
  });
  return p.overlay;
}
