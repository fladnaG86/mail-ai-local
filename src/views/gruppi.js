/**
 * Blocco U4 — finestra «Gruppi» della rubrica: gruppi di contatti (liste di
 * distribuzione) con un nome e degli indirizzi. Nei campi A/Cc un gruppo si
 * espande negli indirizzi dei membri (`collegaCampoDestinatario`): al server
 * arrivano solo indirizzi. Stesso aspetto e stessi comportamenti della rubrica.
 */
import { rendiSpostabile } from "./finestre.js";
import { fugaHtml as fuga } from "./mail-actions.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Gruppi d'esempio per le prove visive nel browser. */
const GRUPPI_ESEMPIO = [
  { id: 1, nome: "Ufficio tecnico", membri: ["luca.bianchi@esempiogroup.it", "marco.ferrari@esempiogroup.it"] },
  { id: 2, nome: "Commerciale", membri: ["anna.verdi@example.it"] },
];

/** Indirizzo «nome@dominio.tld» senza spazi: basta a scovare un errore di battitura. */
const INDIRIZZO = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * I membri scritti nel modulo: uno per riga, o separati da virgola o punto e
 * virgola. Restituisce gli indirizzi validi e quelli scritti male.
 */
export function membriDaTesto(testo) {
  const validi = [];
  const errati = [];
  for (const pezzo of String(testo || "").split(/[\n,;]+/)) {
    const m = pezzo.trim();
    if (!m) continue;
    if (!INDIRIZZO.test(m)) errati.push(m);
    else if (!validi.includes(m)) validi.push(m);
  }
  return { validi, errati };
}

function riga(g) {
  const n = (g.membri || []).length;
  return `<div class="rubrica-riga" role="option" data-id="${g.id}">
      <span class="rubrica-nome">${fuga(g.nome)}</span>
      <span class="rubrica-mail">${n} ${n === 1 ? "membro" : "membri"}</span>
    </div>`;
}

function modulo(g) {
  const nuovo = !g || !g.id;
  return `<div class="rubrica-modulo">
      <div class="rubrica-modulo-titolo">${nuovo ? "Nuovo gruppo" : "Modifica gruppo"}</div>
      <label class="rubrica-campo"><span>Nome del gruppo</span>
        <input type="text" data-gruppo="nome" value="${fuga((g && g.nome) || "")}" autocomplete="off" spellcheck="false" /></label>
      <label class="rubrica-campo"><span>Membri (un indirizzo per riga)</span>
        <textarea data-gruppo="membri" rows="8" spellcheck="false">${fuga(((g && g.membri) || []).join("\n"))}</textarea></label>
      <div class="rubrica-modulo-azioni">
        <button type="button" class="rubrica-btn" data-form="annulla">Annulla</button>
        <button type="button" class="rubrica-btn rubrica-btn--ok" data-form="salva">Salva</button>
      </div>
    </div>`;
}

