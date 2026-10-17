/**
 * Blocco V3 — la finestra dei file aperti dal Finder (.eml, .ics, .vcf).
 *
 * Il kernel (`aperture.rs`) legge e interpreta il file e manda il contenuto; qui
 * solo la presentazione, sulle stesse regole del pannello di lettura:
 * - **messaggio**: intestazioni e corpo in un `<iframe sandbox>` senza permessi
 *   (il corpo arriva già sanificato, immagini remote bloccate); «Rispondi» apre
 *   la composizione verso il mittente.
 * - **calendario**: gli eventi in sola lettura. Accettare o rifiutare richiede il
 *   messaggio d'invito nella casella: lo si **dichiara**, nessun pulsante muto.
 * - **contatti**: l'elenco delle schede; si importano solo al clic su «Importa».
 * - **illeggibile**: il nome del file e il motivo.
 */
import { rendiSpostabile } from "./finestre.js";
import { fugaHtml as fuga } from "./mail-actions.js";
import { documentoCorpo } from "./main-view.js";
import { formattaDataOra, riepilogoQuando, nomeOrganizzatore } from "./inviti.js";
import { testoImportazione } from "./contatti.js";

const TITOLI = {
  messaggio: "Messaggio",
  calendario: "Evento di calendario",
  contatti: "Schede contatto",
  illeggibile: "File non leggibile",
};

/** «R: oggetto», senza raddoppiare il prefisso (stessa regola di «Rispondi»). */
function oggettoRisposta(oggetto) {
  const o = String(oggetto || "").trim();
  if (!o) return "R:";
  return /^r:/i.test(o) ? o : `R: ${o}`;
}

function riga(etichetta, valore) {
  const v = String(valore || "").trim();
  return v ? `<div class="file-riga"><span class="file-etichetta">${fuga(etichetta)}</span> ${fuga(v)}</div>` : "";
}

function pulsante(azione, testo, principale = false) {
  return `<button type="button" class="i1-btn${principale ? " i1-btn--ok" : ""}" data-file-azione="${azione}">${fuga(testo)}</button>`;
}

function contenutoMessaggio(ap) {
  const allegati = (ap.corpo && Array.isArray(ap.corpo.attachments) ? ap.corpo.attachments : [])
    .map((a) => `<li>📎 ${fuga(a.name)}</li>`)
    .join("");
  return `
    <div class="file-oggetto">${fuga(ap.oggetto || "(nessun oggetto)")}</div>
    ${riga("Da:", ap.da)}${riga("A:", ap.a)}${riga("Cc:", ap.cc)}${riga("Data:", formattaDataOra(ap.data))}
    <iframe class="file-corpo" sandbox="" title="Corpo del messaggio"></iframe>
    ${allegati ? `<ul class="file-allegati">${allegati}</ul><p class="file-nota">Gli allegati di un file aperto dal Finder si vedono ma non si salvano da qui.</p>` : ""}`;
}

function contenutoCalendario(ap) {
  const eventi = (Array.isArray(ap.inviti) ? ap.inviti : [])
    .map(
      (i) => `<li class="file-evento">
        <div class="file-oggetto">${fuga(i.oggetto || "(senza titolo)")}</div>
        ${riga("Quando:", riepilogoQuando(i))}${riga("Dove:", i.luogo)}${riga("Organizzatore:", nomeOrganizzatore(i))}
      </li>`,
    )
    .join("");
  return `
    ${eventi ? `<ul class="file-eventi">${eventi}</ul>` : `<p class="file-nota">Il file non contiene eventi leggibili.</p>`}
    <p class="file-nota">Aperto da file: per accettare o rifiutare serve il messaggio d'invito nella casella.</p>`;
}

