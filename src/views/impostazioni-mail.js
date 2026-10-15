/**
 * Pannelli delle impostazioni che governano il comportamento (blocco D, prima
 * metà): **Lettura**, **Composizione**, **Tipi di carattere**, **Correzione
 * automatica**, **Ortografia e grammatica**.
 *
 * Ogni voce qui ha un consumatore vero: la posizione del pannello di lettura
 * cambia il layout della finestra principale, la politica delle immagini decide
 * se chiamare `mail_body_con_immagini`, i secondi chiamano `mail_set_seen`, il
 * formato e le opzioni di composizione cambiano `compose.js`, la famiglia e la
 * dimensione del carattere vestono il corpo `contenteditable`, la correzione
 * automatica agisce mentre si scrive e l'ortografia toglie o mette `spellcheck`.
 *
 * Questo modulo tiene la **logica pura** (normalizzazioni e correzione
 * automatica) separata dal disegno, così si può collaudare con `node --test`
 * senza un DOM. Il tema e il salvataggio arrivano dal chiamante (`opzioni`),
 * esattamente come nel pannello Assistente IA.
 */

import {
  normalizzaSostituzioni,
  testoSostituzione,
} from "./sostituzioni.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

export { normalizzaSostituzioni, sostituzioneDaApplicare, applicaSostituzioni, sostituzioniPredefinite } from "./sostituzioni.js";

/** Posizioni ammesse per il pannello di lettura (specchia `config.rs`). */
export const PANNELLI_LETTURA = ["sotto", "destra", "nascosto"];
/** Politiche delle immagini (specchia `config.rs`). */
export const MODI_IMMAGINI = ["mai", "chiedi", "sempre"];
/** Formati di composizione (specchia `config.rs`). */
export const FORMATI_COMPOSIZIONE = ["html", "testo"];
/** Lingue offerte per il controllo ortografico. */
export const LINGUE_ORTOGRAFIA = ["it-IT", "en-US", "en-GB", "fr-FR", "de-DE", "es-ES"];
/** Intervallo della dimensione del carattere (specchia `config.rs`). */
export const DIMENSIONE_MIN = 8;
export const DIMENSIONE_MAX = 72;
/** Secondi massimi per "segna come letto dopo N secondi" (specchia `config.rs`). */
export const SEGNA_LETTO_SECONDI_MAX = 600;

/** Etichette leggibili delle posizioni del pannello di lettura. */
const ETICHETTE_PANNELLO = { sotto: "Sotto la lista", destra: "A destra", nascosto: "Nascosto" };
/** Etichette leggibili delle politiche delle immagini. */
const ETICHETTE_IMMAGINI = {
  mai: "Mai",
  chiedi: "Chiedi (pulsante «Mostra immagini»)",
  sempre: "Sempre",
};

/** Valore di pannello valido, altrimenti il default. */
export function normPannello(v, def = "sotto") {
  return PANNELLI_LETTURA.includes(v) ? v : def;
}

/** Politica delle immagini valida, altrimenti il default. */
export function normImmagini(v, def = "chiedi") {
  return MODI_IMMAGINI.includes(v) ? v : def;
}

/** Formato di composizione valido, altrimenti il default. */
export function normFormato(v, def = "html") {
  return FORMATI_COMPOSIZIONE.includes(v) ? v : def;
}

/**
 * Classe CSS che il layout della finestra principale deve indossare per la
 * posizione scelta: "" (sotto, il layout normale), "main--lettura-destra" o
 * "main--lettura-nascosta". È il calcolo che rende visibile la preferenza.
 */
export function classePannelloLettura(v) {
  const p = normPannello(v);
  if (p === "destra") return "main--lettura-destra";
  if (p === "nascosto") return "main--lettura-nascosta";
  return "";
}

/** Secondi per il segna-come-letto, portati nell'intervallo 0..MAX. */
export function secondiSegnaLetto(v) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, SEGNA_LETTO_SECONDI_MAX);
}

/** Dimensione del carattere nell'intervallo ammesso (default 12 se storta). */
export function limitaDimensione(v, def = 12) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < DIMENSIONE_MIN || n > DIMENSIONE_MAX) return def;
  return n;
}

