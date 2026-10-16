/**
 * Finestra "Impostazioni di Outlook" (task 8.1, Milestone 8).
 *
 * Riproduce il riferimento misurato (§2.5 della spec, `mockup-impostazioni.html`):
 * finestra larga 992 pt, sfondo `#313335` e barra titolo `#262628` (26 pt), i tre
 * gruppi **Impostazioni personali / Posta elettronica / Altro** separati da una
 * linea `#494B4D`, e i riquadri con icona + etichetta.
 *
 * Deltas rispetto al riferimento, e solo questi: il riquadro **Assistente IA**
 * nel gruppo *Posta elettronica* (evidenziato) e i riquadri non ancora
 * realizzati, che restano visibili ma dichiarano "non disponibile nella v1"
 * invece di far finta di funzionare.
 *
 * Agganci per le prove visive nel browser (senza Tauri):
 *   `?view=impostazioni` → apre questo hub con valori di esempio (vedi main.js).
 *
 * La navigazione "Assistente IA" e "Generale" è delegata al chiamante
 * (`opzioni.onApriAssistente`), così questo modulo resta solo disegno e scelte.
 * Il tema arriva dal chiamante (`opzioni.getTema` / `opzioni.setTema`): qui non
 * si importa `theme.js`, e il modulo resta caricabile senza un DOM.
 */

// Solo il markup della ✕ di chiusura (stringa pura): nessuna dipendenza dal DOM.
import { rendiSpostabile } from "./finestre.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Gruppi e riquadri del riferimento misurato (§2.5). `azione` marca i vivi. */
const GRUPPI = [
  {
    titolo: "Impostazioni personali",
    riquadri: [
      { ic: "👤", nome: "Impostazioni personali", azione: "personali" },
      { ic: "📄", nome: "Generale", azione: "generale" },
      { ic: "👤", nome: "Account", azione: "account" },
      { ic: "🕑", nome: "Notifiche e suoni", azione: "notifiche" },
      { ic: "🎨", nome: "Categorie", azione: "categorie" },
      { ic: "🌗", nome: "Aspetto", azione: "aspetto" },
      { ic: "Aa", nome: "Tipi di carattere", azione: "carattere" },
      { ic: "ABC", nome: "Correzione automatica", azione: "correzione" },
      { ic: "✓ABC", nome: "Ortografia e grammatica", azione: "ortografia" },
      { ic: "⌨", nome: "Scelte rapide da tastiera", azione: "scelte-rapide" },
    ],
  },
  {
    titolo: "Posta elettronica",
    riquadri: [
      { ic: "✉︎", nome: "Lettura", azione: "lettura" },
      { ic: "▤", nome: "Visualizza", azione: "visualizza" },
      { ic: "🔍", nome: "Cerca", azione: "cerca" },
      { ic: "🎚", nome: "Sincronizzazione", azione: "sincronizzazione" },
      { ic: "✎", nome: "Composizione", azione: "composizione" },
      { ic: "✍︎", nome: "Firme", azione: "firme" },
      { ic: "⤨", nome: "Regole", azione: "regole" },
      { ic: "🚫", nome: "Posta indesiderata", azione: "posta" },
      { ic: "✦", nome: "Assistente IA", ia: true, sotto: "locale di default", azione: "assistente" },
    ],
  },
  {
    titolo: "Altro",
    riquadri: [
      { ic: "▦", nome: "Calendario", azione: "calendario" },
      { ic: "👥", nome: "Contatti", azione: "contatti" },
      { ic: "🗄", nome: "Archiviazione", azione: "archiviazione" },
      { ic: "♿", nome: "Accessibilità", azione: "accessibilita" },
      { ic: "🛡", nome: "Privacy", azione: "privacy" },
    ],
  },
];

/** Testo standard per un riquadro non realizzato nella v1. */
export function testoNonDisponibile(nome) {
  return `«${nome}» non è disponibile nella v1.`;
}

/** Riquadri realizzati nel blocco D: chiave del pannello per l'azione del tile. */
export const PANNELLI_BLOCCO_D = {
  lettura: "lettura",
  composizione: "composizione",
  carattere: "carattere",
  correzione: "correzione",
  ortografia: "ortografia",
};

/** Riquadri realizzati nel blocco D (seconda metà): Firme, Posta indesiderata, Privacy. */
export const PANNELLI_BLOCCO_D2 = {
  firme: "firme",
  posta: "posta",
  privacy: "privacy",
};

/** Riquadri realizzati nel blocco E: Notifiche e suoni. */
export const PANNELLI_BLOCCO_E = {
  notifiche: "notifiche",
};

/** Riquadri realizzati nel blocco H: Regole locali sui messaggi in arrivo. */
export const PANNELLI_BLOCCO_H = {
  regole: "regole",
};

/** Riquadri realizzati nel blocco I2: Scelte rapide da tastiera, Impostazioni personali. */
export const PANNELLI_BLOCCO_I2 = {
  "scelte-rapide": "scelte-rapide",
  personali: "personali",
};

