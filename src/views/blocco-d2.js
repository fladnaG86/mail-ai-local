/**
 * Pannelli del blocco D, seconda metà: **Firme**, **Posta indesiderata**,
 * **Privacy**.
 *
 * Stesso telaio dei pannelli del blocco D (prima metà): overlay `.mail-settings-overlay`
 * con barra del titolo e corpo `.ai-settings-body`. Ogni voce ha un consumatore
 * vero: le firme finiscono in `config.json` e nella composizione, il livello di
 * protezione agisce durante la sincronizzazione (kernel), lo sblocco di un
 * mittente toglie l'indirizzo dalla tabella, il registro si svuota e si esporta
 * davvero (comandi del kernel).
 *
 * Nel percorso browser (senza Tauri) i pannelli funzionano con valori di esempio
 * e salvataggi in memoria: serve alle prove visive.
 */

import { rendiSpostabile } from "./finestre.js";
import { normalizzaFirme, firmeEffettive, nomeFirma } from "./firme.js";
import {
  PROTEZIONI,
  normProtezione,
  etichettaProtezione,
  riepilogoPosta,
} from "./posta-indesiderata.js";
import { riepilogoRegistro, formatoData } from "./ai-settings.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Titoli dei pannelli della seconda metà del blocco D (per le prove e il hub). */
export const TITOLI_PANNELLI_D2 = {
  firme: "Firme",
  posta: "Posta indesiderata",
  privacy: "Privacy",
};

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Telaio comune: crea l'overlay e restituisce `{ overlay, nota, chiudi, q }`. */
function telaio(chiave, opzioni = {}) {
  const titolo = TITOLI_PANNELLI_D2[chiave] || chiave;
  document.querySelectorAll(".mail-settings-overlay").forEach((el) => el.remove());
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
      <div class="ai-settings-body" id="bd-body"></div>
      <div class="settings-nota" role="status" aria-live="polite"></div>
    </div>`;
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
  void opzioni;
  return { overlay, nota, chiudi, q: (sel) => overlay.querySelector(sel) };
}

/** Salva le preferenze aggiornate; l'esito finisce nella nota. */
async function salva(nota, opzioni, preferenze) {
  const onSalva = typeof opzioni.onSalva === "function" ? opzioni.onSalva : null;
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";
  if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze);
  if (!onSalva) {
    nota("Salvato (prova visiva: nessun file scritto).");
    return;
  }
  try {
    const esito = await onSalva({ theme: getTema(), preferenze });
    nota(esito || "Salvato.");
  } catch (e) {
    nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
  }
}

// ---------------------------------------------------------------------------
// Firme
// ---------------------------------------------------------------------------

/**
 * Apre il pannello Firme.
 * `opzioni`: `{ preferenze, accountId, onSalva, onApplica, getTema }`.
 */
export function apriPannelloFirme(opzioni = {}) {
  const { overlay, nota, q } = telaio("firme", opzioni);
  const base = Object.assign({}, opzioni.preferenze || {});
  const stato = {
    firme: firmeEffettive(base),
    firmaPredefinitaPerAccount: Object.assign({}, base.firmaPredefinitaPerAccount || {}),
  };
  const accountId = opzioni.accountId || "";

  const preferenze = () => Object.assign({}, base, {
    firme: stato.firme,
    firmaPredefinitaPerAccount: stato.firmaPredefinitaPerAccount,
  });

  const disegna = () => {
    const elenco = q("#bd-fi-elenco");
    if (!stato.firme.length) {
      elenco.innerHTML = `<div class="im-nota">Nessuna firma: le nuove composizioni partono senza firma.</div>`;
    } else {
      elenco.innerHTML = stato.firme
        .map(
          (f, i) =>
            `<div class="im-riga-sost" data-firma="${i}">` +
            `<span class="im-da">${fuga(nomeFirma(f))}</span><span class="im-freccia">·</span>` +
            `<span class="im-a">${fuga(f.contenuto.replace(/\s+/g, " ").slice(0, 60))}</span>` +
            `<button type="button" class="im-x" data-rimuovi="${i}" aria-label="Togli la firma ${fuga(nomeFirma(f))}">✕</button></div>`,
        )
        .join("");
      elenco.querySelectorAll("[data-rimuovi]").forEach((b) =>
        b.addEventListener("click", async () => {
          const i = Number(b.dataset.rimuovi);
          const rimossa = stato.firme[i];
          stato.firme = stato.firme.filter((_, j) => j !== i);
          // Toglie anche l'eventuale predefinita che la riferiva.
          Object.keys(stato.firmaPredefinitaPerAccount).forEach((acc) => {
            if (stato.firmaPredefinitaPerAccount[acc] === rimossa.id) {
              delete stato.firmaPredefinitaPerAccount[acc];
            }
          });
          disegna();
          await salva(nota, opzioni, preferenze());
        }),
      );
    }

    const predef = q("#bd-fi-predefinite");
    const righe = accountId
      ? [`<div class="settings-lbl">Account «${fuga(accountId)}»</div>`,
         `<select class="settings-fld" id="bd-fi-predef-sel">` +
         [`<option value="">Nessuna</option>`]
           .concat(
             stato.firme.map((f) => {
               const sel = stato.firmaPredefinitaPerAccount[accountId] === f.id ? " selected" : "";
               return `<option value="${fuga(f.id)}"${sel}>${fuga(nomeFirma(f))}</option>`;
             }),
           )
           .join("") +
         `</select>`].join("")
      : `<div class="im-nota">Nessun account configurato: la firma predefinita si sceglie per account.</div>`;
    predef.innerHTML = righe;
    const sel = q("#bd-fi-predef-sel");
    if (sel) {
      sel.addEventListener("change", async () => {
        if (sel.value) stato.firmaPredefinitaPerAccount[accountId] = sel.value;
        else delete stato.firmaPredefinitaPerAccount[accountId];
        await salva(nota, opzioni, preferenze());
      });
    }
  };

  q("#bd-body").innerHTML = `
    <div class="settings-sec">Le tue firme</div>
    <div class="settings-hr"></div>
    <div class="im-tab-sost" id="bd-fi-elenco"></div>
    <div class="settings-grid im-aggiungi">
      <input class="settings-fld" type="text" id="bd-fi-nome" placeholder="Nome (es. Lavoro)" autocomplete="off" />
      <input class="settings-fld" type="text" id="bd-fi-contenuto" placeholder="Contenuto della firma" autocomplete="off" />
    </div>
    <label class="ai-check"><input type="checkbox" id="bd-fi-html" /> Il contenuto è HTML</label>
    <div class="ai-avvia-riga">
      <button type="button" class="ai-btn2" id="bd-fi-aggiungi">Aggiungi firma</button>
      <span class="im-nota" id="bd-fi-esito"></span>
    </div>

    <div class="settings-sec">Firma predefinita per account</div>
    <div class="settings-hr"></div>
    <div class="settings-grid" id="bd-fi-predefinite"></div>
    <p class="im-nota">La firma predefinita dell'account viene inserita nelle nuove composizioni. Nella finestra di composizione puoi sceglierne un'altra dal riquadro «Firma»: quella precedente viene sostituita, non duplicata.</p>`;

  disegna();

  q("#bd-fi-aggiungi").addEventListener("click", async () => {
    const nomeEl = q("#bd-fi-nome");
    const contEl = q("#bd-fi-contenuto");
    const htmlEl = q("#bd-fi-html");
    const nome = nomeEl.value.trim();
    const contenuto = contEl.value;
    if (!nome && !contenuto.trim()) {
      nota("Serve almeno un contenuto o un nome per la firma.", true);
      return;
    }
    const id = `firma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    stato.firme = normalizzaFirme(
      stato.firme.concat([{ id, nome: nome || "Firma", contenuto, html: htmlEl.checked }]),
    );
    nomeEl.value = "";
    contEl.value = "";
    htmlEl.checked = false;
    disegna();
    await salva(nota, opzioni, preferenze());
  });

  overlay.__impostaFirme = (patch) => {
    Object.assign(stato, patch);
    disegna();
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze());
  };
  return overlay;
}

