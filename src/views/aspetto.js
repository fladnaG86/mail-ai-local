/**
 * Pannello «Aspetto» — tema (Chiaro/Scuro/Sistema) e colore accento.
 *
 * Etichette del riferimento: il pannello si chiama **Aspetto**
 * (`ZStrings.strings`, `/ERPreferencesWindow/Views/Appearance`; descrizione in
 * `Preferences.Panes.All.strings`: «Imposta le opzioni per l'aspetto e il tema»).
 * I due sfondi hanno i nomi reali `Visualizza con sfondo chiaro` / `Visualizza
 * con sfondo scuro` (`/outlook/messagepreviewpane/appearanceToggleSunButton` e
 * `…MoonButton`), letti dall'app installata.
 *
 * Le tinte della tavolozza dell'accento **non sono inventate**: sono le tinte
 * misurate in `docs/riferimento-outlook/colori-misurati.md` — il blu è
 * `BlueButtonPrimaryBackgroundDefaultColor` (#0078D4, chiaro) e `GroupCardBlueColor`;
 * le altre sono i preset categoria di Outlook, già usati dai token `--cat-*` di
 * `src/styles/tokens.css`. Le varianti hover/pressed/disabled sono **derivate**
 * dalla tinta scelta (nessun colore arbitrario), con la stessa regola usata dal
 * client: chiaro = tinta piena, scuro = tinta schiarita.
 *
 * Ha due parti, come gli altri moduli delle viste:
 * - le funzioni PURE (normalizzazione, mescolanza dei colori, derivazione delle
 *   varianti, CSS generato): le collaudano i test `node:test`, senza DOM;
 * - il pannello vero e proprio.
 */

import { apriOverlayPannello, fuga } from "./blocco-i2.js";

// ---------------------------------------------------------------------------
// Funzioni PURE
// ---------------------------------------------------------------------------

/** Le tre scelte di tema, con le etichette usate anche dal pannello «Generale». */
export const TEMA_SCELTE = [
  { id: "system", etichetta: "Sistema" },
  { id: "light", etichetta: "Chiaro" },
  { id: "dark", etichetta: "Scuro" },
];

/**
 * Tavolozza dell'accento: sei tinte reali misurate dall'app.
 * `tinta` è il valore base (chiaro); gli altri token si derivano da qui.
 */
export const ACCENTI = [
  { id: "blu", nome: "Blu", tinta: "#0078D4" },
  { id: "verde", nome: "Verde", tinta: "#107C10" },
  { id: "viola", nome: "Viola", tinta: "#8764B8" },
  { id: "rosso", nome: "Rosso", tinta: "#D13438" },
  { id: "arancione", nome: "Arancione", tinta: "#F7630C" },
  { id: "giallo", nome: "Giallo", tinta: "#FFB900" },
];

/** Accento predefinito: il blu misurato (`BlueButtonPrimaryBackgroundDefaultColor`). */
export const ACCENTO_DEFAULT = "blu";

/** Id accento valido o il default `blu`. */
export function normAccento(id) {
  return ACCENTI.some((a) => a.id === id) ? id : ACCENTO_DEFAULT;
}

/** Nome leggibile di un accento (fallback: Blu). */
export function etichettaAccento(id) {
  const a = ACCENTI.find((x) => x.id === normAccento(id));
  return a.nome;
}

/** La tinta base di un accento (fallback: il blu). */
export function tintaAccento(id) {
  const a = ACCENTI.find((x) => x.id === normAccento(id));
  return a.tinta;
}

/** Le componenti 0..255 di un `#RRGGBB`. `null` se il colore non è leggibile. */
function componenti(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex == null ? "" : hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#RRGGBB` maiuscolo da tre componenti 0..255 (limitate ai bordi). */
function esadecimale(rgb) {
  return (
    "#" +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))))
      .map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
      .join("")
  );
}

/**
 * Luminanza relativa 0..1 di un colore (formula WCAG). Serve a scegliere il
 * colore del testo sopra l'accento: bianco sulle tinte scure, quasi-nero sulle
 * tinte chiare. Un colore illeggibile dà 0 (trattato come scuro).
 */