/**
 * Riquadri realizzati nel blocco N: Visualizza, Cerca, Sincronizzazione,
 * Archiviazione. Etichette del riferimento: `Display = Visualizza`,
 * `Search = Cerca`, `SyncSettings` (riquadro «Sincronizzazione»),
 * `StorageQuota = Archiviazione`.
 */
export const PANNELLI_BLOCCO_N = {
  visualizza: "visualizza",
  cerca: "cerca",
  sincronizzazione: "sincronizzazione",
  archiviazione: "archiviazione",
};

/**
 * Riquadri realizzati nel blocco O: Categorie (elenco di categorie definite
 * dall'utente, con nome e colore). Etichetta del riferimento: `Categorie`
 * (`Preferences.Panes.All.strings`, voce 259).
 */
export const PANNELLI_BLOCCO_O = {
  categorie: "categorie",
};

/**
 * Riquadri realizzati nel blocco P: Aspetto (tema e colore accento) e
 * Accessibilità (movimento, contrasto, dimensioni del testo, etichette dei
 * pulsanti). Etichette del riferimento: `Appearance = Aspetto`,
 * `Accessibility = Accessibilità` (`ZStrings.strings`).
 */
export const PANNELLI_BLOCCO_P = {
  aspetto: "aspetto",
  accessibilita: "accessibilita",
};

/**
 * Riquadri realizzati nel blocco Q: Contatti (ordinamento della rubrica, formato
 * del nome visualizzato, numero di suggerimenti dei destinatari). Etichetta del
 * riferimento: `Contatti` (`Preferences.Panes.All.strings`, voce 301).
 */
export const PANNELLI_BLOCCO_Q = {
  contatti: "contatti",
};

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Un riquadro della griglia (icona + etichetta; evidenziato se IA). */
function htmlRiquadro(r) {
  const cls = r.ia ? "settings-tile settings-tile--ia" : "settings-tile";
  const dati = r.azione ? ` data-azione="${r.azione}"` : "";
  const sotto = r.ia && r.sotto ? `<div class="settings-tile-sotto">${fuga(r.sotto)}</div>` : "";
  return `<button type="button" class="${cls}"${dati} title="${fuga(r.nome)}">
      <span class="settings-tile-ic">${r.ic}</span>
      <span class="settings-tile-lb">${fuga(r.nome)}</span>${sotto}
    </button>`;
}

/** Un gruppo (titolo + riga di riquadri). */
function htmlGruppo(g) {
  return `<div class="settings-group-titolo">${fuga(g.titolo)}</div>
    <div class="settings-tiles">${g.riquadri.map(htmlRiquadro).join("")}</div>`;
}

