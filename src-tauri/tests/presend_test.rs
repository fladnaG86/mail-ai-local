// Test del controllo prima dell'invio (task 7.2, Milestone 7), TDD.
//
// Coprono i controlli deterministici (senza modello), la regola "non blocca mai
// l'invio" e il controllo del tono opzionale con un trasporto finto (nessuna
// rete: stesso schema di `ai_client_test.rs`).
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use outlook_ai_lib::ai::client::{
    Client, ErroreAi, RichiestaHttp, RispostaHttp, Trasporto,
};
use outlook_ai_lib::presend::{self, Avviso, Gravita, Ingresso, Soglie, Tipo};

/// Ingresso minimo con oggetto presente e nessun allegato: i test partono da qui
/// e cambiano solo la parte che interessa.
fn ingresso(corpo: &str, destinatari: &str) -> Ingresso {
    Ingresso {
        a: destinatari.to_string(),
        cc: String::new(),
        oggetto: "Piano manutenzione Q4".to_string(),
        corpo: corpo.to_string(),
        numero_allegati: 0,
    }
}

fn ha(avvisi: &[Avviso], tipo: Tipo) -> bool {
    avvisi.iter().any(|a| a.tipo == tipo)
}

#[test]
fn allegato_citato_ma_assente_produce_avviso() {
    let w = presend::controlla(&ingresso("in allegato trovi il preventivo", "a@b.it"));
    assert!(ha(&w, Tipo::AllegatoMancante));
}

#[test]
fn allegato_citato_e_presente_non_produce_avviso() {
    let mut ing = ingresso("in allegato trovi il preventivo", "a@b.it");
    ing.numero_allegati = 1;
    let w = presend::controlla(&ing);
    assert!(!ha(&w, Tipo::AllegatoMancante));
}

#[test]
fn nessun_allegato_citato_nessun_avviso() {
    let w = presend::controlla(&ingresso("Buongiorno, confermo la riunione di domani.", "a@b.it"));
    assert!(
        w.is_empty(),
        "un testo normale non deve produrre avvisi, ottenuti: {w:?}"
    );
}

#[test]
fn riconosce_password_iban_carta_e_codice_fiscale() {
    let password = presend::controlla(&ingresso("la password è Esempio2026!", "a@b.it"));
    assert!(ha(&password, Tipo::DatoSensibile));

    let iban = presend::controlla(&ingresso("bonifico su IT60 X054 2811 1010 0000 0123 456", "a@b.it"));
    assert!(ha(&iban, Tipo::DatoSensibile), "IBAN IT non riconosciuto");

    let carta = presend::controlla(&ingresso("carta 4111 1111 1111 1111 scad. 05/28", "a@b.it"));
    assert!(ha(&carta, Tipo::DatoSensibile), "numero di carta non riconosciuto");

    let cf = presend::controlla(&ingresso("il codice fiscale è RSSMRA80A01H501U", "a@b.it"));
    assert!(ha(&cf, Tipo::DatoSensibile), "codice fiscale non riconosciuto");
}

#[test]
fn oggetto_vuoto_produce_avviso() {
    let mut ing = ingresso("Buongiorno, confermo la riunione di domani.", "a@b.it");
    ing.oggetto = String::new();
    let w = presend::controlla(&ing);
    assert!(ha(&w, Tipo::OggettoVuoto));
}

#[test]
fn molti_destinatari_producono_avviso() {
    // Undici indirizzi: oltre la soglia predefinita di 10.
    let undici = (1..=11)
        .map(|n| format!("persona{n}@esempiogroup.it"))
        .collect::<Vec<_>>()
        .join(", ");
    let w = presend::controlla(&ingresso("Buongiorno a tutti.", &undici));
    assert!(ha(&w, Tipo::TroppiDestinatari));

    // Esattamente alla soglia: nessun avviso.
    let dieci = (1..=10)
        .map(|n| format!("persona{n}@esempiogroup.it"))
        .collect::<Vec<_>>()
        .join(", ");
    let senza = presend::controlla(&ingresso("Buongiorno a tutti.", &dieci));
    assert!(!ha(&senza, Tipo::TroppiDestinatari));
}

#[test]
fn la_soglia_dei_destinatari_e_parametro() {
    let mut soglie = Soglie::default();
    soglie.max_destinatari = 2;
    let w = presend::controlla_con(&ingresso("ciao", "a@b.it, c@d.it, e@f.it"), &soglie);
    assert!(ha(&w, Tipo::TroppiDestinatari));
}

#[test]
fn testo_tutto_maiuscolo_produce_avviso_informativo() {
    let w = presend::controlla(&ingresso("RICORDA DI INVIARE IL PIANO DI MANUTENZIONE OGGI", "a@b.it"));
    assert!(ha(&w, Tipo::Maiuscole));
    let a = w.iter().find(|a| a.tipo == Tipo::Maiuscole).unwrap();
    assert_eq!(a.gravita, Gravita::Informativo);
}

