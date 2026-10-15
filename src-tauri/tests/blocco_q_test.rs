//! Test del blocco Q: pannello «Contatti» (ordinamento della rubrica, formato
//! del nome visualizzato, numero di suggerimenti dei destinatari). Round-trip,
//! migrazione da un `config.json` vecchio, normalizzazione dei valori fuori
//! scala e rifiuto dei valori non ammessi.
//!
//! Nota: le tre preferenze vivono dentro `Preferenze`, quindi si salvano e si
//! leggono con i comandi già esistenti `impostazioni_salva`/`impostazioni_leggi`
//! — non serve un comando nuovo.

use outlook_ai_lib::config::{self, Preferenze};

#[test]
fn valori_di_default_del_blocco_q() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p, Preferenze::default());
    assert_eq!(p.rubrica_ordinamento, "nome");
    assert_eq!(p.rubrica_ordinamento, config::ORDINAMENTO_RUBRICA_DEFAULT);
    assert_eq!(p.rubrica_formato_nome, "nome_cognome");
    assert_eq!(p.rubrica_formato_nome, config::FORMATO_NOME_CONTATTO_DEFAULT);
    assert_eq!(p.contatti_suggerimenti_limite, config::CONTATTI_SUGGERIMENTI_DEFAULT);
    assert_eq!(p.contatti_suggerimenti_limite, 8);
}

#[test]
fn preferenze_blocco_q_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.rubrica_ordinamento = "cognome".to_string();
    p.rubrica_formato_nome = "azienda".to_string();
    p.contatti_suggerimenti_limite = 15;

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette, p, "le preferenze del blocco Q tornano identiche");
}

#[test]
fn config_vecchio_senza_blocco_q_produce_i_default() {
    // Un config.json scritto prima del blocco Q: la chiave `preferenze` non ha i
    // campi nuovi, che devono arrivare dai default senza perdere il resto.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "preferenze": { "providerIa": "cloud", "rubricaOrdinamento": "boh" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    let cfg = config::load_from(dir.path()).expect("il file vecchio resta valido");
    assert_eq!(cfg.theme, "dark");
    assert_eq!(cfg.preferenze.provider_ia, "cloud");
    let d = Preferenze::default();
    assert_eq!(cfg.preferenze.rubrica_ordinamento, d.rubrica_ordinamento, "valore inventato → default");
    assert_eq!(cfg.preferenze.rubrica_formato_nome, d.rubrica_formato_nome);
    assert_eq!(cfg.preferenze.contatti_suggerimenti_limite, d.contatti_suggerimenti_limite);
}

#[test]
fn valori_fuori_scala_del_blocco_q_vengono_normalizzati() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{
        "preferenze": {
            "rubricaOrdinamento": "fucsia",
            "rubricaFormatoNome": "arcobaleno",
            "contattiSuggerimentiLimite": 9001
        }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();

    let p = config::load_preferenze(dir.path());
    assert_eq!(p.rubrica_ordinamento, "nome", "campo ignoto → default");
    assert_eq!(p.rubrica_formato_nome, "nome_cognome", "formato ignoto → default");
    assert_eq!(p.contatti_suggerimenti_limite, config::CONTATTI_SUGGERIMENTI_DEFAULT, "limite enorme → default");

    let grezzo2 = r#"{ "preferenze": { "contattiSuggerimentiLimite": 1 } }"#;
    std::fs::write(dir.path().join("config.json"), grezzo2).unwrap();
    let p2 = config::load_preferenze(dir.path());
    assert_eq!(p2.contatti_suggerimenti_limite, config::CONTATTI_SUGGERIMENTI_DEFAULT, "limite minuscolo → default");
}

#[test]
fn salvataggio_rifiuta_valori_del_blocco_q_non_ammessi() {
    let dir = tempfile::tempdir().unwrap();

    let mut p = Preferenze::default();
    p.rubrica_ordinamento = "fucsia".to_string();
    assert!(config::save_preferenze(dir.path(), &p).is_err());

    let mut p2 = Preferenze::default();
    p2.rubrica_formato_nome = "arcobaleno".to_string();
    assert!(config::save_preferenze(dir.path(), &p2).is_err());

    let mut p3 = Preferenze::default();
    p3.contatti_suggerimenti_limite = 500;
    assert!(config::save_preferenze(dir.path(), &p3).is_err());

    let mut p4 = Preferenze::default();
    p4.contatti_suggerimenti_limite = 1;
    assert!(config::save_preferenze(dir.path(), &p4).is_err());

    assert!(
        !dir.path().join("config.json").exists(),
        "nessun file scritto su valori non ammessi"
    );
}