/** Markup completo della finestra delle impostazioni. */
function markup() {
  return `
  <div class="settings-win" role="dialog" aria-label="Impostazioni di Outlook">
    <header class="settings-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="settings-title">Impostazioni di Outlook</span>
      <button type="button" class="settings-showall">Mostra tutte</button>
    </header>
    <div class="settings-body">
      ${GRUPPI.map(htmlGruppo).join('<div class="settings-hr"></div>')}
    </div>
    <div class="settings-nota" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Apre la finestra delle impostazioni sopra la vista principale.
 *
 * `opzioni.onApriAssistente` apre il pannello Assistente IA (task 8.2).
 * Restituisce l'elemento dell'overlay; si chiude con Esc o cliccando il velo.
 */
export function apriImpostazioni(opzioni = {}) {
  // Una sola finestra di impostazioni per volta.
  document.querySelectorAll(".settings-overlay").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "settings-overlay";
  overlay.innerHTML = markup();
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const notaEl = overlay.querySelector(".settings-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("settings-nota--errore", !!errore);
  };

  const chiudi = () => overlay.remove();
  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });

  overlay.querySelector(".settings-showall").addEventListener("click", () =>
    nota("«Mostra tutte» non è disponibile nella v1."),
  );

  overlay.querySelectorAll(".settings-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const azione = tile.dataset.azione;
      const nome = tile.querySelector(".settings-tile-lb").textContent;
      if (azione === "assistente") {
        if (typeof opzioni.onApriAssistente === "function") opzioni.onApriAssistente();
        else nota("Assistente IA: pannello non collegato in questa prova.");
      } else if (azione === "account") {
        if (typeof opzioni.onApriAccount === "function") opzioni.onApriAccount();
        else nota("Account: finestra non collegata in questa prova.");
      } else if (azione === "generale") {
        apriGenerale(overlay, nota, opzioni);
      } else if (azione === "calendario") {
        if (typeof opzioni.onApriCalendario === "function") opzioni.onApriCalendario();
        else nota("Calendario: agenda non collegata in questa prova.");
      } else if (PANNELLI_BLOCCO_D[azione] || PANNELLI_BLOCCO_D2[azione] || PANNELLI_BLOCCO_E[azione] || PANNELLI_BLOCCO_H[azione] || PANNELLI_BLOCCO_I2[azione] || PANNELLI_BLOCCO_N[azione] || PANNELLI_BLOCCO_O[azione] || PANNELLI_BLOCCO_P[azione] || PANNELLI_BLOCCO_Q[azione]) {
        if (typeof opzioni.onApriPannelloMail === "function") opzioni.onApriPannelloMail(azione);
        else nota(`${nome}: pannello non collegato in questa prova.`);
      } else {
        const custom = riquadroNota(nome);
        nota(custom || testoNonDisponibile(nome));
      }
    });
  });

  return overlay;
}

/** Nota specifica di un riquadro (per Account e simili), se prevista. */
function riquadroNota(nome) {
  for (const g of GRUPPI) {
    const r = g.riquadri.find((x) => x.nome === nome);
    if (r && r.nota) return r.nota;
  }
  return null;
}

/**
 * "Generale": l'unica voce oltre all'assistente già realizzata nel kernel è il
 * tema. La scelta è minima e vive qui, dentro il gruppo; salva subito e ha
 * effetto all'istante. `getTema`/`setTema` arrivano dal chiamante (main.js →
 * theme.js), così questo modulo non tocca il tema per conto suo.
 */
function apriGenerale(overlay, nota, opzioni = {}) {
  const esistente = overlay.querySelector(".settings-generale");
  if (esistente) {
    esistente.remove();
    return;
  }
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";
  const setTema = typeof opzioni.setTema === "function" ? opzioni.setTema : async () => {};
  const corrente = getTema();
  const prefs = (opzioni.impostazioni && opzioni.impostazioni.preferenze) || {};
  const onSalva = typeof opzioni.onSalva === "function" ? opzioni.onSalva : null;
  const onApplica = typeof opzioni.onApplica === "function" ? opzioni.onApplica : () => {};
  const onSvuotaCache = typeof opzioni.onSvuotaCache === "function" ? opzioni.onSvuotaCache : null;

  /** Le preferenze toccate da Generale (lingua risposte, cartella iniziale). */
  const campi = {
    linguaRisposte: prefs.linguaRisposte || "italiano",
    cartellaIniziale: prefs.cartellaIniziale || "INBOX",
  };
  const preferenze = () => Object.assign({}, prefs, campi);

  const box = document.createElement("div");
  box.className = "settings-generale";
  box.innerHTML = `
    <div class="settings-group-titolo">Tema</div>
    <div class="settings-riga">
      <label><input type="radio" name="tema" value="system"${corrente === "system" ? " checked" : ""}> Sistema</label>
      <label><input type="radio" name="tema" value="light"${corrente === "light" ? " checked" : ""}> Chiaro</label>
      <label><input type="radio" name="tema" value="dark"${corrente === "dark" ? " checked" : ""}> Scuro</label>
    </div>

    <div class="settings-group-titolo">Assistente IA</div>
    <div class="settings-grid">
      <div class="settings-lbl">Lingua delle risposte:</div>
      <input class="settings-fld" type="text" id="gen-lingua" autocomplete="off" value="${fuga(campi.linguaRisposte)}" />
    </div>

    <div class="settings-group-titolo">Avvio</div>
    <div class="settings-grid">
      <div class="settings-lbl">Cartella iniziale:</div>
      <input class="settings-fld" type="text" id="gen-cartella" autocomplete="off" value="${fuga(campi.cartellaIniziale)}" />
    </div>
    <p class="im-nota">La cartella iniziale è quella mostrata all'apertura della finestra principale (es. INBOX).</p>

    <div class="settings-group-titolo">Cache locale</div>
    <p class="im-nota">Svuota la cache locale dei messaggi scaricati. <b>Non</b> tocca la configurazione, le firme, i mittenti bloccati né il registro IA.</p>
    <div class="ai-avvia-riga">
      <button type="button" class="ai-btn2" id="gen-svuota">Svuota la cache locale</button>
      <span class="im-nota" id="gen-esito"></span>
    </div>`;
  overlay.querySelector(".settings-body").append(box);

  const salvaGenerale = async () => {
    onApplica(preferenze());
    if (!onSalva) {
      nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await onSalva({ theme: getTema(), preferenze: preferenze() });
      nota(esito || "Salvato.");
    } catch (e) {
      nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  };

  box.querySelectorAll('input[name="tema"]').forEach((r) =>
    r.addEventListener("change", async () => {
      await setTema(r.value);
      nota(`Tema impostato su «${r.value}».`);
    }),
  );
  box.querySelector("#gen-lingua").addEventListener("change", async (e) => {
    campi.linguaRisposte = e.target.value.trim() || "italiano";
    e.target.value = campi.linguaRisposte;
    await salvaGenerale();
  });
  box.querySelector("#gen-cartella").addEventListener("change", async (e) => {
    campi.cartellaIniziale = e.target.value.trim() || "INBOX";
    e.target.value = campi.cartellaIniziale;
    await salvaGenerale();
  });
  box.querySelector("#gen-svuota").addEventListener("click", async () => {
    const esitoEl = box.querySelector("#gen-esito");
    if (!onSvuotaCache) {
      esitoEl.textContent = "Svuotamento non collegato in questa prova.";
      return;
    }
    esitoEl.textContent = "Svuotamento…";
    try {
      esitoEl.textContent = (await onSvuotaCache()) || "Cache locale svuotata.";
    } catch (e) {
      esitoEl.textContent = `Non riuscito: ${e && e.message ? e.message : e}`;
    }
  });
}