export function luminanza(hex) {
  const rgb = componenti(hex);
  if (!rgb) return 0;
  const lineare = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lineare[0] + 0.7152 * lineare[1] + 0.0722 * lineare[2];
}

/**
 * Mescola `hex` verso il **bianco** o verso il **nero** di `quantita` (0..1).
 * `quantita` 0 = colore invariato, 1 = bianco/nero pieno. Un verso sconosciuto
 * lascia il colore com'è: nessun colore inventato. Il colore di partenza
 * illeggibile resta invariato.
 */
export function mescolaColore(hex, verso, quantita) {
  const rgb = componenti(hex);
  if (!rgb) return String(hex == null ? "" : hex);
  const q = Math.max(0, Math.min(1, Number(quantita) || 0));
  const meta = verso === "bianco" ? 255 : verso === "nero" ? 0 : null;
  if (meta === null) return esadecimale(rgb);
  return esadecimale(rgb.map((c) => c + (meta - c) * q));
}

/** Colore del testo sopra un accento: bianco sulle tinte scure, nero sulle chiare. */
function testoContrasto(hex) {
  return luminanza(hex) > 0.3 ? "#1E1E1E" : "#FFFFFF";
}

/**
 * Deriva i token `--accent*` dalla tinta scelta, per i due temi.
 *
 * - **chiaro**: l'accento è la tinta stessa; hover e pressed sono più scuri
 *   (retaggio del bordo del pulsante misurato), il disattivato è schiarito;
 * - **scuro**: l'accento è la tinta schiarita — è la regola dell'app reale, dove
 *   il blu `#0078D4` in scuro diventa `#4BA0FF`.
 * Il testo si sceglie dalla luminanza dell'accento risultante.
 */
export function derivaVarianti(tinta) {
  const base = componenti(tinta) ? esadecimale(componenti(tinta)) : "#0078D4";
  const accentScuro = mescolaColore(base, "bianco", 0.3);
  return {
    chiaro: {
      accent: base,
      hover: mescolaColore(base, "nero", 0.12),
      pressed: mescolaColore(base, "nero", 0.28),
      disabled: mescolaColore(base, "bianco", 0.55),
      text: testoContrasto(base),
    },
    scuro: {
      accent: accentScuro,
      hover: mescolaColore(accentScuro, "nero", 0.1),
      pressed: mescolaColore(base, "nero", 0.35),
      disabled: mescolaColore(accentScuro, "nero", 0.45),
      text: testoContrasto(accentScuro),
    },
  };
}

/** Le varianti di un accento per id (normalizza prima). */
export function variantiAccento(id) {
  return derivaVarianti(tintaAccento(id));
}

/**
 * CSS da iniettare per un accento: due regole, una per tema, così il cambio di
 * tema (chiaro/scuro/sistema) segue da sé senza riapplicare nulla. L'id è
 * normalizzato: un id sconosciuto produce le regole del blu.
 */
export function cssAccenti(id) {
  const scelto = normAccento(id);
  const v = variantiAccento(scelto);
  const regola = (tema, c) =>
    `:root[data-theme="${tema}"][data-accento="${scelto}"] {\n` +
    `  --accent: ${c.accent};\n` +
    `  --accent-hover: ${c.hover};\n` +
    `  --accent-pressed: ${c.pressed};\n` +
    `  --accent-disabled: ${c.disabled};\n` +
    `  --accent-text: ${c.text};\n}`;
  return `${regola("light", v.chiaro)}\n${regola("dark", v.scuro)}\n`;
}

/** Identificativo del foglio di stile dell'accento, per ritrovarlo e sostituirlo. */
export const STILE_ACCENTO_ID = "accento-scelto";

/**
 * Applica l'accento: scrive `data-accento` sul `<html>` e inietta (o sostituisce)
 * una regola sui token `--accent*`. Con il default `blu` la regola si **rimuove**:
 * così valgono i token misurati di `tokens.css`, senza toccarli.
 */