function markup() {
  return `
  <div class="rubrica-win" role="dialog" aria-label="Gruppi">
    <header class="rubrica-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="rubrica-title">Gruppi</span>
    </header>
    <div class="rubrica-toolbar">
      <button type="button" class="rubrica-btn" data-az="nuovo">＋ Nuovo gruppo</button>
      <button type="button" class="rubrica-btn" data-az="modifica">Modifica</button>
      <button type="button" class="rubrica-btn" data-az="elimina">Elimina</button>
    </div>
    <div class="rubrica-corpo">
      <div class="rubrica-lista" role="listbox" aria-label="Gruppi"></div>
      <div class="rubrica-scheda"></div>
    </div>
    <div class="rubrica-nota" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Apre la finestra dei gruppi.
 *
 * `opzioni`: `onElenco()` → gruppi (dentro Tauri `gruppi_elenco`; assente =
 * gruppi d'esempio), `onSalva(gruppo)` → id, `onElimina(id)` → numero.
 */
export function apriGruppi(opzioni = {}) {
  document.querySelectorAll(".gruppi-overlay").forEach((el) => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "rubrica-overlay gruppi-overlay";
  overlay.innerHTML = markup();
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const listaEl = overlay.querySelector(".rubrica-lista");
  const schedaEl = overlay.querySelector(".rubrica-scheda");
  const notaEl = overlay.querySelector(".rubrica-nota");
  let elenco = [];
  let selezione = null;

  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("rubrica-nota--errore", !!errore);
  };
  const chiudi = () => overlay.remove();

  const disegnaLista = () => {
    if (!elenco.length) {
      listaEl.innerHTML = `<div class="rubrica-vuoto">Nessun gruppo: usa «Nuovo gruppo».</div>`;
      return;
    }
    listaEl.innerHTML = elenco.map(riga).join("");
    listaEl.querySelectorAll(".rubrica-riga").forEach((el) => {
      el.classList.toggle("rubrica-riga--sel", !!selezione && Number(el.dataset.id) === selezione.id);
      el.addEventListener("click", () => {
        selezione = elenco.find((g) => g.id === Number(el.dataset.id)) || null;
        disegnaLista();
      });
    });
  };

  const ricarica = async () => {
    try {
      elenco = typeof opzioni.onElenco === "function" ? (await opzioni.onElenco()) || [] : GRUPPI_ESEMPIO.slice();
    } catch (e) {
      nota(`Non riesco a leggere i gruppi: ${e && e.message ? e.message : e}`, true);
      elenco = [];
    }
    if (selezione && !elenco.some((g) => g.id === selezione.id)) selezione = null;
    disegnaLista();
  };

  const apriForm = (g) => {
    schedaEl.innerHTML = modulo(g);
    schedaEl.querySelector('[data-gruppo="nome"]').focus();
    schedaEl.querySelector('[data-form="annulla"]').addEventListener("click", () => {
      schedaEl.innerHTML = "";
    });
    schedaEl.querySelector('[data-form="salva"]').addEventListener("click", async () => {
      const nome = schedaEl.querySelector('[data-gruppo="nome"]').value.trim();
      const { validi, errati } = membriDaTesto(schedaEl.querySelector('[data-gruppo="membri"]').value);
      if (!nome) return nota("Il gruppo deve avere un nome.", true);
      if (errati.length) return nota(`Indirizzi non validi: ${errati.join(", ")}.`, true);
      const gruppo = { id: g && g.id ? g.id : null, nome, membri: validi };
      try {
        if (typeof opzioni.onSalva === "function") await opzioni.onSalva(gruppo);
        else {
          const i = elenco.findIndex((x) => x.id === gruppo.id);
          const salvato = { ...gruppo, id: gruppo.id || Date.now() };
          if (i >= 0) elenco[i] = salvato;
          else elenco.push(salvato);
        }
        schedaEl.innerHTML = "";
        if (typeof opzioni.onElenco === "function") await ricarica();
        else disegnaLista();
        nota(gruppo.id ? "Gruppo aggiornato." : "Gruppo creato.");
      } catch (e) {
        nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
      }
    });
  };

  const scelto = (azione) => {
    if (!selezione) nota(`Seleziona prima un gruppo da ${azione}.`, true);
    return selezione;
  };

  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !schedaEl.innerHTML) chiudi();
  });
  overlay.querySelector(".rubrica-toolbar").addEventListener("click", (e) => {
    const az = e.target.closest("[data-az]");
    if (!az) return;
    if (az.dataset.az === "nuovo") return apriForm(null);
    if (az.dataset.az === "modifica") {
      const g = scelto("modificare");
      if (g) apriForm(g);
      return;
    }
    if (az.dataset.az === "elimina") {
      const g = scelto("eliminare");
      if (!g) return;
      // Conferma esplicita, come per i contatti: mai un'eliminazione muta.
      const conferma = document.createElement("div");
      conferma.className = "rubrica-conferma";
      conferma.innerHTML =
        `<div class="rubrica-conferma-box"><p>Eliminare il gruppo «${fuga(g.nome)}»? I contatti dei membri restano in rubrica.</p>` +
        `<div class="rubrica-modulo-azioni">` +
        `<button type="button" class="rubrica-btn" data-conf="no">Annulla</button>` +
        `<button type="button" class="rubrica-btn rubrica-btn--ok" data-conf="si">Elimina</button></div></div>`;
      overlay.append(conferma);
      conferma.querySelector('[data-conf="no"]').addEventListener("click", () => conferma.remove());
      conferma.querySelector('[data-conf="si"]').addEventListener("click", async () => {
        conferma.remove();
        try {
          if (typeof opzioni.onElimina === "function") await opzioni.onElimina(g.id);
          elenco = elenco.filter((x) => x.id !== g.id);
          selezione = null;
          schedaEl.innerHTML = "";
          disegnaLista();
          nota("Gruppo eliminato.");
        } catch (err) {
          nota(`Non eliminato: ${err && err.message ? err.message : err}`, true);
        }
      });
    }
  });

  ricarica();
  return overlay;
}
