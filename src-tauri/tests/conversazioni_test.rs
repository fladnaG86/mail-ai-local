//! Test del raggruppamento in conversazioni (blocco H).
//!
//! Coprono: l'unione per References/In-Reply-To anche con oggetti diversi,
//! l'unione per oggetto normalizzato quando mancano i riferimenti (e la NON
//! unione di oggetti diversi), la pulizia dei prefissi di risposta/inoltro e il
//! conteggio dei non letti di una conversazione dalla cache.

use outlook_ai_lib::mail::conversazioni;
use outlook_ai_lib::mail::sync::aggiorna_thread;
use outlook_ai_lib::store::{Header, Store, ThreadInputRow};

/// Una riga per il raggruppamento, con soli campi d'interesse valorizzati.
fn riga(
    uid: &str,
    message_id: Option<&str>,
    in_reply_to: Option<&str>,
    references: Option<&str>,
    oggetto: &str,
) -> ThreadInputRow {
    ThreadInputRow {
        uid: uid.to_string(),
        message_id: message_id.map(str::to_string),
        in_reply_to: in_reply_to.map(str::to_string),
        references: references.map(str::to_string),
        subject: Some(oggetto.to_string()),
    }
}

/// Una riga di cache senza corpo.
fn header(uid: &str, message_id: Option<&str>, in_reply_to: Option<&str>, oggetto: &str, seen: bool) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: message_id.map(str::to_string),
        subject: Some(oggetto.to_string()),
        sender: Some("Luca <luca@example.it>".to_string()),
        recipients: Some("mario@example.it".to_string()),
        date: 1_700_000_000 + uid.parse::<i64>().unwrap_or(0),
        seen,
        has_attachments: false,
        thread_key: None,
        in_reply_to: in_reply_to.map(str::to_string),
        references: None,
    }
}

#[test]
fn i_references_uniscono_anche_con_oggetti_diversi() {
    // Un messaggio risponde a un altro, ma l'oggetto è cambiato: stanno insieme.
    let righe = vec![
        riga("1", Some("<root@example.it>"), None, None, "Piano manutenzione Q4"),
        riga(
            "2",
            Some("<risp@example.it>"),
            Some("<root@example.it>"),
            None,
            "Re: Riunione di lunedì",
        ),
    ];
    let chiavi = conversazioni::chiavi_conversazione(&righe);
    assert_eq!(chiavi[0], chiavi[1], "il riferimento unisce a prescindere dall'oggetto");
}

#[test]
fn i_references_in_una_catena_uniscono_tutti_i_messaggi() {
    let righe = vec![
        riga("1", Some("<a@x>"), None, None, "Oggetto A"),
        riga("2", Some("<b@x>"), Some("<a@x>"), None, "Re: Oggetto A"),
        riga("3", Some("<c@x>"), Some("<b@x>"), None, "Re: Oggetto A"),
    ];
    let chiavi = conversazioni::chiavi_conversazione(&righe);
    assert_eq!(chiavi[0], chiavi[1]);
    assert_eq!(chiavi[1], chiavi[2]);
}

#[test]
fn senza_references_unisce_per_oggetto_normalizzato_e_non_unisce_oggetti_diversi() {
    let righe = vec![
        riga("1", Some("<a@x>"), None, None, "Prenotazione ritiro AMAZON DHL"),
        riga("2", Some("<b@x>"), None, None, "I: Prenotazione ritiro AMAZON DHL"),
        riga("3", Some("<c@x>"), None, None, "Tutt'altro argomento"),
    ];
    let chiavi = conversazioni::chiavi_conversazione(&righe);
    assert_eq!(chiavi[0], chiavi[1], "stesso oggetto normalizzato → stessa conversazione");
    assert_ne!(chiavi[0], chiavi[2], "oggetti diversi → conversazioni diverse");
}

#[test]
fn i_prefissi_di_risposta_e_inoltro_sono_tolti() {
    assert_eq!(conversazioni::normalizza_oggetto("Re: Piano Q4"), "piano q4");
    assert_eq!(conversazioni::normalizza_oggetto("R: Piano Q4"), "piano q4");
    assert_eq!(conversazioni::normalizza_oggetto("I: Piano Q4"), "piano q4");
    assert_eq!(conversazioni::normalizza_oggetto("Rif: Piano Q4"), "piano q4");
    assert_eq!(conversazioni::normalizza_oggetto("Fwd: Piano Q4"), "piano q4");
    assert_eq!(conversazioni::normalizza_oggetto("Fw: Piano Q4"), "piano q4");
    // Più prefissi, un marcatore e spazi in eccesso: tutti insieme.
    assert_eq!(
        conversazioni::normalizza_oggetto("Re: [externa]  I:  Piano   Q4 "),
        "piano q4"
    );
    // Un oggetto senza prefissi resta, spazi e maiuscole a parte.
    assert_eq!(conversazioni::normalizza_oggetto("  Piano  Q4 "), "piano q4");
}

#[test]
fn senza_riferimenti_ne_con_message_id_una_riga_resta_da_sola() {
    let righe = vec![riga("7", None, None, None, "")];
    let chiavi = conversazioni::chiavi_conversazione(&righe);
    assert_eq!(chiavi[0], "uid:7");
}

#[test]
fn i_non_letti_della_conversazione_si_contano_bene() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("1", Some("<a@x>"), None, "Piano Q4", true)).unwrap();
    store
        .upsert_header(&header("2", Some("<b@x>"), Some("<a@x>"), "Re: Piano Q4", false))
        .unwrap();
    store
        .upsert_header(&header("3", Some("<c@x>"), Some("<b@x>"), "Re: Piano Q4", false))
        .unwrap();
    // Un messaggio di un'altra conversazione, letto.
    store.upsert_header(&header("4", Some("<z@x>"), None, "Fattura", true)).unwrap();

    aggiorna_thread(&store, "acct", "INBOX").unwrap();
    let conv = store.conversazioni("INBOX", 0, 20).unwrap();
    assert_eq!(conv.len(), 2, "due conversazioni distinte");

    let piano = conv
        .iter()
        .find(|c| c.numero == 3)
        .expect("la conversazione del piano ha tre messaggi");
    assert_eq!(piano.non_letti, 2, "due messaggi non letti");
    assert!(!piano.seen, "non tutti letti");
    assert_eq!(piano.messaggi.len(), 3);
    // In ordine cronologico: dal più vecchio (UID 1) al più recente.
    assert_eq!(piano.messaggi[0].uid, "1");
    assert_eq!(piano.messaggi[2].uid, "3");
    assert_eq!(piano.uid, "3", "il rappresentante è il messaggio più recente");

    let fattura = conv.iter().find(|c| c.numero == 1).unwrap();
    assert_eq!(fattura.non_letti, 0);
    assert!(fattura.seen);
}