/// REGOLA NON NEGOZIABILE: nessun avviso blocca l'invio. Il risultato non ha
/// alcun campo bloccante e `puo_inviare` è sempre vero, anche col messaggio
/// peggiore possibile.
#[test]
fn nessun_avviso_blocca_l_invio() {
    let mut ing = ingresso(
        "IN ALLEGATO trovi tutto. la password è Esempio2026! IBAN IT60X0542811101000000123456 \
         carta 4111 1111 1111 1111 cf RSSMRA80A01H501U SEMPRE MAIUSCOLO",
        &(1..=15)
            .map(|n| format!("p{n}@esempiogroup.it"))
            .collect::<Vec<_>>()
            .join(", "),
    );
    ing.oggetto = String::new();

    let avvisi = presend::controlla(&ing);
    assert!(avvisi.len() >= 3, "il messaggio peggiore deve produrre più avvisi");

    // Modello esplicito: l'invio è comunque possibile.
    assert!(
        presend::puo_inviare(&avvisi),
        "nessun elenco di avvisi può impedire l'invio"
    );

    // E la struttura serializzata ha SOLO i campi dell'avviso: nessun campo
    // "blocking"/"blocca" (o simile) che possa impedire l'invio.
    let valore = serde_json::to_value(&avvisi).unwrap();
    let array = valore.as_array().expect("elenco di avvisi");
    let ammessi = ["tipo", "gravita", "messaggio"];
    for voce in array {
        let chiavi: Vec<&str> = voce
            .as_object()
            .unwrap()
            .keys()
            .map(|k| k.as_str())
            .collect();
        assert_eq!(
            chiavi.len(),
            ammessi.len(),
            "l'avviso ha campi inattesi: {chiavi:?}"
        );
        for chiave in &chiavi {
            assert!(
                ammessi.contains(chiave),
                "campo inatteso nell'avviso: {chiave} (la struttura non deve avere campi bloccanti)"
            );
        }
    }
}

// --- controllo del tono (modello locale, opzionale) ---

/// Trasporto finto: registra le richieste e restituisce una risposta fissa.
#[derive(Clone)]
struct TrasportoFinto {
    richieste: Arc<Mutex<Vec<RichiestaHttp>>>,
    risposta: RispostaHttp,
}

impl TrasportoFinto {
    fn completamento(testo: &str) -> Self {
        let corpo = format!(
            r#"{{"choices":[{{"message":{{"content":{}}}}}]}}"#,
            serde_json::to_string(testo).unwrap()
        );
        TrasportoFinto {
            richieste: Arc::new(Mutex::new(Vec::new())),
            risposta: RispostaHttp {
                stato: 200,
                corpo,
            },
        }
    }

    fn richieste(&self) -> Vec<RichiestaHttp> {
        self.richieste.lock().unwrap().clone()
    }
}

#[async_trait]
impl Trasporto for TrasportoFinto {
    async fn invia(&self, richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi> {
        self.richieste.lock().unwrap().push(richiesta);
        Ok(self.risposta.clone())
    }
}

/// Con `con_tono = false` il modello NON viene chiamato: il trasporto finto non
/// registra alcuna richiesta.
#[tokio::test]
async fn con_tono_falso_il_modello_non_viene_chiamato() {
    let trasporto = TrasportoFinto::completamento("AVVISO: troppo brusco");
    let client = Client::new(trasporto.clone());
    let ing = ingresso("in allegato trovi il preventivo", "a@b.it");

    let avvisi = presend::esegui(&ing, false, &client).await;

    assert!(
        trasporto.richieste().is_empty(),
        "con con_tono=false non deve partire alcuna chiamata al modello"
    );
    // Il controllo deterministico ha comunque lavorato.
    assert!(ha(&avvisi, Tipo::AllegatoMancante));
    assert!(!ha(&avvisi, Tipo::Tono));
}

#[tokio::test]
async fn con_tono_vero_e_modello_acceso_l_avviso_di_tono_arriva() {
    let trasporto = TrasportoFinto::completamento("AVVISO: il tono è troppo brusco");
    let client = Client::new(trasporto.clone());

    let avvisi = presend::esegui(&ingresso("Fai subito quello che ti ho detto.", "a@b.it"), true, &client)
        .await;

    assert_eq!(trasporto.richieste().len(), 1, "con con_tono=true parte la chiamata");
    let tono = avvisi.iter().find(|a| a.tipo == Tipo::Tono).expect("avviso di tono");
    assert_eq!(tono.gravita, Gravita::Informativo);
    assert!(tono.messaggio.contains("brusco"));
}

#[tokio::test]
async fn con_tono_vero_e_risposta_ok_nessun_avviso_di_tono() {
    let trasporto = TrasportoFinto::completamento("OK");
    let client = Client::new(trasporto);

    let avvisi =
        presend::esegui(&ingresso("Buongiorno, confermo la riunione.", "a@b.it"), true, &client).await;

    assert!(!ha(&avvisi, Tipo::Tono));
}

#[tokio::test]
async fn modello_spento_non_produce_errore_nel_tono() {
    // Il trasporto restituisce uno stato fuori dal 2xx: il client dà errore, ma
    // il controllo del tono deve semplicemente non produrre avvisi.
    let mut trasporto = TrasportoFinto::completamento("non importa");
    trasporto.risposta = RispostaHttp {
        stato: 500,
        corpo: "errore".to_string(),
    };
    let client = Client::new(trasporto);

    let avvisi = presend::esegui(&ingresso("Buongiorno, confermo la riunione.", "a@b.it"), true, &client)
        .await;

    assert!(!ha(&avvisi, Tipo::Tono));
    // E l'invio resta possibile.
    assert!(presend::puo_inviare(&avvisi));
}
