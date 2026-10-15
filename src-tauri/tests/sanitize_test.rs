//! Test della sanificazione dell'HTML (task 4.1, Milestone 4).
//!
//! Verificano la politica di sicurezza della spec (§7): via script, iframe,
//! gestori di evento e URL `javascript:`; collegamenti con `rel` sicuro; le
//! immagini remote sostituite da un segnaposto, a meno che non siano consentite.

use outlook_ai_lib::sanitize::{sanifica, SEGNAPOSTO_IMMAGINE};

/// Scorciatoia: sanifica con le immagini remote bloccate (caso predefinito).
fn pulisci(html: &str) -> String {
    sanifica(html, false)
}

#[test]
fn rimuove_i_tag_script() {
    let out = pulisci("<p>a</p><script>alert(1)</script>");
    assert!(
        !out.contains("script"),
        "il tag script non deve sopravvivere: {out}"
    );
    assert!(out.contains("<p>a</p>"), "il resto dell HTML resta: {out}");
}

#[test]
fn rimuove_iframe_object_e_embed() {
    let out = pulisci(
        "<iframe src='http://evil.example'></iframe><object data='x'></object><embed src='y'>",
    );
    assert!(!out.contains("iframe"), "iframe rimosso: {out}");
    assert!(!out.contains("<object"), "object rimosso: {out}");
    assert!(!out.contains("<embed"), "embed rimosso: {out}");
}

#[test]
fn rimuove_i_gestori_di_evento() {
    let out = pulisci("<img src=x onerror=alert(1)>");
    assert!(!out.contains("onerror"), "gli attributi on* vanno rimossi: {out}");
}

#[test]
fn non_lascia_passare_javascript_negli_href() {
    let out = pulisci("<a href=\"javascript:alert(1)\">clic</a>");
    assert!(
        !out.contains("javascript:"),
        "javascript: non deve comparire nell href: {out}"
    );
    assert!(out.contains("clic"), "il testo del link resta: {out}");
}

#[test]
fn blocca_e_segnala_le_immagini_remote() {
    let out = pulisci("<p>ciao</p><img src='http://t.example/p.gif'>");
    assert!(
        out.contains("bloccata"),
        "l immagine remota diventa un segnaposto parlante: {out}"
    );
    assert!(
        !out.contains("t.example"),
        "l URL remoto non deve restare nell HTML servito: {out}"
    );
    assert_eq!(out.matches("immagine esterna bloccata").count(), 1);
}

#[test]
fn blocca_le_immagini_remote_anche_su_https() {
    let out = pulisci("<img src=\"https://cdn.example/a.png\">");
    assert!(out.contains("bloccata"), "anche https è esterno: {out}");
    assert_eq!(out, SEGNAPOSTO_IMMAGINE);
}

#[test]
fn conserva_testo_e_collegamenti_con_rel_sicuro() {
    let out = pulisci("<p>Ciao</p><a href='https://ok.it/pagina'>Apri</a>");
    assert!(out.contains("https://ok.it/pagina"), "il link resta: {out}");
    assert!(out.contains(">Apri<"), "il testo del link resta: {out}");
    assert!(
        out.contains("noopener") && out.contains("noreferrer"),
        "i link escono con rel di sicurezza: {out}"
    );
}

#[test]
fn con_immagini_consentite_l_immagine_remota_resta() {
    let out = sanifica("<img src='http://t.example/p.gif'>", true);
    assert!(
        out.contains("http://t.example"),
        "col consenso l immagine resta: {out}"
    );
    assert!(
        !out.contains("bloccata"),
        "col consenso non c è segnaposto: {out}"
    );
}

#[test]
fn una_immagine_locale_non_viene_toccata() {
    // Sorgente relativa (non remota): nessun segnaposto, l'immagine resta.
    let out = pulisci("<img src=\"logo.png\" alt=\"logo\">");
    assert!(!out.contains("bloccata"), "locale non è remoto: {out}");
    assert!(out.contains("logo.png"), "l immagine relativa resta: {out}");
}
