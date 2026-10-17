//! Test del blocco V — aperture dall'esterno (link `mailto:` e, da V3, file).
//!
//! macOS consegna gli URL all'app con `RunEvent::Opened`, anche prima che
//! l'interfaccia sia pronta: per questo il kernel li **mette in coda** e
//! l'interfaccia li ritira (`svuota`). Qui si collauda la classificazione e la coda.

use outlook_ai_lib::aperture::{classifica, Apertura, Coda};

#[test]
fn un_mailto_resta_intero_compresa_la_query() {
    assert_eq!(
        classifica("mailto:anna@esempio.it?subject=Ciao%20a%20tutti"),
        Some(Apertura::Mailto {
            url: "mailto:anna@esempio.it?subject=Ciao%20a%20tutti".into()
        })
    );
}

#[test]
fn lo_schema_mailto_non_distingue_maiuscole() {
    assert!(matches!(classifica("MAILTO:anna@esempio.it"), Some(Apertura::Mailto { .. })));
}

#[test]
fn gli_altri_schemi_sono_ignorati() {
    assert_eq!(classifica("https://esempio.it"), None);
    assert_eq!(classifica("javascript:alert(1)"), None);
    assert_eq!(classifica(""), None);
}

#[test]
fn la_coda_restituisce_in_ordine_e_si_svuota() {
    let coda = Coda::default();
    coda.metti(classifica("mailto:a@esempio.it").unwrap());
    coda.metti(classifica("mailto:b@esempio.it").unwrap());
    let prime = coda.svuota();
    assert_eq!(prime.len(), 2);
    assert_eq!(prime[0], Apertura::Mailto { url: "mailto:a@esempio.it".into() });
    assert!(coda.svuota().is_empty(), "una seconda lettura non ripete le aperture");
}

#[test]
fn la_forma_serializzata_e_quella_che_legge_l_interfaccia() {
    let json = serde_json::to_value(Apertura::Mailto { url: "mailto:a@esempio.it".into() }).unwrap();
    assert_eq!(json, serde_json::json!({ "tipo": "mailto", "url": "mailto:a@esempio.it" }));
}
