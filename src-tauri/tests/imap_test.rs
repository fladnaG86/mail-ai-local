//! Test del client IMAP (task 3.2): costruzione dei parametri di connessione
//! dalla configurazione dell account. Nessun test apre una connessione di rete:
//! si verifica solo che host, porta e TLS siano quelli attesi.

use outlook_ai_lib::config::Account;
use outlook_ai_lib::mail::imap::ConnectionParams;

/// Account di prova con i parametri reali di riferimento (Esempio Host).
fn account() -> Account {
    Account {
        id: "mario".to_string(),
        description: "Posta lavorativa".to_string(),
        full_name: "Mario Rossi".to_string(),
        email: "mario.rossi@esempiogroup.it".to_string(),
        username: "mario.rossi@esempiogroup.it".to_string(),
        imap_host: "imaps.esempiohost.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.esempiohost.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    }
}

#[test]
fn i_parametri_usano_tls_e_la_porta_993() {
    let p = ConnectionParams::from_account(&account()).unwrap();
    assert_eq!(p.host, "imaps.esempiohost.it");
    assert_eq!(p.port, 993);
    assert!(p.tls, "il TLS e obbligatorio: nessuna opzione ignora-certificato");
    assert_eq!(p.username, "mario.rossi@esempiogroup.it");
}

#[test]
fn un_account_senza_ssl_e_rifiutato() {
    let mut a = account();
    a.imap_ssl = false;
    assert!(
        ConnectionParams::from_account(&a).is_err(),
        "senza TLS la connessione non deve essere costruita"
    );
}