export function applicaAccento(id, doc = document) {
  const scelto = normAccento(id);
  doc.documentElement.dataset.accento = scelto;
  let stile = doc.getElementById(STILE_ACCENTO_ID);
  if (scelto === ACCENTO_DEFAULT) {
    if (stile) stile.remove();
    return;
  }
  if (!stile) {
    stile = doc.createElement("style");
    stile.id = STILE_ACCENTO_ID;
    doc.head.append(stile);
  }
  stile.textContent = cssAccenti(scelto);
}

// ---------------------------------------------------------------------------
// Interfaccia — pannello «Aspetto»
// ---------------------------------------------------------------------------

/** Un campione di colore cliccabile della tavolozza dell'accento. */
function htmlTinta(a, scelto) {
  const scelta = a.id === scelto;
  return `<button type="button" class="aspetto-tinta${scelta ? " aspetto-tinta--scelta" : ""}"
      data-accento="${fuga(a.id)}" title="${fuga(a.nome)}" aria-pressed="${scelta ? "true" : "false"}"
      aria-label="${fuga(a.nome)}">
      <span class="aspetto-tinta-pallino" style="background:${fuga(a.tinta)}"></span>
      <span class="aspetto-tinta-nome">${fuga(a.nome)}</span>
    </button>`;
}

/**
 * Apre il pannello «Aspetto». Il tema passa da `opzioni.getTema`/`setTema`
 * (theme.js), l'accento si applica subito (`opzioni.onApplica`) e si salva
 * (`opzioni.onSalva`).
 */
export function apriPannelloAspetto(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const accento = normAccento(prefs.accento);
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";
  const setTema = typeof opzioni.setTema === "function" ? opzioni.setTema : async () => {};
  const applica = typeof opzioni.onApplica === "function" ? opzioni.onApplica : () => {};
  const tema = getTema();

  const p = apriOverlayPannello(
    "Aspetto",
    `<div class="settings-sec">Tema</div>
     <div class="settings-hr"></div>
     <div class="settings-riga">
       ${TEMA_SCELTE.map(
         (t) =>
           `<label><input type="radio" name="aspetto-tema" value="${fuga(t.id)}"${t.id === tema ? " checked" : ""}> ${fuga(t.etichetta)}</label>`,
       ).join("")}
     </div>
     <div class="settings-sec">Colore accento</div>
     <div class="settings-hr"></div>
     <div class="aspetto-tinte">
       ${ACCENTI.map((a) => htmlTinta(a, accento)).join("")}
     </div>
     <p class="im-nota">Il colore accento veste la barra multifunzione, i pulsanti principali e la voce selezionata. Le tinte sono quelle misurate dall'app reale; le varianti (hover, pressed, disattivato) sono derivate dalla tinta scelta.</p>
     <p class="im-nota">Il tema ha effetto immediato, senza ricaricare l'app; le due voci <b>sfondo chiaro</b> e <b>sfondo scuro</b> sono quelle del riferimento.</p>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);

  const salva = async (nuove) => {
    applica(Object.assign({}, opzioni.preferenze, nuove));
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({ theme: getTema(), preferenze: Object.assign({}, opzioni.preferenze, nuove) });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  };

  p.overlay.querySelectorAll('input[name="aspetto-tema"]').forEach((r) =>
    r.addEventListener("change", async () => {
      await setTema(r.value);
      p.nota(`Tema impostato su «${r.value}».`);
    }),
  );

  p.overlay.querySelectorAll(".aspetto-tinta").forEach((b) =>
    b.addEventListener("click", async () => {
      const scelto = b.dataset.accento;
      p.overlay.querySelectorAll(".aspetto-tinta").forEach((x) => {
        const attivo = x === b;
        x.classList.toggle("aspetto-tinta--scelta", attivo);
        x.setAttribute("aria-pressed", attivo ? "true" : "false");
      });
      await salva({ accento: scelto });
    }),
  );
  return p.overlay;
}
