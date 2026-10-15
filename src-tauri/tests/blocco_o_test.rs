//! Test del blocco O: categorie definite dall'utente (nome + colore).
//! Round-trip, migrazione da un `config.json` vecchio, normalizzazione
//! (id generato, nome vuoto scartato, colore ignoto → default, duplicati
//! rimossi) e rifiuto dei valori non ammessi in scrittura.
//!
//! Nota: le categorie vivono dentro `Preferenze`, quindi si salvano e si
//! leggono con i comandi già esistenti `impostazioni_salva`/`impostazioni_leggi`
//! — non serve un comando nuovo.

use outlook_ai_lib::config::{self, Categoria, Preferenze};

#[test]
fn valori_di_default_del_blocco_o() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p, Preferenze::default());
    assert_eq!(p.categorie, config::categorie_predefinite());
    assert_eq!(
        p.categorie.iter().map(|c| c.nome.as_str()).collect::<Vec<_>>(),
        vec!["Rosso", "Blu", "Verde", "Arancione", "Viola", "Giallo"],
        "le predefinite sono quelle di Outlook, nell'ordine del riferimento"
    );
    assert_eq!(config::COLORE_CATEGORIA_DEFAULT, "blu");
}

#[test]
fn preferenze_blocco_o_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.categorie = vec![
        Categoria { id: "lavoro".into(), nome: "Lavoro".into(), colore: "rosso".into() },
        Categoria { id: "casa".into(), nome: "Casa".into(), colore: "verde".into() },
    ];
    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette.categorie, p.categorie, "le categorie tornano identiche");
    assert_eq!(lette, p, "e con loro tutto il resto delle preferenze");
}

#[test]
fn config_vecchio_senza_blocco_o_produce_i_default() {
    // Un config.json scritto prima del blocco O: la chiave `preferenze` non ha
    // `categorie`, che devono arrivare dai default senza perdere il resto.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "preferenze": { "providerIa": "cloud", "cartellaIniziale": "Archivio" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    let cfg = config::load_from(dir.path()).expect("il file vecchio resta valido");
    assert_eq!(cfg.theme, "dark");
    assert_eq!(cfg.preferenze.provider_ia, "cloud");
    assert_eq!(cfg.preferenze.cartella_iniziale, "Archivio");
    assert_eq!(cfg.preferenze.categorie, config::categorie_predefinite());
}

#[test]
fn normalizzazione_categorie() {
    let fuori = config::normalizza_categorie(&[
        // id assente → generato; colore valido
        Categoria { id: String::new(), nome: "Lavoro".into(), colore: "rosso".into() },
        // nome vuoto → scartata
        Categoria { id: "x".into(), nome: "   ".into(), colore: "blu".into() },
        // colore sconosciuto → default
        Categoria { id: "ufficio".into(), nome: "Ufficio".into(), colore: "fucsia".into() },
        // duplicato per nome (senza badare alle maiuscole) → scartata
        Categoria { id: "b".into(), nome: " lavoro ".into(), colore: "verde".into() },
    ]);
    assert_eq!(fuori.len(), 2, "il nome vuoto e il duplicato sono scartati");
    assert_eq!(fuori[0].id, "categoria1", "id assente → generato");
    assert_eq!(fuori[0].nome, "Lavoro");
    assert_eq!(fuori[0].colore, "rosso");
    assert_eq!(fuori[1].id, "ufficio");
    assert_eq!(fuori[1].colore, config::COLORE_CATEGORIA_DEFAULT);
}

#[test]
fn colore_sconosciuto_viene_corretto_al_caricamento() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{
        "preferenze": {
            "categorie": [
                { "id": "a", "nome": "Lavoro", "colore": "fucsia" },
                { "id": "b", "nome": "Casa", "colore": "verde" }
            ]
        }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p.categorie[0].colore, config::COLORE_CATEGORIA_DEFAULT);
    assert_eq!(p.categorie[1].colore, "verde");
}

#[test]
fn salvataggio_rifiuta_categorie_non_ammesse() {
    let dir = tempfile::tempdir().unwrap();

    // Colore fuori tavolozza.
    let mut p = Preferenze::default();
    p.categorie = vec![Categoria { id: "a".into(), nome: "Lavoro".into(), colore: "fucsia".into() }];
    assert!(config::save_preferenze(dir.path(), &p).is_err());

    // Id duplicato.
    let mut p2 = Preferenze::default();
    p2.categorie = vec![
        Categoria { id: "a".into(), nome: "Lavoro".into(), colore: "rosso".into() },
        Categoria { id: "a".into(), nome: "Casa".into(), colore: "blu".into() },
    ];
    assert!(config::save_preferenze(dir.path(), &p2).is_err());

    // Id vuoto.
    let mut p3 = Preferenze::default();
    p3.categorie = vec![Categoria { id: String::new(), nome: "Lavoro".into(), colore: "rosso".into() }];
    assert!(config::save_preferenze(dir.path(), &p3).is_err());

    assert!(!dir.path().join("config.json").exists(), "nessun file scritto su valori non ammessi");
}
