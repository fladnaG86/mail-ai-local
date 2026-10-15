//! Blocco I2 — zoom della composizione (`ChunkZoom`) e markup dei comandi di
//! formattazione del corpo (`Barrato`, `Cancella formattazione`, `Testo normale`,
//! `Colore evidenziazione carattere`).
//!
//! Tutto ciò che è **puro** vive qui, così si collauda senza DOM e senza
//! interfaccia. L'interfaccia applica lo zoom come stile CSS sul corpo
//! `contenteditable` e inserisce il markup dei comandi con `insertHTML`, **senza
//! mai riscrivere `innerHTML` da `innerText`**: altrimenti si distruggerebbe il
//! contenuto già formattato.

use crate::config::{ZOOM_COMPOSIZIONE_MAX, ZOOM_COMPOSIZIONE_MIN};

/// Stile CSS dello zoom del corpo: `font-size: Npx`. La percentuale viene
/// limitata all'intervallo ammesso; `base_px` è la dimensione in punti scelta
/// nelle impostazioni.
pub fn stile_zoom(percent: i64, base_px: i64) -> String {
    let p = percent.clamp(ZOOM_COMPOSIZIONE_MIN, ZOOM_COMPOSIZIONE_MAX);
    let px = base_px * p / 100;
    format!("font-size: {px}px")
}

/// Colori dell'evidenziazione (etichetta `Colore evidenziazione carattere`),
/// nell'ordine del riferimento. `Nessuno` toglie l'evidenziazione.
pub const COLORI_EVIDENZIAZIONE: [(&str, &str); 5] = [
    ("Giallo", "#ffff00"),
    ("Verde", "#00ff00"),
    ("Turchese", "#00ffff"),
    ("Rosa", "#ff99ff"),
    ("Nessuno", ""),
];

/// Nome leggibile di un colore di evidenziazione (fallback: il primo).
pub fn nome_colore(indice: usize) -> &'static str {
    COLORI_EVIDENZIAZIONE
        .get(indice)
        .map(|(n, _)| *n)
        .unwrap_or(COLORI_EVIDENZIAZIONE[0].0)
}

/// Il valore esadecimale di un colore di evidenziazione, dato l'indice.
pub fn valore_colore(indice: usize) -> &'static str {
    COLORI_EVIDENZIAZIONE
        .get(indice)
        .map(|(_, v)| *v)
        .unwrap_or(COLORI_EVIDENZIAZIONE[0].1)
}

/// Markup HTML del comando applicato al testo (o alla selezione) indicati.
///
/// Comandi (etichette del riferimento):
/// - `barrato` → `<s>…</s>`;
/// - `testo_normale` → riporta il testo al carattere/dimensione ereditati;
/// - `cancella_formattazione` → il solo testo, senza markup;
/// - `evidenzia` → `<span style="background-color: …">…</span>`.
///
/// `None` per un comando sconosciuto: l'interfaccia lo dichiara invece di
/// applicare qualcosa a caso.
pub fn markup_formattazione(comando: &str, testo: &str, colore: Option<&str>) -> Option<String> {
    match comando {
        "barrato" => Some(format!("<s>{}</s>", esc(testo))),
        "testo_normale" => Some(format!(
            "<span style=\"font-family: inherit; font-size: inherit\">{}</span>",
            esc(testo)
        )),
        "cancella_formattazione" => Some(esc(testo)),
        "evidenzia" => {
            let c = colore.unwrap_or("").trim();
            if c.is_empty() {
                Some(esc(testo))
            } else {
                Some(format!(
                    "<span style=\"background-color: {}\">{}</span>",
                    esc(c),
                    esc(testo)
                ))
            }
        }
        _ => None,
    }
}

/// Fuga dei caratteri HTML, così il testo inserito non interpreta tag.
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lo_zoom_produce_la_dimensione_attesa() {
        assert_eq!(stile_zoom(100, 12), "font-size: 12px");
        assert_eq!(stile_zoom(150, 12), "font-size: 18px");
        assert_eq!(stile_zoom(200, 10), "font-size: 20px");
    }

    #[test]
    fn lo_zoom_viene_limitato_all_intervallo() {
        // Sotto il minimo → minimo; sopra il massimo → massimo.
        assert_eq!(stile_zoom(10, 10), stile_zoom(ZOOM_COMPOSIZIONE_MIN, 10));
        assert_eq!(
            stile_zoom(10_000, 10),
            stile_zoom(ZOOM_COMPOSIZIONE_MAX, 10)
        );
    }

    #[test]
    fn la_formattazione_produce_il_markup_atteso() {
        assert_eq!(
            markup_formattazione("barrato", "fermo impianto", None).as_deref(),
            Some("<s>fermo impianto</s>")
        );
        assert_eq!(
            markup_formattazione("evidenzia", "Esempio2026!", Some("#ffff00")).as_deref(),
            Some("<span style=\"background-color: #ffff00\">Esempio2026!</span>")
        );
        assert_eq!(
            markup_formattazione("cancella_formattazione", "testo", None).as_deref(),
            Some("testo")
        );
        // Testo normale: nessun carattere/dimensione fissi, si eredita.
        let normale = markup_formattazione("testo_normale", "ciao", None).unwrap();
        assert!(normale.contains("inherit"));
    }

    #[test]
    fn il_testo_viene_fuggito() {
        let m = markup_formattazione("barrato", "<script>x</script>", None).unwrap();
        assert!(!m.contains("<script>"));
        assert!(m.contains("&lt;script&gt;"));
    }

    #[test]
    fn un_comando_sconosciuto_non_produce_null_a_caso() {
        assert!(markup_formattazione("sottolinea-magico", "x", None).is_none());
    }
}
