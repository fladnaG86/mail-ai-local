/**
 * Blocco O — pannello «Categorie».
 *
 * Come gli altri moduli delle viste, ha due parti ben separate:
 * - le funzioni PURE (tavolozza dei colori, normalizzazione dell'elenco,
 *   riordino, voci del menu «Categorizza»): le collaudano i test `node:test`,
 *   senza DOM e senza kernel;
 * - il pannello (`apriPannelloCategorie`), costruito con `chromePannello` /
 *   `apriOverlayPannello` del blocco I2.
 *
 * Etichette del riferimento: il riquadro si chiama **Categorie**
 * (`Preferences.Panes.All.strings`, «Consente di aggiungere, eliminare o
 * modificare le categorie usate per organizzare elementi di Outlook») e il
 * pannello ha **Nome** e **Colore** (`Preferences.Panes.Categories.strings`).
 * Le categorie predefinite sono quelle di Outlook (nomi reali da
 * `ZStrings.strings`, chiavi `/outlook/Exchange/MasterCategories/*category`):
 * Rosso, Blu, Verde, Arancione, Viola, Giallo.
 *
 * I COLORI non sono inventati: sono le tinte delle categorie di Outlook, gli
 * stessi valori che il client usa per i preset `Preset0/1/3/4/7/8` della
 * tavolozza OWA (Microsoft Learn, `Office.MailboxEnums.CategoryColor`). Dove
 * l'app installata li porta con sé, il valore coincide con quello misurato
 * (`docs/riferimento-outlook/colori-misurati.md`: il rosso `#D13438` è
 * `CalendarThemeHeaderColorRed`, il blu `#0078D4` è `GroupCardBlueColor`).
 * Sono esposti anche come token CSS in `src/styles/tokens.css` (`--cat-*`).
 */

import { fugaHtml } from "./mail-actions.js";
import { apriOverlayPannello } from "./blocco-i2.js";

// ---------------------------------------------------------------------------
// Funzioni PURE
// ---------------------------------------------------------------------------

/**
 * La tavolozza delle categorie: sei tinte, ognuna con un id stabile (quello
 * salvato in `config.json`, campo `colore`) e il valore esadecimale mostrato.
 * L'ordine è quello della tavolozza di Outlook.
 */
export const TAVOLOZZA_CATEGORIE = [
  { id: "rosso", etichetta: "Rosso", colore: "#D13438" },
  { id: "arancione", etichetta: "Arancione", colore: "#F7630C" },
  { id: "giallo", etichetta: "Giallo", colore: "#FFB900" },
  { id: "verde", etichetta: "Verde", colore: "#107C10" },
  { id: "blu", etichetta: "Blu", colore: "#0078D4" },
  { id: "viola", etichetta: "Viola", colore: "#8764B8" },
];

/** Tinta predefinita quando il colore è assente o sconosciuto. */
export const COLORE_CATEGORIA_DEFAULT = "blu";

/** Numero massimo di categorie accettate (come il kernel). */
export const CATEGORIE_MAX = 100;

/** Le categorie predefinite di Outlook (nomi e colori del riferimento). */
export function categoriePredefinite() {
  return normalizzaCategorie([
    { id: "rosso", nome: "Rosso", colore: "rosso" },
    { id: "blu", nome: "Blu", colore: "blu" },
    { id: "verde", nome: "Verde", colore: "verde" },
    { id: "arancione", nome: "Arancione", colore: "arancione" },
    { id: "viola", nome: "Viola", colore: "viola" },
    { id: "giallo", nome: "Giallo", colore: "giallo" },
  ]);
}

/** Vero se `id` è una tinta della tavolozza. */
export function coloreValido(id) {
  return TAVOLOZZA_CATEGORIE.some((c) => c.id === id);
}

/** L'id della tinta giusto (sconosciuto → default). */
export function normColore(id) {
  return coloreValido(id) ? id : COLORE_CATEGORIA_DEFAULT;
}

/** Il valore esadecimale di una tinta (id sconosciuto → default). */
export function coloreEsadecimale(id) {
  const c = TAVOLOZZA_CATEGORIE.find((x) => x.id === normColore(id));
  return c ? c.colore : "#0078D4";
}

/** L'etichetta leggibile di una tinta («Rosso», «Blu», …). */
export function etichettaColore(id) {
  const c = TAVOLOZZA_CATEGORIE.find((x) => x.id === normColore(id));
  return c ? c.etichetta : "Blu";
}

const pulito = (v) => String(v == null ? "" : v).trim();

/**
 * Tiene solo le categorie sensate: nome non vuoto, id non vuoto (generato se
 * assente: `categoria1`, `categoria2`, …), niente id o nomi duplicati (vince la
 * prima, senza badare alle maiuscole), colore sconosciuto → default. Al massimo
 * `CATEGORIE_MAX` voci. Non muta l'elenco originale. È lo specchio puro della
 * `normalizza_categorie` del kernel.
 */
