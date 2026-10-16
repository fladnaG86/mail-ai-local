/**
 * Regole locali sui messaggi in arrivo (blocco H) — logica pura **e** pannello.
 *
 * Le regole hanno nome, attiva/disattiva, ordine, condizioni combinate in **AND**
 * (mittente contiene, oggetto contiene, corpo contiene, destinatario contiene,
 * con allegato sì/no) e azioni applicate **nell'ordine dichiarato** (sposta in
 * cartella, contrassegna, categorizza, segna come letto, elimina).
 *
 * Le funzioni pure (normalizzazione, ordinamento, riepilogo) si collaudano con
 * `node --test`; il pannello (`apriPannelloRegole`) è lo stesso telaio degli
 * altri riquadri e parla col kernel tramite i comandi `regole_elenco`,
 * `regola_salva`, `regola_elimina`, `regole_riordina`.
 *
 * Il motore vero gira nel kernel durante `mail_sync`
 * (`src-tauri/src/mail/regole.rs`): qui c'è la gestione e la resa.
 */

import { rendiSpostabile } from "./finestre.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Tipi di azione ammessi, nell'ordine in cui il pannello li offre (specchia `config.rs`). */
export const TIPI_AZIONE = ["sposta", "contrassegna", "categorizza", "segna_letto", "elimina"];
/** Etichette leggibili delle azioni. */
export const ETICHETTE_AZIONE = {
  sposta: "Sposta in cartella",
  contrassegna: "Contrassegna",
  categorizza: "Categorizza",
  segna_letto: "Segna come letto",
  elimina: "Elimina",
};
/** Valori ammessi per «con allegato». */
export const ALLEGATO_CONDIZIONI = ["indifferente", "con", "senza"];
/** Etichette della condizione «con allegato». */
export const ETICHETTE_ALLEGATO = {
  indifferente: "Indifferente",
  con: "Con allegato",
  senza: "Senza allegato",
};

/** Condizioni vuote (tutte indifferenti). */
export function condizioniVuote() {
  return {
    mittenteContiene: "",
    oggettoContiene: "",
    corpoContiene: "",
    destinatarioContiene: "",
    allegato: "indifferente",
  };
}

/** Normalizza un valore «con allegato» (default: indifferente). */
export function normAllegato(v, def = "indifferente") {
  return ALLEGATO_CONDIZIONI.includes(v) ? v : def;
}

/** Tipo di azione valido, oppure null. */
export function normTipoAzione(tipo) {
  return TIPI_AZIONE.includes(tipo) ? tipo : null;
}

/** Normalizza un'azione: tipo ammesso; una «sposta» senza destinazione è scartata. */
export function normAzione(a) {
  if (!a) return null;
  const tipo = normTipoAzione(a.tipo);
  if (!tipo) return null;
  const valore = String(a.valore == null ? "" : a.valore).trim();
  if (tipo === "sposta" && !valore) return null;
  return { tipo, valore };
}

/** Normalizza le azioni di una regola: solo i tipi ammessi, nell'ordine dato. */
export function normAzioni(azioni) {
  return (Array.isArray(azioni) ? azioni : []).map(normAzione).filter(Boolean);
}

/** Normalizza le condizioni: testo ripulito, «con allegato» ammesso. */
export function normCondizioni(c) {
  const base = condizioniVuote();
  const out = Object.assign(base, c || {});
  out.mittenteContiene = String(out.mittenteContiene || "").trim();
  out.oggettoContiene = String(out.oggettoContiene || "").trim();
  out.corpoContiene = String(out.corpoContiene || "").trim();
  out.destinatarioContiene = String(out.destinatarioContiene || "").trim();
  out.allegato = normAllegato(out.allegato);
  return out;
}

/**
 * Ordina le regole per `ordine` (crescente). A parità di `ordine` l'ordine di
 * inserimento è conservato (ordinamento stabile). Non muta l'elenco originale.
 */
