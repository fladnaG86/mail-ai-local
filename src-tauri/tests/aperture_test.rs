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

// ---------------------------------------------------------------------------
// Blocco V3: file aperti dal Finder (.eml, .ics, .vcf). Il kernel li legge e li
// interpreta subito: in coda va il contenuto, mai un percorso da leggere dopo.
// ---------------------------------------------------------------------------

use std::path::Path;

/// Scrive `contenuto` in `dir/nome` e restituisce l'URL `file://` che manda macOS.
fn file_url(dir: &Path, nome: &str, contenuto: &[u8]) -> String {
    let percorso = dir.join(nome);
    std::fs::write(&percorso, contenuto).unwrap();
    tauri::Url::from_file_path(&percorso).unwrap().to_string()
}

const EML: &str = "From: Anna Verdi <anna@esempio.it>\r\n\
To: Bruno <bruno@esempio.it>\r\n\
Cc: carla@esempio.it\r\n\
Subject: =?utf-8?Q?Preventivo_luned=C3=AC?=\r\n\
Date: Fri, 16 Oct 2026 09:30:00 +0200\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/html; charset=utf-8\r\n\
\r\n\
<p>Ecco il preventivo.</p><script>alert(1)</script><img src=\"https://traccia.esempio/x.png\">\r\n";

#[test]
fn un_eml_diventa_un_messaggio_letto_e_sanificato() {
    let dir = tempfile::tempdir().unwrap();
    // Spazio nel nome: l'URL arriva con %20 e va decodificato.
    let url = file_url(dir.path(), "Messaggio salvato.eml", EML.as_bytes());
    assert!(url.contains("%20"));
    let Some(Apertura::Messaggio { nome_file, oggetto, da, a, cc, data, corpo }) = classifica(&url) else {
        panic!("atteso un messaggio, ottenuto {:?}", classifica(&url));
    };
    assert_eq!(nome_file, "Messaggio salvato.eml");
    assert_eq!(oggetto, "Preventivo lunedì");
    assert_eq!(da, "Anna Verdi <anna@esempio.it>");
    assert_eq!(a, "Bruno <bruno@esempio.it>");
    assert_eq!(cc, "carla@esempio.it");
    // 16/10/2026 09:30 +0200 = 07:30 UTC.
    assert_eq!(data, Some(1_792_135_800));
    assert!(corpo.html.contains("Ecco il preventivo."));
    assert!(!corpo.html.contains("<script"), "lo script va tolto");
    assert!(corpo.immagini_bloccate, "le immagini remote restano bloccate");
}

#[test]
fn l_estensione_non_distingue_maiuscole() {
    let dir = tempfile::tempdir().unwrap();
    let url = file_url(dir.path(), "VECCHIO.EML", EML.as_bytes());
    assert!(matches!(classifica(&url), Some(Apertura::Messaggio { .. })));
}

#[test]
fn un_ics_diventa_un_calendario_con_i_suoi_eventi() {
    let dir = tempfile::tempdir().unwrap();
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\n\
UID:evento-1\r\nSUMMARY:Revisione trimestrale\r\nDTSTART:20261020T080000Z\r\n\
DTEND:20261020T090000Z\r\nLOCATION:Sala A\r\nORGANIZER;CN=Anna:mailto:anna@esempio.it\r\n\
END:VEVENT\r\nEND:VCALENDAR\r\n";
    let url = file_url(dir.path(), "invito.ics", ics.as_bytes());
    let Some(Apertura::Calendario { nome_file, inviti }) = classifica(&url) else {
        panic!("atteso un calendario");
    };
    assert_eq!(nome_file, "invito.ics");
    assert_eq!(inviti.len(), 1);
    assert_eq!(inviti[0].oggetto, "Revisione trimestrale");
    assert_eq!(inviti[0].luogo, "Sala A");
}

#[test]
fn un_vcf_diventa_contatti_da_confermare_col_testo_per_l_importazione() {
    let dir = tempfile::tempdir().unwrap();
    let vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Verdi;Anna;;;\r\nFN:Anna Verdi\r\n\
EMAIL:anna@esempio.it\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Senza Posta\r\nEND:VCARD\r\n";
    let url = file_url(dir.path(), "anna.vcf", vcf.as_bytes());
    let Some(Apertura::Contatti { nome_file, testo, schede, senza_email }) = classifica(&url) else {
        panic!("attesi contatti");
    };
    assert_eq!(nome_file, "anna.vcf");
    assert_eq!(testo, vcf, "il testo resta intero: lo importa `contatti_importa_vcard` alla conferma");
    assert_eq!(schede.len(), 1);
    assert_eq!(schede[0].email, "anna@esempio.it");
    assert_eq!(schede[0].nome, "Anna Verdi");
    assert_eq!(senza_email, 1);
}

#[test]
fn i_tipi_di_file_che_l_app_non_apre_sono_ignorati() {
    let dir = tempfile::tempdir().unwrap();
    let url = file_url(dir.path(), "documento.pdf", b"%PDF-1.7");
    assert_eq!(classifica(&url), None);
}

#[test]
fn un_file_mancante_o_troppo_grande_e_dichiarato_illeggibile() {
    let dir = tempfile::tempdir().unwrap();
    let mancante = tauri::Url::from_file_path(dir.path().join("sparito.eml")).unwrap();
    assert!(matches!(
        classifica(mancante.as_str()),
        Some(Apertura::Illeggibile { ref nome_file, .. }) if nome_file == "sparito.eml"
    ));

    let grande = dir.path().join("enorme.eml");
    let f = std::fs::File::create(&grande).unwrap();
    f.set_len(outlook_ai_lib::aperture::DIMENSIONE_MASSIMA + 1).unwrap();
    let url = tauri::Url::from_file_path(&grande).unwrap();
    let Some(Apertura::Illeggibile { motivo, .. }) = classifica(url.as_str()) else {
        panic!("atteso illeggibile");
    };
    assert!(motivo.contains("troppo grande"), "{motivo}");
}

#[test]
fn la_forma_serializzata_e_quella_che_legge_l_interfaccia() {
    let json = serde_json::to_value(Apertura::Mailto { url: "mailto:a@esempio.it".into() }).unwrap();
    assert_eq!(json, serde_json::json!({ "tipo": "mailto", "url": "mailto:a@esempio.it" }));
}