export function normalizzaCategorie(elenco) {
  const out = [];
  const idVisti = new Set();
  const nomiVisti = new Set();
  (Array.isArray(elenco) ? elenco : []).forEach((c, i) => {
    if (!c) return;
    const nome = pulito(c.nome);
    if (!nome) return; // il nome vuoto è scartato
    const nomeChiave = nome.toLowerCase();
    if (nomiVisti.has(nomeChiave)) return; // duplicato per nome → scartato
    let id = pulito(c.id) || `categoria${i + 1}`;
    if (idVisti.has(id)) return;
    idVisti.add(id);
    nomiVisti.add(nomeChiave);
    out.push({ id, nome, colore: normColore(c.colore) });
  });
  return out.slice(0, CATEGORIE_MAX);
}

/** Un id libero per una nuova categoria (`categoria1`, `categoria2`, …). */
export function nuovoId(categorie) {
  const usati = new Set((categorie || []).map((c) => c.id));
  let n = (categorie || []).length + 1;
  while (usati.has(`categoria${n}`)) n += 1;
  return `categoria${n}`;
}

/** La categoria con quel nome, o `null` (confronto senza badare a maiuscole/spazi). */
export function categoriaPerNome(categorie, nome) {
  const chiave = pulito(nome).toLowerCase();
  if (!chiave) return null;
  return (categorie || []).find((c) => pulito(c.nome).toLowerCase() === chiave) || null;
}

/**
 * Rinomina la voce in posizione `i` con `nuovoNome`. Restituisce l'elenco
 * aggiornato, oppure `null` se il nome è vuoto o **un'altra** categoria lo
 * porta già (stesso confronto di `categoriaPerNome`, senza badare a
 * maiuscole/spazi). Il duplicato si rifiuta qui, come all'aggiunta: il kernel
 * non lo respinge, ma la sua `normalizza_categorie` lo scarterebbe al riavvio,
 * facendo sparire una categoria senza avviso. Non muta l'originale.
 */
export function rinominaCategoria(categorie, i, nuovoNome) {
  const elenco = categorie || [];
  const nome = pulito(nuovoNome);
  const corrente = elenco[i];
  if (!nome || !corrente) return null;
  const altro = categoriaPerNome(elenco, nome);
  if (altro && altro.id !== corrente.id) return null;
  return elenco.map((c, k) => (k === i ? Object.assign({}, c, { nome }) : c));
}

/** `{ nome: esadecimale }` per colorare le targhette dei messaggi. */
export function mappaColoriCategorie(categorie) {
  const mappa = {};
  for (const c of categorie || []) {
    if (c && c.nome) mappa[pulito(c.nome)] = coloreEsadecimale(c.colore);
  }
  return mappa;
}

/**
 * Le targhette delle categorie di un messaggio, con il pallino del colore
 * definito. `mappa` è `{ nome: esadecimale }` (vedi `mappaColoriCategorie`): una
 * categoria senza colore definito resta una targhetta neutra. I nomi scritti
 * dall'utente sono sempre fugati.
 */
export function targhetteCategorie(nomi, mappa) {
  return (nomi || [])
    .map((nome) => {
      const colore = mappa && mappa[pulito(nome)];
      if (!colore) return `<span class="cat-tag">${fugaHtml(nome)}</span>`;
      return (
        `<span class="cat-tag cat-tag--colorato" style="--cat-colore:${fugaHtml(colore)}">` +
        `${fugaHtml(nome)}</span>`
      );
    })
    .join("");
}

/**
 * Riordina l'elenco spostando la voce in posizione `i` di `verso` posti
 * (-1 in su, +1 in giù). Ai bordi non cambia nulla. Non muta l'originale.
 */
export function spostaCategoria(categorie, i, verso) {
  const elenco = (categorie || []).slice();
  const j = i + (verso < 0 ? -1 : 1);
  if (i < 0 || i >= elenco.length || j < 0 || j >= elenco.length) return elenco;
  const [voce] = elenco.splice(i, 1);
  elenco.splice(j, 0, voce);
  return elenco;
}

/** Testo della conferma prima di **eliminare** una categoria (mai muta). */
export function testoConfermaEliminaCategoria(nome) {
  return `Eliminare la categoria «${pulito(nome)}»? I messaggi che la portano non cambiano.`;
}

/**
 * Le voci del menu «Categorizza» per un messaggio: una voce per categoria
 * definita, con il suo colore e la spunta se il messaggio la porta già.
 */