export function ordinaRegole(regole) {
  return (Array.isArray(regole) ? regole.slice() : [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const oa = Number(a.r.ordine) || 0;
      const ob = Number(b.r.ordine) || 0;
      if (oa !== ob) return oa - ob;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

/** Normalizza una regola: nome/id generati se mancanti, condizioni e azioni sane. */
export function normRegola(r, indice = 0) {
  const fonte = r || {};
  const nome = String(fonte.nome || "").trim() || `Regola ${indice + 1}`;
  return {
    id: String(fonte.id || "").trim(),
    nome,
    attiva: fonte.attiva !== false,
    ordine: Number(fonte.ordine) || 0,
    condizioni: normCondizioni(fonte.condizioni),
    azioni: normAzioni(fonte.azioni),
    esecuzioni: Math.max(0, Number(fonte.esecuzioni) || 0),
    ultimaEsecuzione: Math.max(0, Number(fonte.ultimaEsecuzione) || 0),
  };
}

/** Riepilogo dell'elenco: quante regole in tutto e quante attive. */
export function riepilogoRegole(regole) {
  const lista = Array.isArray(regole) ? regole : [];
  const attive = lista.filter((r) => r && r.attiva !== false).length;
  return { totali: lista.length, attive };
}

/** Testo leggibile dell'ultima esecuzione di una regola (0 = mai). */
export function testoUltimaEsecuzione(unix) {
  const s = Number(unix);
  if (!Number.isFinite(s) || s <= 0) return "mai";
  const d = new Date(s * 1000);
  const due = (n) => String(n).padStart(2, "0");
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** Testo di trasparenza: quante volte la regola ha agito e quando l'ultima volta. */
export function testoStatistiche(r) {
  const n = Math.max(0, Number(r && r.esecuzioni) || 0);
  const azioni = n === 1 ? "1 azione" : `${n} azioni`;
  return `${azioni} · ultima: ${testoUltimaEsecuzione(r && r.ultimaEsecuzione)}`;
}

/** Descrizione breve delle condizioni di una regola (per l'elenco). */
export function descrizioneCondizioni(r) {
  const c = normCondizioni(r && r.condizioni);
  const pezzi = [];
  if (c.mittenteContiene) pezzi.push(`da «${c.mittenteContiene}»`);
  if (c.oggettoContiene) pezzi.push(`oggetto «${c.oggettoContiene}»`);
  if (c.corpoContiene) pezzi.push(`corpo «${c.corpoContiene}»`);
  if (c.destinatarioContiene) pezzi.push(`a «${c.destinatarioContiene}»`);
  if (c.allegato !== "indifferente") pezzi.push(ETICHETTE_ALLEGATO[c.allegato]);
  return pezzi.length ? pezzi.join(" · ") : "nessuna condizione (tutti i messaggi)";
}

/** Descrizione breve delle azioni di una regola, nell'ordine dichiarato. */
export function descrizioneAzioni(r) {
  const azioni = normAzioni(r && r.azioni);
  if (!azioni.length) return "nessuna azione";
  return azioni
    .map((a) => (a.valore ? `${ETICHETTE_AZIONE[a.tipo]} «${a.valore}»` : ETICHETTE_AZIONE[a.tipo]))
    .join(" → ");
}

/** Due regole di esempio (prova visiva del pannello nel percorso browser). */
export function regoleDiEsempio() {
  return [
    {
      id: "regola1",
      nome: "Fornitori → cartella",
      attiva: true,
      ordine: 0,
      condizioni: {
        mittenteContiene: "beta",
        oggettoContiene: "",
        corpoContiene: "",
        destinatarioContiene: "",
        allegato: "indifferente",
      },
      azioni: [
        { tipo: "sposta", valore: "Fornitori" },
        { tipo: "categorizza", valore: "Fornitori" },
      ],
      esecuzioni: 12,
      ultimaEsecuzione: 1760281200,
    },
    {
      id: "regola2",
      nome: "Avvisi Esempio Host",
      attiva: false,
      ordine: 1,
      condizioni: {
        mittenteContiene: "staff.esempiohost.it",
        oggettoContiene: "migrato",
        corpoContiene: "",
        destinatarioContiene: "",
        allegato: "indifferente",
      },
      azioni: [{ tipo: "contrassegna", valore: "" }],
      esecuzioni: 0,
      ultimaEsecuzione: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Disegno del pannello.
// ---------------------------------------------------------------------------

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Apre il pannello «Regole».
 *
 * `opzioni`: `{ regole, onSalva(regola), onElimina(id), onRiordina(ids),
 * getTema }`. `onSalva`/`onElimina`/`onRiordina` restituiscono l'elenco
 * aggiornato (il kernel lo restituisce sempre). Restituisce l'elemento overlay.
 */
export function apriPannelloRegole(opzioni = {}) {
  const titolo = "Regole";
  document.querySelectorAll(".mail-settings-overlay").forEach((el) => el.remove());

  let regole = ordinaRegole((opzioni.regole || []).map((r, i) => normRegola(r, i)));
  const overlay = document.createElement("div");
  overlay.className = "mail-settings-overlay";
  overlay.dataset.pannello = "regole";
  overlay.innerHTML = `
    <div class="ai-settings-win mail-settings-win" role="dialog" aria-label="${fuga(titolo)}">
      <header class="settings-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="settings-title">${fuga(titolo)}</span>
        <button type="button" class="settings-showall">Mostra tutte</button>
      </header>
      <div class="ai-settings-body" id="reg-body">
        <div class="settings-sec">Regole sui messaggi in arrivo</div>
        <div class="settings-hr"></div>
        <p class="im-nota" id="reg-riepilogo"></p>
        <div class="ai-avvia-riga">
          <button type="button" class="ai-btn2" id="reg-nuova">Nuova regola</button>
        </div>
        <div id="reg-elenco"></div>
        <div id="reg-form" hidden></div>
        <p class="im-nota">Le regole girano <b>sul Mac</b> durante «Invia e ricevi» (equivalenti locali delle regole di Outlook, non un servizio Microsoft). I messaggi già valutati non vengono rielaborati: nessun doppio spostamento. Se il server rifiuta un'azione, la regola lo segnala e le altre proseguono.</p>
      </div>
      <div class="settings-nota" role="status" aria-live="polite"></div>
    </div>`;
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const notaEl = overlay.querySelector(".settings-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("settings-nota--errore", !!errore);
  };
  const q = (sel) => overlay.querySelector(sel);
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

  /** Persiste un cambiamento: se il kernel risponde, si aggiorna l'elenco. */
  async function persisti(fn, okTesto) {
    try {
      const esito = await fn();
      if (Array.isArray(esito)) regole = ordinaRegole(esito.map((r, i) => normRegola(r, i)));
      disegna();
      if (okTesto) nota(okTesto);
    } catch (e) {
      nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  }

  function disegna() {
    const rip = riepilogoRegole(regole);
    q("#reg-riepilogo").textContent =
      rip.totali === 0
        ? "Nessuna regola: i messaggi arrivano così come sono."
        : `${rip.totali} regole, ${rip.attive} attive.`;
    const elenco = q("#reg-elenco");
    elenco.replaceChildren();
    regole.forEach((r, i) => {
      const riga = document.createElement("div");
      riga.className = "reg-riga" + (r.attiva ? "" : " reg-riga--spenta");
      riga.dataset.id = r.id;
      riga.innerHTML = `
        <label class="ai-check reg-attiva"><input type="checkbox"${r.attiva ? " checked" : ""}> attiva</label>
        <span class="reg-nome">${fuga(r.nome)}</span>
        <span class="reg-dettaglio">${fuga(descrizioneCondizioni(r))} → ${fuga(descrizioneAzioni(r))}</span>
        <span class="reg-stat">${fuga(testoStatistiche(r))}</span>
        <span class="reg-comandi">
          <button type="button" class="ai-btn2 reg-su" ${i === 0 ? "disabled" : ""} title="Sposta su">▲</button>
          <button type="button" class="ai-btn2 reg-giu" ${i === regole.length - 1 ? "disabled" : ""} title="Sposta giù">▼</button>
          <button type="button" class="ai-btn2 reg-modifica">Modifica</button>
          <button type="button" class="ai-btn2 reg-elimina">Elimina</button>
        </span>`;
      riga.querySelector(".reg-attiva input").addEventListener("change", (e) => {
        r.attiva = e.target.checked;
        persisti(() => opzioni.onSalva && opzioni.onSalva(r), r.attiva ? "Regola attivata." : "Regola disattivata.");
      });
      riga.querySelector(".reg-su").addEventListener("click", () => sposta(i, -1));
      riga.querySelector(".reg-giu").addEventListener("click", () => sposta(i, 1));
      riga.querySelector(".reg-modifica").addEventListener("click", () => apriForm(r));
      riga.querySelector(".reg-elimina").addEventListener("click", () =>
        persisti(() => opzioni.onElimina && opzioni.onElimina(r.id), `Regola «${r.nome}» eliminata.`),
      );
      elenco.append(riga);
    });
  }

  function sposta(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= regole.length) return;
    const copia = regole.slice();
    const [r] = copia.splice(i, 1);
    copia.splice(j, 0, r);
    const ids = copia.map((x) => x.id);
    copia.forEach((x, pos) => {
      x.ordine = pos;
    });
    regole = copia;
    persisti(() => opzioni.onRiordina && opzioni.onRiordina(ids), "Ordine delle regole aggiornato.");
  }

  /** Il modulo di creazione/modifica di una regola. */
  function apriForm(regola) {
    const r = regola ? normRegola(regola) : {
      id: "",
      nome: "",
      attiva: true,
      ordine: regole.length,
      condizioni: condizioniVuote(),
      azioni: [],
      esecuzioni: 0,
      ultimaEsecuzione: 0,
    };
    const c = r.condizioni;
    const attive = new Map();
    for (const a of r.azioni) {
      attive.set(a.tipo, a.valore);
    }
    const form = q("#reg-form");
    form.hidden = false;
    form.innerHTML = `
      <div class="settings-sec">${regola ? "Modifica regola" : "Nuova regola"}</div>
      <div class="settings-hr"></div>
      <div class="settings-grid">
        <div class="settings-lbl">Nome:</div>
        <input class="settings-fld" type="text" id="reg-f-nome" value="${fuga(r.nome)}" placeholder="Nome della regola">
      </div>
      <div class="settings-sec">Condizioni (in AND)</div>
      <div class="settings-grid">
        <div class="settings-lbl">Mittente contiene:</div>
        <input class="settings-fld" type="text" id="reg-f-mittente" value="${fuga(c.mittenteContiene)}">
        <div class="settings-lbl">Oggetto contiene:</div>
        <input class="settings-fld" type="text" id="reg-f-oggetto" value="${fuga(c.oggettoContiene)}">
        <div class="settings-lbl">Corpo contiene:</div>
        <input class="settings-fld" type="text" id="reg-f-corpo" value="${fuga(c.corpoContiene)}">
        <div class="settings-lbl">Destinatario contiene:</div>
        <input class="settings-fld" type="text" id="reg-f-dest" value="${fuga(c.destinatarioContiene)}">
        <div class="settings-lbl">Allegato:</div>
        <select class="settings-fld" id="reg-f-allegato">
          ${ALLEGATO_CONDIZIONI.map((v) => `<option value="${v}"${c.allegato === v ? " selected" : ""}>${fuga(ETICHETTE_ALLEGATO[v])}</option>`).join("")}
        </select>
      </div>
      <div class="settings-sec">Azioni (nell'ordine indicato)</div>
      <div id="reg-f-azioni">
        ${TIPI_AZIONE.map((tipo) => {
          const att = attive.has(tipo);
          const valore = att ? attive.get(tipo) : "";
          const campoValore =
            tipo === "sposta"
              ? `<input class="settings-fld reg-f-valore" type="text" data-tipo="sposta" placeholder="Cartella di destinazione" value="${fuga(valore)}">`
              : tipo === "categorizza"
                ? `<input class="settings-fld reg-f-valore" type="text" data-tipo="categorizza" placeholder="Categoria" value="${fuga(valore)}">`
                : "";
          return `<label class="ai-check reg-f-azione"><input type="checkbox" data-azione="${tipo}"${att ? " checked" : ""}> ${fuga(ETICHETTE_AZIONE[tipo])} ${campoValore}</label>`;
        }).join("")}
      </div>
      <div class="ai-avvia-riga">
        <button type="button" class="ai-btn2" id="reg-f-salva">Salva</button>
        <button type="button" class="ai-btn2" id="reg-f-annulla">Annulla</button>
      </div>`;

    form.querySelector("#reg-f-annulla").addEventListener("click", () => {
      form.hidden = true;
      form.replaceChildren();
    });
    form.querySelector("#reg-f-salva").addEventListener("click", () => {
      const condizioni = {
        mittenteContiene: form.querySelector("#reg-f-mittente").value,
        oggettoContiene: form.querySelector("#reg-f-oggetto").value,
        corpoContiene: form.querySelector("#reg-f-corpo").value,
        destinatarioContiene: form.querySelector("#reg-f-dest").value,
        allegato: form.querySelector("#reg-f-allegato").value,
      };
      const azioni = [];
      form.querySelectorAll("[data-azione]").forEach((cb) => {
        if (!cb.checked) return;
        const tipo = cb.dataset.azione;
        const campo = form.querySelector(`.reg-f-valore[data-tipo="${tipo}"]`);
        azioni.push({ tipo, valore: campo ? campo.value : "" });
      });
      const nuova = normRegola({
        id: r.id,
        nome: form.querySelector("#reg-f-nome").value,
        attiva: r.attiva,
        ordine: r.ordine,
        condizioni,
        azioni,
        esecuzioni: r.esecuzioni,
        ultimaEsecuzione: r.ultimaEsecuzione,
      });
      const azioniValide = normAzioni(nuova.azioni);
      if (azioniValide.length !== azioni.length) {
        nota("Una azione «sposta» senza destinazione è stata ignorata.", true);
      }
      nuova.azioni = azioniValide;
      persisti(() => opzioni.onSalva && opzioni.onSalva(nuova), `Regola «${nuova.nome}» salvata.`);
      form.hidden = true;
      form.replaceChildren();
    });
  }

  q("#reg-nuova").addEventListener("click", () => apriForm(null));
  disegna();

  // Aggancio per le prove visive: `?view=regole` apre il modulo di modifica.
  overlay.__apriRegolaDiEsempio = () => apriForm(regole[0] || null);
  return overlay;
}
