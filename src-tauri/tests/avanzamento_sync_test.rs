//! Avanzamento di «Invia e ricevi»: `mail_sync` emette un evento per ogni
//! cartella che sta per scaricare. Il pannello lo legge per la barra di stato,
//! quindi i nomi dei campi sono il contratto col frontend.

use outlook_ai_lib::{AvanzamentoSync, EVENTO_AVANZAMENTO_SYNC};

#[test]
fn l_evento_ha_il_nome_che_il_pannello_ascolta() {
    assert_eq!(EVENTO_AVANZAMENTO_SYNC, "sync-avanzamento");
}

#[test]
fn l_avanzamento_viaggia_coi_campi_in_camel_case() {
    let a = AvanzamentoSync {
        account: "mario.rossi@esempiogroup.it".into(),
        cartella: "INBOX".into(),
        indice: 2,
        totale: 7,
    };
    let json = serde_json::to_value(&a).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "account": "mario.rossi@esempiogroup.it",
            "cartella": "INBOX",
            "indice": 2,
            "totale": 7,
        })
    );
}
