//! Blocco U5 — aggiunta automatica: dopo un invio riuscito, i destinatari che
//! non sono in rubrica entrano con origine «automatico». Chi c'è già non si
//! tocca; il proprio indirizzo non entra; la preferenza la spegne.

use outlook_ai_lib::aggiungi_destinatari_in;
use outlook_ai_lib::config::Preferenze;
use outlook_ai_lib::contatti::{contatti_da_destinatari, Contatto};
use outlook_ai_lib::store::{ContattoInput, Store};
use tempfile::tempdir;

fn indirizzi(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn dai_destinatari_si_ricavano_nome_cognome_e_indirizzo() {
    let c = contatti_da_destinatari(
        &indirizzi(&["Luca Bianchi <Luca@EsempioHost.it>", "anna@esempiohost.it", "\"Rossi, Mario\" <mario@esempiohost.it>"]),
        "io@esempiogroup.it",
    );
    let viste: Vec<(&str, &str, &str, &str)> =
        c.iter().map(|c| (c.nome.as_str(), c.cognome.as_str(), c.email.as_str(), c.origine.as_str())).collect();
    assert_eq!(
        viste,
        vec![
            ("Luca", "Bianchi", "luca@esempiohost.it", "automatico"),
            ("", "", "anna@esempiohost.it", "automatico"),
            ("Mario", "Rossi", "mario@esempiohost.it", "automatico"),
        ]
    );
}

#[test]
fn il_proprio_indirizzo_e_i_doppioni_non_entrano() {
    let c = contatti_da_destinatari(
        &indirizzi(&["Io <IO@esempiogroup.it>", "anna@esempiohost.it", "Anna <ANNA@esempiohost.it>", "", "non-un-indirizzo"]),
        "io@esempiogroup.it",
    );
    assert_eq!(c.iter().map(|c| c.email.as_str()).collect::<Vec<_>>(), vec!["anna@esempiohost.it"]);
}

#[test]
fn dopo_l_invio_entrano_solo_i_destinatari_nuovi() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let store = Store::open(&db).unwrap();
    let (id_luca, _) = store
        .contatto_salva(&ContattoInput::from(&Contatto {
            nome: "Luca".into(),
            email: "luca@esempiohost.it".into(),
            note: "da non toccare".into(),
            ..Default::default()
        }))
        .unwrap();
    drop(store);
    let aggiunti = aggiungi_destinatari_in(
        &db,
        &indirizzi(&["Luca Bianchi <luca@esempiohost.it>", "Anna Verdi <anna@esempiohost.it>"]),
        "io@esempiogroup.it",
    )
    .unwrap();
    assert_eq!(aggiunti, 1);
    let store = Store::open(&db).unwrap();
    let tutti: Vec<Contatto> = store.contatti(None).unwrap().into_iter().map(Into::into).collect();
    let luca = tutti.iter().find(|c| c.id == Some(id_luca)).unwrap();
    assert_eq!((luca.cognome.as_str(), luca.note.as_str(), luca.origine.as_str()), ("", "da non toccare", ""));
    let anna = tutti.iter().find(|c| c.email == "anna@esempiohost.it").unwrap();
    assert_eq!((anna.nome.as_str(), anna.cognome.as_str(), anna.origine.as_str()), ("Anna", "Verdi", "automatico"));
}

#[test]
fn un_destinatario_che_e_l_email_altra_di_un_contatto_non_si_duplica() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    Store::open(&db)
        .unwrap()
        .contatto_salva(&ContattoInput::from(&Contatto {
            email: "luca@esempiohost.it".into(),
            email_altre: vec![outlook_ai_lib::contatti::Recapito { etichetta: String::new(), valore: "lb@esempio.org".into() }],
            ..Default::default()
        }))
        .unwrap();
    assert_eq!(aggiungi_destinatari_in(&db, &indirizzi(&["lb@esempio.org"]), "").unwrap(), 0);
}

#[test]
fn la_preferenza_e_attiva_se_manca_nel_file() {
    let p: Preferenze = serde_json::from_str("{}").unwrap();
    assert!(p.rubrica_aggiunta_automatica);
    let p: Preferenze = serde_json::from_str(r#"{"rubricaAggiuntaAutomatica": false}"#).unwrap();
    assert!(!p.rubrica_aggiunta_automatica);
}