function contenutoContatti(ap) {
  const schede = (Array.isArray(ap.schede) ? ap.schede : [])
    .map((s) => `<li>${fuga(s.nome || s.email)}${s.nome ? ` <span class="file-email">${fuga(s.email)}</span>` : ""}</li>`)
    .join("");
  const n = Number(ap.senzaEmail) || 0;
  const scartate = n ? `<p class="file-nota">${n} ${n === 1 ? "scheda senza indirizzo" : "schede senza indirizzo"}: non diventa un contatto.</p>` : "";
  return `
    ${schede ? `<ul class="file-contatti">${schede}</ul>` : `<p class="file-nota">Nessuna scheda con un indirizzo e-mail.</p>`}
    ${scartate}
    <p class="file-esito" role="status"></p>`;
}

/**
 * Apre la finestra per un'apertura del kernel e la restituisce (`null` per un
 * tipo che non si mostra). `azioni.onRispondi(campi)` apre la composizione;
 * `azioni.onImporta(testo)` importa le schede e risolve con l'esito.
 */
export function apriFinestraFile(apertura, azioni = {}) {
  const ap = apertura || {};
  const tipo = ap.tipo;
  if (!TITOLI[tipo]) return null;

  let contenuto = "";
  let pulsanti = pulsante("chiudi", "Chiudi");
  if (tipo === "messaggio") {
    contenuto = contenutoMessaggio(ap);
    pulsanti = pulsante("chiudi", "Chiudi") + pulsante("rispondi", "Rispondi", true);
  } else if (tipo === "calendario") {
    contenuto = contenutoCalendario(ap);
  } else if (tipo === "contatti") {
    contenuto = contenutoContatti(ap);
    if (Array.isArray(ap.schede) && ap.schede.length) {
      pulsanti = pulsante("chiudi", "Chiudi") + pulsante("importa", "Importa nella rubrica", true);
    }
  } else {
    contenuto = `<p class="file-nota">${fuga(ap.motivo || "Il file non si può leggere.")}</p>`;
  }

  const overlay = document.createElement("div");
  overlay.className = "file-overlay";
  overlay.innerHTML = `
    <div class="file-win" role="dialog" aria-label="${fuga(TITOLI[tipo])}">
      <header class="file-titlebar">
        <span class="file-title">${fuga(TITOLI[tipo])} — ${fuga(ap.nomeFile || "")}</span>
      </header>
      <div class="file-contenuto">${contenuto}</div>
      <div class="i1-modale-azioni file-azioni">${pulsanti}</div>
    </div>`;
  document.body.append(overlay);
  rendiSpostabile(overlay);

  // Il corpo si assegna come attributo: niente HTML del messaggio nel markup della finestra.
  const frame = overlay.querySelector(".file-corpo");
  if (frame) {
    const corpo = ap.corpo || {};
    const html = String(corpo.html || "").trim()
      ? corpo.html
      : `<div style="white-space:pre-wrap">${fuga(corpo.text || "")}</div>`;
    frame.setAttribute("srcdoc", documentoCorpo(html));
  }

  const chiudi = () => {
    overlay.remove();
    document.removeEventListener("keydown", tasto, true);
  };
  const tasto = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      chiudi();
    }
  };
  document.addEventListener("keydown", tasto, true);

  overlay.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-file-azione]");
    if (!b) return;
    const azione = b.dataset.fileAzione;
    if (azione === "chiudi") return chiudi();
    if (azione === "rispondi") {
      chiudi();
      if (azioni.onRispondi) azioni.onRispondi({ a: ap.da || "", oggetto: oggettoRisposta(ap.oggetto) });
      return;
    }
    if (azione === "importa" && azioni.onImporta) {
      const esitoEl = overlay.querySelector(".file-esito");
      b.disabled = true;
      try {
        const esito = await azioni.onImporta(ap.testo || "");
        esitoEl.textContent = testoImportazione(esito);
        b.remove();
      } catch (err) {
        esitoEl.textContent = `Importazione non riuscita: ${String(err)}`;
        b.disabled = false;
      }
    }
  });
  return overlay;
}
