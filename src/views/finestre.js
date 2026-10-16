/**
 * Comportamento comune delle finestre interne: si spostano trascinando la barra
 * del titolo, senza uscire dallo schermo. Una sola implementazione per tutte —
 * «Nuovo messaggio», Impostazioni, Rubrica, Agenda, Account e i pannelli.
 */

/** Le barre del titolo delle finestre; il contenitore della finestra è il loro genitore. */
const BARRE = ".compose-titlebar, .settings-titlebar, .rubrica-titlebar, .agenda-titlebar";

/**
 * Tiene la finestra trascinata dentro lo schermo: `pos` è lo scarto dal centro.
 * Resta sempre visibile la barra del titolo (40 px) e almeno `margine` px in
 * orizzontale, così la finestra si può riafferrare.
 */
export function limitaPosizioneFinestra(pos, finestra, vista, margine = 80) {
  const sinistra = (vista.w - finestra.w) / 2;
  const alto = (vista.h - finestra.h) / 2;
  const limita = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    x: limita(pos.x, margine - finestra.w - sinistra, vista.w - margine - sinistra),
    y: limita(pos.y, -alto, vista.h - 40 - alto),
  };
}

/** Rende spostabile la finestra dentro `overlay`: si afferra dalla barra, non dai suoi pulsanti. */
export function rendiSpostabile(overlay) {
  const barra = overlay.querySelector(BARRE);
  const finestra = barra && barra.parentElement;
  if (!finestra) return;
  let pos = { x: 0, y: 0 };
  barra.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const partenza = { mx: e.clientX, my: e.clientY, ...pos };
    barra.classList.add("finestra-barra--trascina");
    const muovi = (ev) => {
      const r = finestra.getBoundingClientRect();
      pos = limitaPosizioneFinestra(
        { x: partenza.x + ev.clientX - partenza.mx, y: partenza.y + ev.clientY - partenza.my },
        { w: r.width, h: r.height },
        { w: window.innerWidth, h: window.innerHeight },
      );
      finestra.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    };
    const rilascia = () => {
      document.removeEventListener("mousemove", muovi);
      document.removeEventListener("mouseup", rilascia);
      barra.classList.remove("finestra-barra--trascina");
    };
    document.addEventListener("mousemove", muovi);
    document.addEventListener("mouseup", rilascia);
  });
}
