//! Nome completo di una cartella nuova. Dentro un genitore si usa il separatore
//! del server (non sempre `/`). Al primo livello, sui server che tengono tutto
//! sotto `INBOX.` (come quello dell'utente: INBOX.Drafts, INBOX.Sent, ...), la
//! cartella va sotto INBOX: fuori il server la rifiuta.

use outlook_ai_lib::mail::ops::nome_completo_nuova;

fn cartelle(nomi: &[&str]) -> Vec<String> {
    nomi.iter().map(|s| s.to_string()).collect()
}

#[test]
fn dentro_un_genitore_si_usa_il_separatore_del_server() {
    let esistenti = cartelle(&["INBOX", "INBOX.Drafts"]);
    assert_eq!(nome_completo_nuova("Progetti", Some("INBOX"), Some("."), &esistenti), "INBOX.Progetti");
    assert_eq!(nome_completo_nuova("2026", Some("Lavoro"), Some("/"), &cartelle(&["INBOX", "Lavoro"])), "Lavoro/2026");
}

#[test]
fn senza_separatore_noto_dentro_un_genitore_si_usa_la_barra() {
    assert_eq!(nome_completo_nuova("2026", Some("Lavoro"), None, &[]), "Lavoro/2026");
}

#[test]
fn al_primo_livello_su_un_server_inbox_punto_la_cartella_va_sotto_inbox() {
    let esistenti = cartelle(&["INBOX", "INBOX.Drafts", "INBOX.Sent", "INBOX.SPAM", "INBOX.Trash"]);
    assert_eq!(nome_completo_nuova("Clienti", None, Some("."), &esistenti), "INBOX.Clienti");
}

#[test]
fn al_primo_livello_su_un_server_con_cartelle_in_cima_resta_in_cima() {
    let esistenti = cartelle(&["INBOX", "Drafts", "Sent", "Trash"]);
    assert_eq!(nome_completo_nuova("Clienti", None, Some("/"), &esistenti), "Clienti");
}

#[test]
fn con_la_sola_inbox_non_si_indovina_e_si_resta_in_cima() {
    assert_eq!(nome_completo_nuova("Clienti", None, Some("."), &cartelle(&["INBOX"])), "Clienti");
}

#[test]
fn un_nome_che_contiene_gia_il_separatore_si_usa_com_e() {
    let esistenti = cartelle(&["INBOX", "INBOX.Drafts"]);
    assert_eq!(nome_completo_nuova("INBOX.Clienti.2026", None, Some("."), &esistenti), "INBOX.Clienti.2026");
}

#[test]
fn gli_spazi_ai_bordi_si_tolgono() {
    assert_eq!(nome_completo_nuova("  Clienti ", Some(" INBOX "), Some("."), &[]), "INBOX.Clienti");
}