/**
 * La famiglia ridotta ai soli caratteri ammessi in un nome di famiglia: lettere,
 * cifre, spazi e `-`/`_`/`,` (il separatore degli elenchi di famiglie).
 * Tutto il resto cade.
 *
 * Serve perché la famiglia finisce in un attributo `style` e dentro il
 * `<style>` del documento del corpo: lì l'escaping HTML **non** protegge, dato
 * che `&quot;` viene decodificato prima che il CSS sia letto. Una `;` o una `}`
 * di troppo cambierebbero le dichiarazioni. È anche la normalizzazione giusta
 * per il valore: un nome di famiglia non contiene altro.
 *
 * **Le virgolette sono escluse apposta**, sia doppie sia semplici. Una
 * virgoletta spaiata (`O'Brien`) aprirebbe una stringa CSS mai chiusa che
 * inghiotte il resto della regola: la dichiarazione verrebbe scartata **in
 * silenzio** e il messaggio tornerebbe al font del browser. Le virgolette non
 * servono comunque: il CSS accetta un nome di famiglia non quotato fatto di
 * parole separate da spazi, quindi `'Segoe UI'` e `Segoe UI` valgono uguale.
 */
export function soloFamiglia(valore, def = "Aptos") {
  const pulito = String(valore == null ? "" : valore)
    .replace(/[^A-Za-z0-9 \-_,]/g, "")
    .trim();
  return pulito || def;
}

/**
 * Stile del corpo di composizione: famiglia (default "Aptos" se vuota) e
 * dimensione (limitata all'intervallo). Restituisce i due valori pronti per
 * `font-family` / `font-size`.
 */
export function stileCarattere(famiglia, dimensione, defFamiglia = "Aptos", defDimensione = 12) {
  return {
    fontFamily: soloFamiglia(famiglia, defFamiglia),
    fontSize: limitaDimensione(dimensione, limitaDimensione(defDimensione)),
  };
}

/** Etichetta leggibile di una posizione del pannello. */
export function etichettaPannello(v) {
  return ETICHETTE_PANNELLO[normPannello(v)];
}

/** Etichetta leggibile di una politica delle immagini. */
export function etichettaImmagini(v) {
  return ETICHETTE_IMMAGINI[normImmagini(v)];
}

/** Titoli dei pannelli, per le prove visive e per il chiamante. */
export const TITOLI_PANNELLI = {
  lettura: "Lettura",
  composizione: "Composizione",
  carattere: "Tipi di carattere",
  correzione: "Correzione automatica",
  ortografia: "Ortografia e grammatica",
};

// ---------------------------------------------------------------------------
// Disegno dei pannelli (stesso stile del pannello Assistente IA).
// ---------------------------------------------------------------------------

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sostituzioni di esempio per il percorso browser (se ne mancano). */
export function sostituzioniDiRiserva() {
  return [
    { da: "nn", a: "non" },
    { da: "ke", a: "che" },
    { da: "xche", a: "perché" },
  ];
}