export function vociMenuCategorie(categorie, attuali = []) {
  const portate = (attuali || []).map((x) => pulito(x).toLowerCase());
  return (categorie || []).map((c) => ({
    id: c.nome,
    etichetta: c.nome,
    ic: "●",
    colore: coloreEsadecimale(c.colore),
    attivo: portate.includes(pulito(c.nome).toLowerCase()),
  }));
}

// ---------------------------------------------------------------------------
// Interfaccia — pannello «Categorie»
// ---------------------------------------------------------------------------

/** Una tinta della tavolozza come pulsante (id del colore nell'attributo). */
function htmlTinta(c, scelta) {
  return (
    `<button type="button" class="cat-tinta${c.id === scelta ? " cat-tinta--scelta" : ""}" ` +
    `data-colore="${c.id}" title="${fugaHtml(c.etichetta)}" aria-label="${fugaHtml(c.etichetta)}" ` +
    `style="--cat-colore:${c.colore}"></button>`
  );
}

/** La tavolozza dei colori (per l'aggiunta e per la modifica di una voce). */
function htmlTavolozza(scelta) {
  return `<div class="cat-tavolozza">${TAVOLOZZA_CATEGORIE.map((c) => htmlTinta(c, scelta)).join("")}</div>`;
}

/** Una riga dell'elenco: pallino colorato, nome, riordino, rinomina, elimina. */
function htmlRiga(c, i, n) {
  return `
    <div class="cat-riga" data-id="${fugaHtml(c.id)}">
      <button type="button" class="cat-pallino" data-azione="colore" style="--cat-colore:${coloreEsadecimale(c.colore)}" title="Colore: ${fugaHtml(etichettaColore(c.colore))}" aria-label="Cambia colore"></button>
      <span class="cat-nome" title="${fugaHtml(c.nome)}">${fugaHtml(c.nome)}</span>
      <span class="cat-azioni">
        <button type="button" class="cat-freccia" data-azione="su" title="Sposta su" aria-label="Sposta su"${i === 0 ? " disabled" : ""}>▲</button>
        <button type="button" class="cat-freccia" data-azione="giu" title="Sposta giù" aria-label="Sposta giù"${i === n - 1 ? " disabled" : ""}>▼</button>
        <button type="button" class="cat-btn" data-azione="rinomina">Rinomina</button>
        <button type="button" class="cat-btn cat-btn--elimina" data-azione="elimina">Elimina</button>
      </span>
      <div class="cat-colori" hidden>${htmlTavolozza(c.colore)}</div>
    </div>`;
}

/**
 * Apre il pannello «Categorie».
 *
 * `opzioni.categorie` è l'elenco corrente (`[{ id, nome, colore }]`); le
 * modifiche si applicano subito con `opzioni.onApplica(preferenze)` e si salvano
 * con `opzioni.onSalva({ theme, preferenze })` — le stesse della finestra delle
 * impostazioni. `opzioni.onConferma(titolo, testo)` chiede la conferma prima di
 * eliminare (la modale dell'app); assente, si usa `window.confirm`.
 */