// ---------------------------------------------------------------------------
// Posta indesiderata
// ---------------------------------------------------------------------------

/**
 * Apre il pannello Posta indesiderata.
 * `opzioni`: `{ preferenze, stato, onSalva, onApplica, onSblocca, onStato, getTema }`.
 * `stato` è `{ mittenti, protezione, ultimaAzione }`; `onStato()` lo rilegge dopo
 * uno sblocco; `onSblocca(indirizzo)` chiama il comando del kernel.
 */
export function apriPannelloPosta(opzioni = {}) {
  const { overlay, nota, q } = telaio("posta", opzioni);
  const base = Object.assign({}, opzioni.preferenze || {});
  const stato = Object.assign(
    {
      mittenti: [],
      protezione: normProtezione(base.protezionePostaIndesiderata),
      ultimaAzione: 0,
    },
    opzioni.stato || {},
  );

  const preferenze = () =>
    Object.assign({}, base, { protezionePostaIndesiderata: normProtezione(stato.protezione) });

  const disegna = () => {
    q("#bd-pi-riepilogo").textContent = riepilogoPosta(stato);
    const elenco = q("#bd-pi-elenco");
    if (!stato.mittenti.length) {
      elenco.innerHTML = `<div class="im-nota">Nessun mittente bloccato. Segnalando un messaggio come indesiderato, il suo mittente finisce qui.</div>`;
      return;
    }
    elenco.innerHTML = stato.mittenti
      .map(
        (m) =>
          `<div class="im-riga-sost"><span class="im-da">${fuga(m)}</span>` +
          `<button type="button" class="im-x" data-sblocca="${fuga(m)}" aria-label="Sblocca ${fuga(m)}">Sblocca</button></div>`,
      )
      .join("");
    elenco.querySelectorAll("[data-sblocca]").forEach((b) =>
      b.addEventListener("click", async () => {
        const indirizzo = b.dataset.sblocca;
        b.disabled = true;
        try {
          if (typeof opzioni.onSblocca === "function") await opzioni.onSblocca(indirizzo);
          if (typeof opzioni.onStato === "function") {
            const nuovo = await opzioni.onStato();
            if (nuovo && Array.isArray(nuovo.mittenti)) {
              stato.mittenti = nuovo.mittenti;
              stato.ultimaAzione = nuovo.ultimaAzione;
            }
          }
          if (stato.mittenti.includes(indirizzo)) {
            stato.mittenti = stato.mittenti.filter((x) => x !== indirizzo);
          }
          nota(`Sbloccato: ${indirizzo}.`);
        } catch (e) {
          nota(`Sblocco non riuscito: ${e && e.message ? e.message : e}`, true);
        }
        disegna();
      }),
    );
  };

  q("#bd-body").innerHTML = `
    <div class="settings-sec">Protezione</div>
    <div class="settings-hr"></div>
    <div class="settings-grid">
      <div class="settings-lbl">Livello:</div>
      <select class="settings-fld" id="bd-pi-protezione">
        ${PROTEZIONI.map((v) => `<option value="${v}"${v === normProtezione(stato.protezione) ? " selected" : ""}>${fuga(etichettaProtezione(v))}</option>`).join("")}
      </select>
    </div>
    <p class="im-nota" id="bd-pi-riepilogo"></p>
    <p class="im-nota">La protezione agisce durante la sincronizzazione (comando «Invia e ricevi»): con «Attiva» i messaggi dei mittenti bloccati vengono spostati in Posta indesiderata; con «Spenta» vengono solo marcati e restano dove sono.</p>

    <div class="settings-sec">Mittenti bloccati</div>
    <div class="settings-hr"></div>
    <div class="im-tab-sost" id="bd-pi-elenco"></div>`;

  q("#bd-pi-protezione").addEventListener("change", async (e) => {
    stato.protezione = normProtezione(e.target.value);
    disegna();
    await salva(nota, opzioni, preferenze());
  });

  disegna();
  return overlay;
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

/** Una riga del registro, come tabella (data, provider, modello, azione, impronta). */
function tabellaRegistro(righe) {
  if (!Array.isArray(righe) || !righe.length) {
    return `<div class="im-nota">Nessuna voce nel registro: nessuna richiesta è ancora uscita verso il cloud.</div>`;
  }
  const riga = (r) =>
    "<tr>" +
    `<td>${fuga(formatoData(r.data))}</td>` +
    `<td>${fuga(r.provider || "")}</td>` +
    `<td>${fuga(r.modello || "")}</td>` +
    `<td>${fuga(r.azione || "")}</td>` +
    `<td>${fuga(r.promptVersion || "")}</td>` +
    `<td>${fuga(r.hash || "")}</td>` +
    "</tr>";
  return (
    `<table class="im-registro"><thead><tr>` +
    ["Data e ora", "Provider", "Modello", "Azione", "Versione prompt", "Impronta"]
      .map((c) => `<th>${fuga(c)}</th>`)
      .join("") +
    `</tr></thead><tbody>${righe.map(riga).join("")}</tbody></table>`
  );
}

/**
 * Apre il pannello Privacy.
 * `opzioni`: `{ preferenze, onSalva, onApplica, onRegistro, onSvuotaRegistro,
 * onEsportaRegistro, getTema }`. `onRegistro()` legge le righe; `onSvuotaRegistro()`
 * svuota il registro; `onEsportaRegistro()` resta un percorso di file scritto.
 */
export async function apriPannelloPrivacy(opzioni = {}) {
  const { overlay, nota, q } = telaio("privacy", opzioni);
  const base = Object.assign({}, opzioni.preferenze || {});
  const stato = {
    consensoRichiesto: base.consensoRichiesto !== false,
    registroAttivo: base.registroAttivo !== false,
    righe: [],
  };

  const preferenze = () =>
    Object.assign({}, base, {
      consensoRichiesto: stato.consensoRichiesto,
      registroAttivo: stato.registroAttivo,
    });

  const ridisegna = () => {
    q("#bd-pr-riepilogo").textContent = riepilogoRegistro(stato.righe, {
      registroAttivo: stato.registroAttivo,
      consensoRichiesto: stato.consensoRichiesto,
    });
    q("#bd-pr-tabella").innerHTML = tabellaRegistro(stato.righe);
  };

  q("#bd-body").innerHTML = `
    <div class="settings-sec">Registro delle azioni IA</div>
    <div class="settings-hr"></div>
    <p class="im-nota" id="bd-pr-riepilogo"></p>
    <div id="bd-pr-tabella"></div>
    <div class="ai-avvia-riga">
      <button type="button" class="ai-btn2" id="bd-pr-esporta">Esporta in un file di testo</button>
      <button type="button" class="ai-btn2" id="bd-pr-svuota">Svuota il registro</button>
      <span class="im-nota" id="bd-pr-esito"></span>
    </div>

    <div class="settings-sec">Consenso e telemetria</div>
    <div class="settings-hr"></div>
    <label class="ai-check"><input type="checkbox" id="bd-pr-consenso"${stato.consensoRichiesto ? " checked" : ""}> Chiedi conferma esplicita prima di ogni invio al cloud</label>
    <label class="ai-check"><input type="checkbox" id="bd-pr-registro"${stato.registroAttivo ? " checked" : ""}> Registra le richieste inviate al cloud (solo impronte e metadati)</label>
    <p class="im-nota">Il testo dei messaggi e degli allegati <b>non</b> viene mai registrato: nel registro entrano solo l'impronta SHA-256 e i metadati (data, provider, modello, azione). Nessuna telemetria: le voci restano su questo Mac e non vengono inviate da nessuna parte.</p>`;

  const esito = (testo, errore) => {
    const el = q("#bd-pr-esito");
    el.textContent = testo || "";
    el.classList.toggle("settings-nota--errore", !!errore);
  };

  // Legge il registro (kernel o valori di esempio).
  if (typeof opzioni.onRegistro === "function") {
    try {
      const righe = await opzioni.onRegistro(200);
      stato.righe = Array.isArray(righe) ? righe : [];
    } catch (e) {
      nota(`Registro non leggibile: ${e && e.message ? e.message : e}`, true);
    }
  }
  ridisegna();

  q("#bd-pr-svuota").addEventListener("click", async () => {
    if (typeof opzioni.onSvuotaRegistro !== "function") {
      esito("Svuotamento non collegato in questa prova.", true);
      return;
    }
    try {
      const n = await opzioni.onSvuotaRegistro();
      stato.righe = [];
      ridisegna();
      esito(`Registro svuotato: ${typeof n === "number" ? n : 0} voci rimosse.`);
    } catch (e) {
      esito(`Svuotamento non riuscito: ${e && e.message ? e.message : e}`, true);
    }
  });

  q("#bd-pr-esporta").addEventListener("click", async () => {
    if (typeof opzioni.onEsportaRegistro !== "function") {
      esito("Esportazione non collegata in questa prova.", true);
      return;
    }
    try {
      const percorso = await opzioni.onEsportaRegistro();
      esito(`Registro esportato in: ${percorso}`);
    } catch (e) {
      esito(`Esportazione non riuscita: ${e && e.message ? e.message : e}`, true);
    }
  });

  q("#bd-pr-consenso").addEventListener("change", async (e) => {
    stato.consensoRichiesto = e.target.checked;
    ridisegna();
    await salva(nota, opzioni, preferenze());
  });
  q("#bd-pr-registro").addEventListener("change", async (e) => {
    stato.registroAttivo = e.target.checked;
    ridisegna();
    await salva(nota, opzioni, preferenze());
  });

  overlay.__impostaPrivacy = (patch) => {
    Object.assign(stato, patch);
    ridisegna();
  };
  return overlay;
}