/** Corpo (markup interno) di un pannello, dato il sottoinsieme di preferenze. */
function corpoPannello(chiave, p) {
  if (chiave === "lettura") {
    return `
      <div class="settings-sec">Pannello di lettura</div>
      <div class="settings-hr"></div>
      <div class="settings-riga settings-riga--colonna">
        <label><input type="radio" name="lettura-pannello" value="sotto"${p.letturaPannello === "sotto" ? " checked" : ""}> Sotto la lista</label>
        <label><input type="radio" name="lettura-pannello" value="destra"${p.letturaPannello === "destra" ? " checked" : ""}> A destra</label>
        <label><input type="radio" name="lettura-pannello" value="nascosto"${p.letturaPannello === "nascosto" ? " checked" : ""}> Nascosto</label>
      </div>
      <label class="ai-check"><input type="checkbox" id="im-lt-anteprima"${p.letturaAnteprima ? " checked" : ""}> Mostra l'anteprima del testo nella lista</label>
      <div class="settings-grid">
        <div class="settings-lbl">Immagini dei messaggi:</div>
        <select class="settings-fld" id="im-lt-immagini">
          ${MODI_IMMAGINI.map((v) => `<option value="${v}"${v === p.letturaImmagini ? " selected" : ""}>${fuga(etichettaImmagini(v))}</option>`).join("")}
        </select>
        <div class="settings-lbl">Segna come letto dopo:</div>
        <div class="settings-inline">
          <input class="settings-fld settings-fld--num" type="number" id="im-lt-secondi" min="0" max="${SEGNA_LETTO_SECONDI_MAX}" value="${secondiSegnaLetto(p.letturaSegnaLettoDopo)}" />
          <span class="im-nota">secondi (0 = mai)</span>
        </div>
      </div>
      <p class="im-nota">Con «Mai» le immagini esterne restano bloccate e il pulsante non chiama il server; con «Sempre» arrivano subito, con «Chiedi» decidi messaggio per messaggio.</p>`;
  }

  if (chiave === "composizione") {
    return `
      <div class="settings-sec">Formato e testo</div>
      <div class="settings-hr"></div>
      <div class="settings-riga">
        <label><input type="radio" name="comp-formato" value="html"${p.composizioneFormato === "html" ? " checked" : ""}> HTML</label>
        <label><input type="radio" name="comp-formato" value="testo"${p.composizioneFormato === "testo" ? " checked" : ""}> Testo semplice</label>
      </div>
      <label class="ai-check"><input type="checkbox" id="im-cp-acapo"${p.composizioneACapo ? " checked" : ""}> A capo automatico nel corpo</label>

      <div class="settings-sec">Risposte</div>
      <div class="settings-hr"></div>
      <label class="ai-check"><input type="checkbox" id="im-cp-originale"${p.composizioneIncludiOriginale ? " checked" : ""}> Includi sempre il messaggio originale in Rispondi/Inoltra</label>
      <label class="ai-check"><input type="checkbox" id="im-cp-nuova"${p.composizioneNuovaFinestra ? " checked" : ""}> Apri le risposte in una nuova finestra</label>
      <p class="im-nota">Con «nuova finestra» una bozza già aperta resta aperta: Rispondi non la sostituisce. La v1 usa una sola finestra di sistema, quindi questa è la differenza osservabile.</p>`;
  }

  if (chiave === "carattere") {
    const st = stileCarattere(p.carattereFamiglia, p.carattereDimensione);
    return `
      <div class="settings-sec">Carattere del corpo</div>
      <div class="settings-hr"></div>
      <div class="settings-grid">
        <div class="settings-lbl">Famiglia:</div>
        <input class="settings-fld" type="text" id="im-cr-famiglia" autocomplete="off" value="${fuga(st.fontFamily)}" />
        <div class="settings-lbl">Dimensione:</div>
        <div class="settings-inline">
          <input class="settings-fld settings-fld--num" type="number" id="im-cr-dimensione" min="${DIMENSIONE_MIN}" max="${DIMENSIONE_MAX}" value="${st.fontSize}" />
          <span class="im-nota">punti (${DIMENSIONE_MIN}–${DIMENSIONE_MAX})</span>
        </div>
      </div>
      <div class="settings-sec">Anteprima</div>
      <div class="settings-hr"></div>
      <div class="im-anteprima" id="im-cr-anteprima" style="font-family:${fuga(st.fontFamily)};font-size:${st.fontSize}px">
        Buongiorno, questa è l'anteprima del carattere della bozza.
      </div>
      <p class="im-nota">La famiglia e la dimensione si applicano davvero al corpo della finestra di composizione (stile del corpo modificabile).</p>`;
  }

  if (chiave === "correzione") {
    return `
      <div class="settings-sec">Correzione automatica</div>
      <div class="settings-hr"></div>
      <label class="ai-check"><input type="checkbox" id="im-co-attiva"${p.correzioneAutomaticaAttiva ? " checked" : ""}> Correggi mentre scrivo</label>
      <div class="im-tab-sost" id="im-co-elenco"></div>
      <div class="settings-grid im-aggiungi">
        <input class="settings-fld" type="text" id="im-co-da" placeholder="scritto (es. nn)" autocomplete="off" />
        <input class="settings-fld" type="text" id="im-co-a" placeholder="corretto (es. non)" autocomplete="off" />
      </div>
      <div class="ai-avvia-riga">
        <button type="button" class="ai-btn2" id="im-co-aggiungi">Aggiungi sostituzione</button>
        <span class="im-nota" id="im-co-esito"></span>
      </div>
      <p class="im-nota">La sostituzione agisce a parola intera mentre scrivi: «nn» diventa «non», ma «Anna» non viene toccata.</p>`;
  }

  if (chiave === "ortografia") {
    return `
      <div class="settings-sec">Controllo ortografico</div>
      <div class="settings-hr"></div>
      <label class="ai-check"><input type="checkbox" id="im-or-attiva"${p.ortografiaAttiva ? " checked" : ""}> Controlla l'ortografia mentre scrivo</label>
      <div class="settings-grid">
        <div class="settings-lbl">Lingua:</div>
        <select class="settings-fld" id="im-or-lingua">
          ${LINGUE_ORTOGRAFIA.map((v) => `<option value="${v}"${v === p.ortografiaLingua ? " selected" : ""}>${fuga(v)}</option>`).join("")}
        </select>
      </div>
      <p class="im-nota">Il controllo ortografico lo offre la webview di sistema (WKWebView su macOS, WebView2 su Windows): l'app toglie o mette l'attributo <code>spellcheck</code> sul corpo e indica la lingua. Se la webview non supporta la lingua scelta, il sistema ripiega sulla lingua di macOS: l'app non finge un correttore proprio.</p>`;
  }

  return "";
}