export function apriPannelloCategorie(opzioni = {}) {
  let categorie = normalizzaCategorie(opzioni.categorie || categoriePredefinite());

  const contenuto = `
    <div class="settings-sec">Categorie</div>
    <div class="settings-hr"></div>
    <p class="im-nota">Le categorie le definisci tu: un nome e un colore, salvati in <b>config.json</b>. Assegnandone una a un messaggio, i nomi restano scritti sul server come <b>keyword IMAP</b> quando il server le supporta. I colori sono le tinte delle categorie di Outlook.</p>
    <div class="cat-elenco" id="cat-elenco"></div>
    <div class="settings-sec">Aggiungi categoria</div>
    <div class="settings-hr"></div>
    <div class="cat-nuova">
      <input class="settings-fld" type="text" id="cat-nuovo-nome" placeholder="Nome categoria" autocomplete="off" />
      <div id="cat-nuovo-colore">${htmlTavolozza(COLORE_CATEGORIA_DEFAULT)}</div>
      <div class="ai-avvia-riga">
        <button type="button" class="ai-btn2" id="cat-aggiungi">Aggiungi categoria</button>
      </div>
    </div>`;

  const p = apriOverlayPannello("Categorie", contenuto, opzioni);
  const q = (sel) => p.overlay.querySelector(sel);
  const elencoEl = q("#cat-elenco");
  let nuovoColore = COLORE_CATEGORIA_DEFAULT;

  /** Applica (in memoria) e salva; mostra l'esito nella nota del pannello. */
  async function salva(messaggio) {
    const preferenze = Object.assign({}, opzioni.preferenze, { categorie });
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze);
    if (typeof opzioni.onSalva !== "function") {
      p.nota(messaggio || "Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({
        theme: typeof opzioni.getTema === "function" ? opzioni.getTema() : "system",
        preferenze,
      });
      p.nota(messaggio || esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  }

  function disegnaElenco() {
    elencoEl.innerHTML = categorie.map((c, i) => htmlRiga(c, i, categorie.length)).join("");
    elencoEl.querySelectorAll(".cat-riga").forEach((riga) => {
      const i = categorie.findIndex((c) => c.id === riga.dataset.id);
      if (i < 0) return;
      const coloriEl = riga.querySelector(".cat-colori");
      riga.querySelector('[data-azione="colore"]').addEventListener("click", () => {
        coloriEl.hidden = !coloriEl.hidden;
      });
      coloriEl.querySelectorAll(".cat-tinta").forEach((tinta) =>
        tinta.addEventListener("click", () => {
          categorie = categorie.map((c, k) => (k === i ? Object.assign({}, c, { colore: tinta.dataset.colore }) : c));
          disegnaElenco();
          salva(`Colore di «${categorie[i].nome}» aggiornato.`);
        }),
      );
      riga.querySelector('[data-azione="su"]').addEventListener("click", () => {
        categorie = spostaCategoria(categorie, i, -1);
        disegnaElenco();
        salva("Ordine aggiornato.");
      });
      riga.querySelector('[data-azione="giu"]').addEventListener("click", () => {
        categorie = spostaCategoria(categorie, i, 1);
        disegnaElenco();
        salva("Ordine aggiornato.");
      });
      riga.querySelector('[data-azione="rinomina"]').addEventListener("click", () => {
        avviaRinomina(riga, i);
      });
      riga.querySelector('[data-azione="elimina"]').addEventListener("click", () => {
        elimina(i);
      });
    });
  }

  /** Trasforma il nome in un campo: Invio o uscita salvano, Esc annulla. */
  function avviaRinomina(riga, i) {
    const nomeEl = riga.querySelector(".cat-nome");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "settings-fld cat-nome-input";
    input.value = categorie[i].nome;
    nomeEl.replaceWith(input);
    input.focus();
    input.select();
    let fatto = false;
    const conferma = () => {
      if (fatto) return;
      fatto = true;
      const nuovo = input.value.trim();
      if (!nuovo || nuovo === categorie[i].nome) {
        disegnaElenco();
        return;
      }
      // Stesso controllo di unicità dell'aggiunta: un nome già in uso si
      // rifiuta con un messaggio, invece di lasciarlo scartare in silenzio
      // dalla normalizzazione al riavvio (la categoria sparirebbe).
      const aggiornate = rinominaCategoria(categorie, i, nuovo);
      if (!aggiornate) {
        p.nota(`«${nuovo}» esiste già.`, true);
        disegnaElenco();
        return;
      }
      categorie = aggiornate;
      disegnaElenco();
      salva(`Categoria rinominata in «${nuovo}».`);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        conferma();
      } else if (e.key === "Escape") {
        fatto = true;
        disegnaElenco();
      }
    });
    input.addEventListener("blur", conferma);
  }

  async function elimina(i) {
    const nome = categorie[i].nome;
    let ok = true;
    if (typeof opzioni.onConferma === "function") {
      ok = await opzioni.onConferma("Elimina categoria", testoConfermaEliminaCategoria(nome));
    } else if (typeof window !== "undefined" && window.confirm) {
      ok = window.confirm(testoConfermaEliminaCategoria(nome));
    }
    if (!ok) return;
    categorie = categorie.filter((_, k) => k !== i);
    disegnaElenco();
    salva(`Categoria «${nome}» eliminata.`);
  }

  // Tavolozza dell'aggiunta: sceglie la tinta della nuova categoria.
  const tinteNuova = q("#cat-nuovo-colore").querySelectorAll(".cat-tinta");
  tinteNuova.forEach((tinta) =>
    tinta.addEventListener("click", () => {
      nuovoColore = tinta.dataset.colore;
      tinteNuova.forEach((t) => t.classList.toggle("cat-tinta--scelta", t === tinta));
    }),
  );

  q("#cat-aggiungi").addEventListener("click", () => {
    const input = q("#cat-nuovo-nome");
    const nome = input.value.trim();
    if (!nome) {
      p.nota("Serve un nome per la categoria.", true);
      input.focus();
      return;
    }
    if (categoriaPerNome(categorie, nome)) {
      p.nota(`«${nome}» esiste già.`, true);
      return;
    }
    const id = nuovoId(categorie);
    categorie = normalizzaCategorie(categorie.concat({ id, nome, colore: nuovoColore }));
    input.value = "";
    disegnaElenco();
    salva(`Categoria «${nome}» aggiunta.`);
  });

  disegnaElenco();
  return p.overlay;
}
