//! Blocco U4 — gruppi di contatti (liste di distribuzione). Un gruppo ha un
//! nome e degli indirizzi; nei campi A/Cc compare fra i suggerimenti e si
//! espande negli indirizzi dei membri (al server arrivano solo indirizzi).

use outlook_ai_lib::contatti::Gruppo;
use outlook_ai_lib::contatti_suggerisci_da;
use outlook_ai_lib::store::Store;
use tempfile::tempdir;

fn gruppo(nome: &str, membri: &[&str]) -> Gruppo {
    Gruppo { id: None, nome: nome.to_string(), membri: membri.iter().map(|s| s.to_string()).collect() }
}

#[test]
fn un_gruppo_si_salva_e_si_rilegge_con_i_membri_puliti() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let id = store
        .gruppo_salva(&gruppo("Ufficio tecnico", &["Luca@EsempioHost.it", " anna@esempiohost.it ", "luca@esempiohost.it", ""]))
        .unwrap();
    let g = store.gruppi().unwrap().into_iter().find(|g| g.id == Some(id)).unwrap();
    assert_eq!(g.nome, "Ufficio tecnico");
    assert_eq!(g.membri, vec!["luca@esempiohost.it", "anna@esempiohost.it"]);
}

#[test]
fn un_gruppo_senza_nome_non_si_salva() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let errore = store.gruppo_salva(&gruppo("  ", &["a@esempio.it"])).unwrap_err().to_string();
    assert!(errore.contains("nome"), "{errore}");
}

#[test]
fn due_gruppi_non_possono_avere_lo_stesso_nome() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.gruppo_salva(&gruppo("Ufficio tecnico", &["a@esempio.it"])).unwrap();
    let errore = store.gruppo_salva(&gruppo("ufficio TECNICO", &["b@esempio.it"])).unwrap_err().to_string();
    assert!(errore.contains("Ufficio tecnico") || errore.contains("ufficio TECNICO"), "{errore}");
}

#[test]
fn modificare_un_gruppo_cambia_nome_e_membri() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let id = store.gruppo_salva(&gruppo("Tecnici", &["a@esempio.it", "b@esempio.it"])).unwrap();
    let stesso = store
        .gruppo_salva(&Gruppo { id: Some(id), ..gruppo("Ufficio tecnico", &["c@esempio.it"]) })
        .unwrap();
    assert_eq!(stesso, id);
    let gruppi = store.gruppi().unwrap();
    assert_eq!(gruppi.len(), 1);
    assert_eq!(gruppi[0].nome, "Ufficio tecnico");
    assert_eq!(gruppi[0].membri, vec!["c@esempio.it"]);
}

#[test]
fn eliminare_un_gruppo_toglie_anche_i_membri() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let id = store.gruppo_salva(&gruppo("Tecnici", &["a@esempio.it"])).unwrap();
    assert_eq!(store.gruppo_elimina(id).unwrap(), 1);
    assert!(store.gruppi().unwrap().is_empty());
    // Un gruppo nuovo con lo stesso id non eredita membri vecchi.
    let nuovo = store.gruppo_salva(&gruppo("Altri", &[])).unwrap();
    assert!(store.gruppi().unwrap().into_iter().find(|g| g.id == Some(nuovo)).unwrap().membri.is_empty());
}

#[test]
fn i_gruppi_compaiono_in_cima_ai_suggerimenti_coi_membri() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let store = Store::open(&db).unwrap();
    store.gruppo_salva(&gruppo("Ufficio tecnico", &["luca@esempiohost.it", "anna@esempiohost.it"])).unwrap();
    store.gruppo_salva(&gruppo("Commerciale", &["marco@esempiohost.it"])).unwrap();
    drop(store);
    let s = contatti_suggerisci_da(&db, "uff", 10).unwrap();
    assert_eq!(s[0].origine, "gruppo");
    assert_eq!(s[0].nome, "Ufficio tecnico (2)");
    assert_eq!(s[0].membri, vec!["luca@esempiohost.it", "anna@esempiohost.it"]);
    assert!(s.iter().all(|x| x.nome != "Commerciale (1)"), "un gruppo che non corrisponde non compare");
}

#[test]
fn un_gruppo_vuoto_non_si_suggerisce() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    Store::open(&db).unwrap().gruppo_salva(&gruppo("Vuoto", &[])).unwrap();
    assert!(contatti_suggerisci_da(&db, "vuo", 10).unwrap().is_empty());
}