/**
 * Apre un pannello delle impostazioni del blocco D.
 *
 * `opzioni`: `{ impostazioni, onSalva, onApplica, getTema }` — `onSalva(imp)`
 * persiste, `onApplica(preferenze)` fa avere effetto subito le preferenze
 * (layout di lettura, stile della composizione). Restituisce l'elemento overlay.
 */
export function apriPannelloMail(chiave, opzioni = {}) {
  const titolo = TITOLI_PANNELLI[chiave];
  if (!titolo) throw new Error(`pannello sconosciuto: ${chiave}`);
  document.querySelectorAll(".mail-settings-overlay").forEach((el) => el.remove());

  const base = (opzioni.impostazioni && opzioni.impostazioni.preferenze) || {};
  const inp = {
    letturaPannello: normPannello(base.letturaPannello),
    letturaAnteprima: !!base.letturaAnteprima,
    letturaImmagini: normImmagini(base.letturaImmagini),
    letturaSegnaLettoDopo: secondiSegnaLetto(base.letturaSegnaLettoDopo),
    composizioneFormato: normFormato(base.composizioneFormato),
    composizioneACapo: base.composizioneACapo !== false,
    composizioneIncludiOriginale: base.composizioneIncludiOriginale !== false,
    composizioneNuovaFinestra: !!base.composizioneNuovaFinestra,
    carattereFamiglia: stileCarattere(base.carattereFamiglia, base.carattereDimensione).fontFamily,
    carattereDimensione: stileCarattere(base.carattereFamiglia, base.carattereDimensione).fontSize,
    correzioneAutomaticaAttiva: base.correzioneAutomaticaAttiva !== false,
    correzioneSostituzioni: normalizzaSostituzioni(
      Array.isArray(base.correzioneSostituzioni) && base.correzioneSostituzioni.length
        ? base.correzioneSostituzioni
        : sostituzioniDiRiserva(),
    ),
    ortografiaAttiva: !!base.ortografiaAttiva,
    ortografiaLingua: base.ortografiaLingua || "it-IT",
  };

  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";
  const onSalva = typeof opzioni.onSalva === "function" ? opzioni.onSalva : async () => "Salvato (prova visiva).";
  const onApplica = typeof opzioni.onApplica === "function" ? opzioni.onApplica : () => {};

  /** Preferenze complete, con i campi non toccati da questo pannello conservati. */
  const preferenze = () => Object.assign({}, base, inp);

  const overlay = document.createElement("div");
  overlay.className = "mail-settings-overlay";
  overlay.dataset.pannello = chiave;
  overlay.innerHTML = `
    <div class="ai-settings-win mail-settings-win" role="dialog" aria-label="${fuga(titolo)}">
      <header class="settings-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="settings-title">${fuga(titolo)}</span>
        <button type="button" class="settings-showall">Mostra tutte</button>
      </header>
      <div class="ai-settings-body" id="im-body">${corpoPannello(chiave, inp)}</div>
      <div class="settings-nota" role="status" aria-live="polite"></div>
    </div>`;
  document.body.append(overlay);

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

  /** Salva e applica: prima l'effetto in memoria, poi la persistenza. */
  async function salva() {
    onApplica(preferenze());
    try {
      const esito = await onSalva({ theme: getTema(), preferenze: preferenze() });
      nota(esito || "Salvato.");
    } catch (e) {
      nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  }

  const q = (sel) => overlay.querySelector(sel);

  if (chiave === "lettura") {
    overlay.querySelectorAll('input[name="lettura-pannello"]').forEach((r) =>
      r.addEventListener("change", async () => {
        inp.letturaPannello = normPannello(r.value);
        onApplica(preferenze());
        await salva();
      }),
    );
    q("#im-lt-anteprima").addEventListener("change", async (e) => {
      inp.letturaAnteprima = e.target.checked;
      await salva();
    });
    q("#im-lt-immagini").addEventListener("change", async (e) => {
      inp.letturaImmagini = normImmagini(e.target.value);
      await salva();
    });
    q("#im-lt-secondi").addEventListener("change", async (e) => {
      inp.letturaSegnaLettoDopo = secondiSegnaLetto(e.target.value);
      e.target.value = inp.letturaSegnaLettoDopo;
      await salva();
    });
  } else if (chiave === "composizione") {
    overlay.querySelectorAll('input[name="comp-formato"]').forEach((r) =>
      r.addEventListener("change", async () => {
        inp.composizioneFormato = normFormato(r.value);
        await salva();
      }),
    );
    for (const [sel, campo] of [
      ["#im-cp-acapo", "composizioneACapo"],
      ["#im-cp-originale", "composizioneIncludiOriginale"],
      ["#im-cp-nuova", "composizioneNuovaFinestra"],
    ]) {
      q(sel).addEventListener("change", async (e) => {
        inp[campo] = e.target.checked;
        await salva();
      });
    }
  } else if (chiave === "carattere") {
    const anteprima = q("#im-cr-anteprima");
    const aggiornaAnteprima = () => {
      const st = stileCarattere(inp.carattereFamiglia, inp.carattereDimensione);
      anteprima.style.fontFamily = st.fontFamily;
      anteprima.style.fontSize = `${st.fontSize}px`;
    };
    q("#im-cr-famiglia").addEventListener("change", async (e) => {
      inp.carattereFamiglia = stileCarattere(e.target.value, inp.carattereDimensione).fontFamily;
      e.target.value = inp.carattereFamiglia;
      aggiornaAnteprima();
      await salva();
    });
    q("#im-cr-dimensione").addEventListener("change", async (e) => {
      inp.carattereDimensione = limitaDimensione(e.target.value);
      e.target.value = inp.carattereDimensione;
      aggiornaAnteprima();
      await salva();
    });
  } else if (chiave === "correzione") {
    const elenco = q("#im-co-elenco");
    const disegna = () => {
      if (!inp.correzioneSostituzioni.length) {
        elenco.innerHTML = `<div class="im-nota">Nessuna sostituzione: la correzione automatica non cambia nulla.</div>`;
        return;
      }
      elenco.innerHTML = inp.correzioneSostituzioni
        .map(
          (s, i) =>
            `<div class="im-riga-sost" data-indice="${i}">` +
            `<span class="im-da">${fuga(s.da)}</span><span class="im-freccia">→</span>` +
            `<span class="im-a">${fuga(s.a)}</span>` +
            `<button type="button" class="im-x" data-rimuovi="${i}" aria-label="Togli la sostituzione ${fuga(s.da)}">✕</button></div>`,
        )
        .join("");
      elenco.querySelectorAll("[data-rimuovi]").forEach((b) =>
        b.addEventListener("click", async () => {
          const i = Number(b.dataset.rimuovi);
          inp.correzioneSostituzioni = inp.correzioneSostituzioni.filter((_, j) => j !== i);
          disegna();
          await salva();
        }),
      );
    };
    disegna();
    q("#im-co-attiva").addEventListener("change", async (e) => {
      inp.correzioneAutomaticaAttiva = e.target.checked;
      await salva();
    });
    q("#im-co-aggiungi").addEventListener("click", async () => {
      const da = q("#im-co-da");
      const a = q("#im-co-a");
      const nuova = normalizzaSostituzioni([{ da: da.value, a: a.value }]);
      if (!nuova.length) {
        nota("Serve una parola da sostituire (non vuota).", true);
        return;
      }
      const esito = testoSostituzione(nuova[0], inp.correzioneSostituzioni);
      if (esito.duplicato) {
        nota(`«${nuova[0].da}» è già nell'elenco.`, true);
        return;
      }
      inp.correzioneSostituzioni = inp.correzioneSostituzioni.concat(nuova);
      da.value = "";
      a.value = "";
      disegna();
      await salva();
    });
  } else if (chiave === "ortografia") {
    q("#im-or-attiva").addEventListener("change", async (e) => {
      inp.ortografiaAttiva = e.target.checked;
      await salva();
    });
    q("#im-or-lingua").addEventListener("change", async (e) => {
      inp.ortografiaLingua = e.target.value || "it-IT";
      await salva();
    });
  }

  /** Api minima per le prove: applica la posizione di lettura senza toccare il file. */
  overlay.__impostaMail = (patch) => {
    Object.assign(inp, patch);
    onApplica(preferenze());
  };
  return overlay;
}
