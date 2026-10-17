//! Rinomina delle cartelle. Su server come quelli che tengono tutto sotto
//! `INBOX.` (separatore `.`), scrivere solo il nome nuovo deve lasciare la
//! cartella dov'era: «INBOX.Progetti» → «Clienti» diventa «INBOX.Clienti», non
//! una cartella fuori da INBOX che il server rifiuta. E INBOX non si rinomina:
//! in IMAP sposterebbe tutta la posta in arrivo in un'altra cartella.

use outlook_ai_lib::mail::ops::{nome_completo_rinomina, server_rinomina_cartella};
use outlook_ai_lib::mail::FakeSource;

#[test]
fn il_nome_nuovo_resta_sotto_lo_stesso_genitore() {
    assert_eq!(nome_completo_rinomina("INBOX.Progetti", "Clienti", Some(".")), "INBOX.Clienti");
    assert_eq!(nome_completo_rinomina("Lavoro/2025", "2026", Some("/")), "Lavoro/2026");
}

#[test]
fn una_cartella_in_cima_resta_in_cima() {
    assert_eq!(nome_completo_rinomina("Progetti", "Clienti", Some(".")), "Clienti");
}

#[test]
fn un_nome_che_contiene_gia_il_separatore_si_usa_com_e() {
    assert_eq!(nome_completo_rinomina("INBOX.Progetti", "INBOX.Archivio.2026", Some(".")), "INBOX.Archivio.2026");
}

#[test]
fn senza_separatore_noto_il_nome_si_usa_com_e() {
    assert_eq!(nome_completo_rinomina("INBOX.Progetti", "Clienti", None), "Clienti");
}

#[test]
fn gli_spazi_ai_bordi_si_tolgono() {
    assert_eq!(nome_completo_rinomina("INBOX.Progetti", "  Clienti ", Some(".")), "INBOX.Clienti");
}

#[tokio::test]
async fn inbox_non_si_rinomina() {
    let sorgente = FakeSource::default();
    for nome in ["INBOX", "inbox", "Inbox"] {
        let esito = server_rinomina_cartella(&sorgente, nome, "Altro").await;
        let errore = esito.expect_err(nome);
        assert!(errore.contains("Posta in arrivo"), "{errore}");
    }
}
