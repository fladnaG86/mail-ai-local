//! Test del blocco P: pannelli «Aspetto» (colore accento) e «Accessibilità»
//! (movimento ridotto, contrasto elevato, dimensioni del testo, etichette dei
//! pulsanti). Round-trip, migrazione da un `config.json` vecchio,
//! normalizzazione dei valori fuori scala e rifiuto dei valori non ammessi.

use outlook_ai_lib::config::{self, Preferenze};

#[test]
fn valori_di_default_del_blocco_p() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p, Preferenze::default());
    assert_eq!(p.accento, config::ACCENTO_DEFAULT);
    assert_eq!(p.accento, "blu");
    assert!(!p.accessibilita_movimento_ridotto);
    assert!(!p.accessibilita_contrasto_elevato);
    assert_eq!(p.accessibilita_testo_scala, config::SCALA_TESTO_DEFAULT);
    assert_eq!(p.accessibilita_testo_scala, 100);
    assert!(p.accessibilita_etichette_pulsanti);
}

#[test]
fn preferenze_blocco_p_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.accento = "verde".to_string();
    p.accessibilita_movimento_ridotto = true;
    p.accessibilita_contrasto_elevato = true;
    p.accessibilita_testo_scala = 115;
    p.accessibilita_etichette_pulsanti = false;

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette, p, "le preferenze del blocco P tornano identiche");
}

#[test]
fn config_vecchio_senza_blocco_p_produce_i_default() {
    // Un config.json scritto prima del blocco P: la chiave `preferenze` non ha i
    // campi nuovi, che devono arrivare dai default senza perdere il resto.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "preferenze": { "providerIa": "cloud", "accento": "boh" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    let cfg = config::load_from(dir.path()).expect("il file vecchio resta valido");
    assert_eq!(cfg.theme, "dark");
    assert_eq!(cfg.preferenze.provider_ia, "cloud");
    let d = Preferenze::default();
    assert_eq!(cfg.preferenze.accento, d.accento, "accento inventato → default");
    assert_eq!(cfg.preferenze.accessibilita_movimento_ridotto, d.accessibilita_movimento_ridotto);
    assert_eq!(cfg.preferenze.accessibilita_contrasto_elevato, d.accessibilita_contrasto_elevato);
    assert_eq!(cfg.preferenze.accessibilita_testo_scala, d.accessibilita_testo_scala);
    assert_eq!(cfg.preferenze.accessibilita_etichette_pulsanti, d.accessibilita_etichette_pulsanti);
}

#[test]
fn valori_fuori_scala_del_blocco_p_vengono_normalizzati() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{
        "preferenze": {
            "accento": "fucsia",
            "accessibilitaTestoScala": 9001
        }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();

    let p = config::load_preferenze(dir.path());
    assert_eq!(p.accento, "blu", "tinta sconosciuta → blu");
    assert_eq!(p.accessibilita_testo_scala, config::SCALA_TESTO_MAX, "scala enorme → massimo");

    let grezzo2 = r#"{ "preferenze": { "accessibilitaTestoScala": 5 } }"#;
    std::fs::write(dir.path().join("config.json"), grezzo2).unwrap();
    let p2 = config::load_preferenze(dir.path());
    assert_eq!(p2.accessibilita_testo_scala, config::SCALA_TESTO_MIN, "scala minuscola → minimo");
}

#[test]
fn salvataggio_rifiuta_valori_del_blocco_p_non_ammessi() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.accento = "fucsia".to_string();
    assert!(config::save_preferenze(dir.path(), &p).is_err());

    let mut p2 = Preferenze::default();
    p2.accessibilita_testo_scala = 500;
    assert!(config::save_preferenze(dir.path(), &p2).is_err());
    assert!(
        !dir.path().join("config.json").exists(),
        "nessun file scritto su valori non ammessi"
    );
}
