//! Blocco U2 — vCard con la scheda completa: più EMAIL e TEL con il loro TYPE
//! (che diventa l'etichetta), TITLE (ruolo) e ADR (indirizzo), in lettura e in
//! scrittura. E un'importazione non si ferma al primo contatto in conflitto.

use outlook_ai_lib::contatti::{esporta_vcard, importa_vcard, Contatto, Recapito};
use outlook_ai_lib::contatti_importa_vcard_in;
use tempfile::tempdir;

fn recapito(etichetta: &str, valore: &str) -> Recapito {
    Recapito { etichetta: etichetta.to_string(), valore: valore.to_string() }
}

/// Una scheda come la esporta Contatti di macOS (gruppi `item1.`, TYPE multipli).
const SCHEDA_MACOS: &str = "BEGIN:VCARD\r
VERSION:3.0\r
N:Bianchi;Luca;;;\r
FN:Luca Bianchi\r
ORG:Esempio Group;\r
TITLE:Responsabile tecnico\r
EMAIL;type=INTERNET;type=WORK;type=pref:luca@esempiohost.it\r
EMAIL;type=INTERNET;type=HOME:luca.b@esempio.org\r
TEL;type=CELL;type=VOICE;type=pref:+39 333 1234567\r
TEL;type=WORK;type=VOICE:+39 02 1234\r
item1.ADR;type=WORK;type=pref:;;Via Roma 1;Milano;MI;20100;Italia\r
item1.X-ABADR:it\r
END:VCARD\r
";

#[test]
fn la_scheda_di_macos_porta_tutte_le_email_e_i_telefoni() {
    let esito = importa_vcard(SCHEDA_MACOS);
    let c = &esito.schede[0].contatto;
    assert_eq!(c.email, "luca@esempiohost.it");
    assert_eq!(c.email_altre, vec![recapito("casa", "luca.b@esempio.org")]);
    assert_eq!(c.telefono, "+39 333 1234567");
    assert_eq!(c.telefoni, vec![recapito("lavoro", "+39 02 1234")]);
    assert_eq!(c.ruolo, "Responsabile tecnico");
    assert_eq!(c.indirizzo, "Via Roma 1, Milano, MI, 20100, Italia");
    assert_eq!(c.azienda, "Esempio Group");
    assert!(!esito.ignorati.contains(&"TITLE".to_string()) && !esito.ignorati.contains(&"ADR".to_string()));
}

#[test]
fn esportare_e_reimportare_la_scheda_completa_non_cambia_i_dati() {
    let c = Contatto {
        nome: "Luca".into(),
        cognome: "Bianchi".into(),
        email: "luca@esempiohost.it".into(),
        email_altre: vec![recapito("casa", "luca.b@esempio.org"), recapito("", "lb@esempio.net")],
        telefono: "+39 333 1234567".into(),
        telefoni: vec![recapito("lavoro", "+39 02 1234"), recapito("fax", "+39 02 9999")],
        azienda: "Esempio Group".into(),
        ruolo: "Responsabile tecnico".into(),
        indirizzo: "Via Roma 1, Milano".into(),
        note: "nota".into(),
        ..Default::default()
    };
    let esito = importa_vcard(&esporta_vcard(&[c.clone()]));
    assert_eq!(esito.schede[0].contatto, c);
}

#[test]
fn un_etichetta_libera_fa_andata_e_ritorno() {
    let c = Contatto {
        email: "a@esempio.it".into(),
        telefono: "+39 333 0000".into(),
        telefoni: vec![recapito("portineria", "+39 02 5555")],
        ..Default::default()
    };
    let esito = importa_vcard(&esporta_vcard(&[c.clone()]));
    assert_eq!(esito.schede[0].contatto.telefoni, c.telefoni);
}

#[test]
fn un_importazione_salta_le_schede_in_conflitto_e_le_dichiara() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    // La seconda scheda vuole come email «altra» la principale della prima.
    let testo = format!(
        "{}{}{}",
        "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Bianchi;Luca;;;\r\nEMAIL:luca@esempiohost.it\r\nEND:VCARD\r\n",
        "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Rossi;Marco;;;\r\nEMAIL:marco@esempiohost.it\r\nEMAIL:luca@esempiohost.it\r\nEND:VCARD\r\n",
        "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Verdi;Anna;;;\r\nEMAIL:anna@esempiohost.it\r\nEND:VCARD\r\n",
    );
    let esito = contatti_importa_vcard_in(&db, &testo).unwrap();
    assert_eq!(esito.importati, 2, "la prima e la terza entrano");
    assert_eq!(esito.conflitti.len(), 1);
    assert!(esito.conflitti[0].contains("marco@esempiohost.it"), "{:?}", esito.conflitti);
}

#[test]
fn i_suggerimenti_trovano_anche_le_email_altre_col_nome_del_contatto() {
    use outlook_ai_lib::contatti::suggerisci_da;
    let rubrica = vec![Contatto {
        nome: "Luca".into(),
        cognome: "Bianchi".into(),
        email: "luca@esempiohost.it".into(),
        email_altre: vec![recapito("casa", "lb@esempio.org")],
        ..Default::default()
    }];
    let s = suggerisci_da(&rubrica, &[], "lb@", 10);
    assert_eq!(s.len(), 1);
    assert_eq!((s[0].nome.as_str(), s[0].email.as_str(), s[0].origine.as_str()), ("Luca Bianchi", "lb@esempio.org", "rubrica"));
}
