//! Test della lettura MIME del corpo e degli allegati (task 4.2/4.3, Milestone 4).
//!
//! Il messaggio di prova è costruito qui dentro: una parte `text/plain`, una
//! `text/html` con un pixel di tracciamento remoto e un allegato PDF in base64.
//! Nessuna rete: si esercita solo il parsing.

use outlook_ai_lib::mail::mime::analizza;
use outlook_ai_lib::mail::{FakeSource, MailSource};
use outlook_ai_lib::sanitize::sanifica;

/// Messaggio multipart/mixed con testo, HTML (immagine remota) e un PDF allegato.
fn messaggio_di_prova() -> Vec<u8> {
    let righe = [
        "From: Luca Bianchi <luca@example.it>",
        "To: mario@example.it",
        "Subject: Preventivo con allegato",
        "MIME-Version: 1.0",
        "Content-Type: multipart/mixed; boundary=\"BOUND\"",
        "",
        "--BOUND",
        "Content-Type: text/plain; charset=\"utf-8\"",
        "",
        "Buongiorno, in allegato il preventivo richiesto.",
        "--BOUND",
        "Content-Type: text/html; charset=\"utf-8\"",
        "",
        "<html><body><p>Buongiorno</p><img src=\"http://tracker.example/p.gif\"></body></html>",
        "--BOUND",
        "Content-Type: application/pdf; name=\"preventivo.pdf\"",
        "Content-Disposition: attachment; filename=\"preventivo.pdf\"",
        "Content-Transfer-Encoding: base64",
        "",
        "SGVsbG8gUERG",
        "--BOUND--",
        "",
    ];
    righe.join("\r\n").into_bytes()
}

#[test]
fn separa_testo_html_e_allegati() {
    let corpo = analizza(&messaggio_di_prova());

    let testo = corpo.testo.as_deref().expect("la parte text/plain deve essere letta");
    assert!(
        testo.contains("in allegato il preventivo"),
        "il testo non è stato estratto: {testo}"
    );

    let html = corpo.html.as_deref().expect("la parte text/html deve essere letta");
    assert!(
        html.contains("tracker.example"),
        "l HTML non è stato estratto: {html}"
    );

    assert_eq!(corpo.allegati.len(), 1, "un solo allegato nel messaggio di prova");
    assert!(
        corpo.ha_allegati(),
        "has_attachments deve essere vero col PDF presente"
    );
}

#[test]
fn l_allegato_ha_nome_tipo_e_dimensione() {
    let corpo = analizza(&messaggio_di_prova());
    let pdf = &corpo.allegati[0];

    assert_eq!(pdf.nome, "preventivo.pdf");
    assert_eq!(pdf.tipo, "application/pdf");
    // "SGVsbG8gUERG" è base64 di "Hello PDF": 9 byte.
    assert_eq!(pdf.dimensione, 9, "dimensione del contenuto decodificato");
    assert_eq!(pdf.dati, b"Hello PDF", "il contenuto è decodificato");
}

#[test]
fn un_messaggio_solo_testo_non_ha_allegati() {
    let righe = [
        "From: a@example.it",
        "To: b@example.it",
        "Subject: Saluto",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=\"utf-8\"",
        "",
        "Ciao, nessun allegato qui.",
    ];
    let corpo = analizza(righe.join("\r\n").as_bytes());

    assert!(!corpo.ha_allegati(), "senza parti allegate has_attachments è falso");
    assert!(corpo.testo.unwrap().contains("nessun allegato"));
}

#[test]
fn l_html_del_corpo_viene_sanificato_a_valle() {
    // Il parsing non sanifica: lo fa `sanitize`. Qui verifichiamo l'integrazione.
    let corpo = analizza(&messaggio_di_prova());
    let html = sanifica(corpo.html.as_deref().unwrap(), false);

    assert!(html.contains("immagine esterna bloccata"));
    assert!(!html.contains("tracker.example"));
    assert!(html.contains("Buongiorno"));
}

#[tokio::test]
async fn la_sorgente_finta_legge_il_corpo_per_cartella_e_uid() {
    // Il trait ora riceve anche la cartella (correzione della deviazione di v1).
    let sorgente = FakeSource::new();
    let corpo = sorgente.body("INBOX", "101").await.unwrap();
    assert!(!corpo.is_empty(), "la sorgente finta restituisce un corpo non vuoto");
}
