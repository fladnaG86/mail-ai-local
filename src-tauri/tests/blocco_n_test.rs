//! Test del blocco N: visualizza (colore riga contrassegnata), cerca (ambito,
//! limite), sincronizzazione (intervallo, avvio) e archiviazione (stato della
//! cache locale). Round-trip, migrazione da un `config.json` vecchio e
//! normalizzazione dei valori fuori scala.

use outlook_ai_lib::config::{self, Preferenze};

#[test]
fn valori_di_default_del_blocco_n() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p, Preferenze::default());
    assert_eq!(p.visualizza_colore_contrassegnata, "giallo");
    assert_eq!(p.ricerca_ambito, "tutte");
    assert_eq!(p.ricerca_limite, config::RICERCA_LIMITE_DEFAULT);
    assert!(p.ricerca_mentre_si_digita);
    assert_eq!(p.sync_intervallo_minuti, 0);
    assert!(p.sync_all_avvio);
    assert_eq!(p.archiviazione_avviso_mb, 0);
}

#[test]
fn preferenze_blocco_n_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.visualizza_colore_contrassegnata = "nessuno".to_string();
    p.ricerca_ambito = "cartella".to_string();
    p.ricerca_limite = 200;
    p.ricerca_mentre_si_digita = false;
    p.sync_intervallo_minuti = 15;
    p.sync_all_avvio = true;
    p.archiviazione_avviso_mb = 512;

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette, p, "le preferenze del blocco N tornano identiche");
}

#[test]
fn config_vecchio_senza_blocco_n_produce_i_default() {
    // Un config.json scritto prima del blocco N: la chiave `preferenze` non ha
    // i campi nuovi, che devono arrivare dai default senza perdere il resto.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "preferenze": { "providerIa": "cloud", "ricercaAmbito": "boh" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    let cfg = config::load_from(dir.path()).expect("il file vecchio resta valido");
    assert_eq!(cfg.theme, "dark");
    assert_eq!(cfg.preferenze.provider_ia, "cloud");
    let d = Preferenze::default();
    assert_eq!(cfg.preferenze.visualizza_colore_contrassegnata, d.visualizza_colore_contrassegnata);
    assert_eq!(cfg.preferenze.ricerca_ambito, d.ricerca_ambito, "ambito inventato → default");
    assert_eq!(cfg.preferenze.ricerca_limite, d.ricerca_limite);
    assert_eq!(cfg.preferenze.sync_intervallo_minuti, d.sync_intervallo_minuti);
    assert_eq!(cfg.preferenze.archiviazione_avviso_mb, d.archiviazione_avviso_mb);
}

#[test]
fn valori_fuori_scala_del_blocco_n_vengono_normalizzati() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{
        "preferenze": {
            "visualizzaColoreContrassegnata": "fucsia",
            "ricercaAmbito": "ovunque",
            "ricercaLimite": 3,
            "syncIntervalloMinuti": 99999,
            "archiviazioneAvvisoMb": -10
        }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();

    let p = config::load_preferenze(dir.path());
    assert_eq!(p.visualizza_colore_contrassegnata, "giallo");
    assert_eq!(p.ricerca_ambito, "tutte");
    assert_eq!(p.ricerca_limite, config::RICERCA_LIMITE_DEFAULT, "limite fuori scala → default");
    assert_eq!(p.sync_intervallo_minuti, config::SYNC_INTERVALLO_MAX, "intervallo enorme → massimo");
    assert_eq!(p.archiviazione_avviso_mb, 0, "soglia negativa → 0");
}

#[test]
fn salvataggio_rifiuta_valori_del_blocco_n_non_ammessi() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.visualizza_colore_contrassegnata = "fucsia".to_string();
    assert!(config::save_preferenze(dir.path(), &p).is_err());

    let mut p2 = Preferenze::default();
    p2.ricerca_ambito = "ovunque".to_string();
    assert!(config::save_preferenze(dir.path(), &p2).is_err());

    let mut p3 = Preferenze::default();
    p3.ricerca_limite = 3;
    assert!(config::save_preferenze(dir.path(), &p3).is_err());

    let mut p4 = Preferenze::default();
    p4.sync_intervallo_minuti = 5000;
    assert!(config::save_preferenze(dir.path(), &p4).is_err());
    assert!(!dir.path().join("config.json").exists(), "nessun file scritto su valori non ammessi");
}

#[test]
fn lo_stato_dell_archiviazione_conta_i_messaggi_della_cache() {
    // Un database nuovo: nessun messaggio, dimensione del file non negativa.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("cache.db");
    let stato = outlook_ai_lib::archiviazione_stato_da(&path).unwrap();
    assert_eq!(stato.messaggi, 0);
    assert!(stato.byte >= 1, "il file del database esiste ed è non vuoto");
    assert_eq!(stato.percorso, path.to_string_lossy());
}
