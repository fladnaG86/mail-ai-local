//! Blocco U1 — scheda contatto completa: ruolo, indirizzo, più email e più
//! telefoni con etichetta, origine. L'email principale resta la chiave dei dati
//! già salvati; un'email non appartiene mai a due contatti.

use outlook_ai_lib::contatti::{Contatto, Recapito};
use outlook_ai_lib::store::{ContattoInput, Store};
use tempfile::tempdir;

fn recapito(etichetta: &str, valore: &str) -> Recapito {
    Recapito { etichetta: etichetta.to_string(), valore: valore.to_string() }
}

fn salva(store: &Store, c: &Contatto) -> Result<(i64, bool), String> {
    store.contatto_salva(&ContattoInput::from(c)).map_err(|e| e.to_string())
}

fn leggi(store: &Store, id: i64) -> Contatto {
    store.contatti(None).unwrap().into_iter().map(Contatto::from).find(|c| c.id == Some(id)).unwrap()
}

#[test]
fn un_database_di_prima_si_apre_e_i_contatti_restano() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("cache.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE contatti (
               id INTEGER PRIMARY KEY, nome TEXT NOT NULL DEFAULT '', cognome TEXT NOT NULL DEFAULT '',
               email TEXT NOT NULL UNIQUE, telefono TEXT NOT NULL DEFAULT '', azienda TEXT NOT NULL DEFAULT '',
               note TEXT NOT NULL DEFAULT '', creato INTEGER NOT NULL DEFAULT 0,
               modificato INTEGER NOT NULL DEFAULT 0);
             INSERT INTO contatti (nome, cognome, email) VALUES ('Luca', 'Bianchi', 'luca@esempiohost.it');",
        )
        .unwrap();
    }
    let store = Store::open(&path).unwrap();
    let c: Contatto = store.contatti(None).unwrap().remove(0).into();
    assert_eq!(c.email, "luca@esempiohost.it");
    assert_eq!(c.nome, "Luca");
    assert!(c.email_altre.is_empty() && c.telefoni.is_empty());
    assert_eq!(c.ruolo, "");
}

#[test]
fn la_scheda_completa_si_salva_e_si_rilegge() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let c = Contatto {
        nome: "Luca".into(),
        cognome: "Bianchi".into(),
        email: "Luca@EsempioHost.it".into(),
        email_altre: vec![recapito("casa", "Luca.B@Esempio.org")],
        telefono: "+39 02 1234".into(),
        telefoni: vec![recapito("cellulare", "+39 333 1234567")],
        azienda: "Esempio Group".into(),
        ruolo: "Responsabile tecnico".into(),
        indirizzo: "Via Roma 1, Milano".into(),
        ..Default::default()
    };
    let (id, aggiornato) = salva(&store, &c).unwrap();
    assert!(!aggiornato);
    let letto = leggi(&store, id);
    assert_eq!(letto.email, "luca@esempiohost.it");
    assert_eq!(letto.email_altre, vec![recapito("casa", "luca.b@esempio.org")]);
    assert_eq!(letto.telefoni, vec![recapito("cellulare", "+39 333 1234567")]);
    assert_eq!(letto.ruolo, "Responsabile tecnico");
    assert_eq!(letto.indirizzo, "Via Roma 1, Milano");
}

#[test]
fn un_email_gia_di_un_altro_contatto_non_si_puo_aggiungere_come_altra() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    salva(&store, &Contatto { email: "luca@esempiohost.it".into(), ..Default::default() }).unwrap();
    let errore = salva(
        &store,
        &Contatto {
            email: "marco@esempiohost.it".into(),
            email_altre: vec![recapito("", "LUCA@esempiohost.it")],
            ..Default::default()
        },
    )
    .unwrap_err();
    assert!(errore.contains("luca@esempiohost.it"), "{errore}");
}

#[test]
fn modificando_un_contatto_non_gli_si_puo_dare_l_email_di_un_altro() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    salva(&store, &Contatto { email: "luca@esempiohost.it".into(), ..Default::default() }).unwrap();
    let (id, _) = salva(&store, &Contatto { email: "marco@esempiohost.it".into(), ..Default::default() }).unwrap();
    let mut marco = leggi(&store, id);
    marco.email_altre = vec![recapito("", "luca@esempiohost.it")];
    assert!(salva(&store, &marco).is_err());
}

#[test]
fn salvare_un_indirizzo_che_e_l_email_altra_di_un_contatto_aggiorna_quel_contatto() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let (id, _) = salva(
        &store,
        &Contatto {
            nome: "Luca".into(),
            email: "luca@esempiohost.it".into(),
            email_altre: vec![recapito("casa", "luca.b@esempio.org")],
            ..Default::default()
        },
    )
    .unwrap();
    // «Aggiungi ai contatti» da un messaggio mandato dall'indirizzo di casa.
    let (stesso, aggiornato) = salva(&store, &Contatto { email: "luca.b@esempio.org".into(), ..Default::default() }).unwrap();
    assert_eq!((stesso, aggiornato), (id, true));
    assert_eq!(store.contatti(None).unwrap().len(), 1);
    assert_eq!(leggi(&store, id).email, "luca@esempiohost.it", "la principale resta quella");
}

#[test]
fn la_ricerca_per_email_trova_anche_le_email_altre() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let (id, _) = salva(
        &store,
        &Contatto { email: "luca@esempiohost.it".into(), email_altre: vec![recapito("", "lb@esempio.org")], ..Default::default() },
    )
    .unwrap();
    assert_eq!(store.contatto_per_email("LB@esempio.org").unwrap().map(|r| r.id), Some(id));
}

#[test]
fn deduplicando_per_email_le_email_altre_si_uniscono() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let (id, _) = salva(
        &store,
        &Contatto { email: "luca@esempiohost.it".into(), email_altre: vec![recapito("casa", "a@esempio.org")], ..Default::default() },
    )
    .unwrap();
    salva(
        &store,
        &Contatto { email: "luca@esempiohost.it".into(), email_altre: vec![recapito("lavoro", "b@esempio.org")], ..Default::default() },
    )
    .unwrap();
    let altre: Vec<String> = leggi(&store, id).email_altre.into_iter().map(|r| r.valore).collect();
    assert_eq!(altre, vec!["a@esempio.org", "b@esempio.org"]);
}

#[test]
fn l_origine_automatica_si_ricorda_e_un_salvataggio_a_mano_la_toglie() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let (id, _) = salva(&store, &Contatto { email: "luca@esempiohost.it".into(), origine: "automatico".into(), ..Default::default() }).unwrap();
    assert_eq!(leggi(&store, id).origine, "automatico");
    salva(&store, &Contatto { email: "luca@esempiohost.it".into(), nome: "Luca".into(), ..Default::default() }).unwrap();
    assert_eq!(leggi(&store, id).origine, "");
}

#[test]
fn il_contatto_viaggia_in_camel_case_verso_l_interfaccia() {
    let c = Contatto { email_altre: vec![recapito("casa", "a@b.it")], ..Default::default() };
    let json = serde_json::to_value(&c).unwrap();
    assert_eq!(json["emailAltre"][0]["etichetta"], "casa");
    assert!(json.get("telefoni").is_some() && json.get("ruolo").is_some() && json.get("indirizzo").is_some());
}
