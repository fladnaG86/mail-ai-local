//! Test della diagnostica della connessione (blocco M).
//!
//! Nessun test apre una connessione di rete: la sequenza dei passi si collauda
//! con una **sorgente finta**, così ciò che si verifica è la logica che
//! l'utente vede — l'ordine, l'arresto al primo errore, il testo del server, il
//! riepilogo e l'assenza della password. La password usata qui è finta e non
//! esce mai dal file di test.

use async_trait::async_trait;
use std::sync::Mutex;

use outlook_ai_lib::mail::diagnostica::{
    esegui_diagnostica, occulta, PassiDiagnostica, Passo, PASSI_INVIO, PASSI_RICEZIONE,
};

/// Password **finta** del test: serve solo a dimostrare che non compare nell'esito.
const PASSWORD_FINTA: &str = "segreta-di-prova";

/// Sorgente finta: risponde `Ok` con un testo prefissato, tranne sui passi
/// elencati in `errori`, dove restituisce il testo del server. Registra i passi
/// eseguiti, così si può provare che la sequenza **si ferma**.
struct Finta {
    errori: Vec<(Passo, String)>,
    eseguiti: Mutex<Vec<String>>,
    segreti: Vec<String>,
    testo_ok: String,
}

impl Finta {
    /// Finta che accetta tutto.
    fn che_accetta() -> Self {
        Finta {
            errori: Vec::new(),
            eseguiti: Mutex::new(Vec::new()),
            segreti: Vec::new(),
            testo_ok: "risposta del server finta".to_string(),
        }
    }

    /// Finta che fallisce al passo indicato con il testo indicato.
    fn che_fallisce(passo: Passo, testo: &str) -> Self {
        Finta {
            errori: vec![(passo, testo.to_string())],
            eseguiti: Mutex::new(Vec::new()),
            segreti: Vec::new(),
            testo_ok: "risposta del server finta".to_string(),
        }
    }

    fn eseguiti(&self) -> Vec<String> {
        self.eseguiti.lock().expect("mutex dei passi").clone()
    }
}

#[async_trait]
impl PassiDiagnostica for Finta {
    async fn esegui(&self, passo: Passo) -> Result<String, String> {
        self.eseguiti
            .lock()
            .expect("mutex dei passi")
            .push(passo.nome().to_string());
        match self.errori.iter().find(|(p, _)| *p == passo) {
            Some((_, testo)) => Err(testo.clone()),
            None => Ok(self.testo_ok.clone()),
        }
    }

    fn segreti_da_occultare(&self) -> Vec<String> {
        self.segreti.clone()
    }
}

#[tokio::test]
async fn con_la_sorgente_finta_che_accetta_tutti_i_passi_sono_ok() {
    let finta = Finta::che_accetta();
    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;

    assert!(!esito.interrotto, "nessun passo deve fallire");
    assert_eq!(esito.passi.len(), 6, "tutti i passi della ricezione");
    assert!(
        esito.passi.iter().all(|p| p.esito == "ok"),
        "ogni passo deve avere esito ok: {:?}",
        esito.passi
    );
    assert_eq!(
        finta.eseguiti(),
        vec![
            "nome server",
            "connessione",
            "certificato",
            "saluto del server",
            "accesso",
            "cartelle"
        ],
        "l'ordine dei passi"
    );
    assert!(
        esito.riepilogo.contains("Tutti i passi"),
        "riepilogo: {}",
        esito.riepilogo
    );
    assert_eq!(esito.protocollo, "IMAP");
}

#[tokio::test]
async fn un_login_rifiutato_e_errore_al_passo_accesso_col_testo_del_server() {
    let testo_server = "NO [AUTHENTICATIONFAILED] Authentication failed.";
    let finta = Finta::che_fallisce(Passo::Accesso, testo_server);
    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;

    assert!(esito.interrotto, "la sequenza si deve fermare");
    let ultimo = esito.passi.last().expect("almeno un passo");
    assert_eq!(ultimo.passo, "accesso");
    assert_eq!(ultimo.esito, "errore");
    assert!(
        ultimo.dettaglio.contains("AUTHENTICATIONFAILED"),
        "il testo esatto del server: {}",
        ultimo.dettaglio
    );
    assert_eq!(esito.passi.len(), 5, "5 passi provati, il sesto no");
    assert!(
        !finta.eseguiti().contains(&"cartelle".to_string()),
        "dopo l'errore non si prosegue: {:?}",
        finta.eseguiti()
    );
}

#[tokio::test]
async fn un_nome_che_non_risolve_si_ferma_al_primo_passo() {
    let finta = Finta::che_fallisce(
        Passo::NomeServer,
        "non è stato possibile risolvere il nome «imaps.inesistente.invalid»",
    );
    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;

    assert!(esito.interrotto);
    assert_eq!(esito.passi.len(), 1, "un solo passo provato");
    assert_eq!(esito.passi[0].passo, "nome server");
    assert_eq!(esito.passi[0].esito, "errore");
    assert_eq!(finta.eseguiti(), vec!["nome server"]);
}

#[tokio::test]
async fn il_riepilogo_nomina_il_passo_e_la_causa() {
    let testo_server = "NO [AUTHENTICATIONFAILED] Authentication failed.";
    let finta = Finta::che_fallisce(Passo::Accesso, testo_server);
    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;

    assert!(
        esito.riepilogo.contains("passo 5"),
        "riepilogo: {}",
        esito.riepilogo
    );
    assert!(
        esito.riepilogo.contains("accesso"),
        "riepilogo: {}",
        esito.riepilogo
    );
    assert!(
        esito.riepilogo.contains("AUTHENTICATIONFAILED"),
        "riepilogo: {}",
        esito.riepilogo
    );
}

#[tokio::test]
async fn il_testo_prodotto_non_contiene_la_password() {
    // La finta mette la password dentro il dettaglio: la rete di sicurezza deve
    // nasconderla comunque, in ogni passo e nel testo che l'utente copia.
    let mut finta = Finta::che_accetta();
    finta.testo_ok = format!("il server ha risposto: LOGIN ok per {PASSWORD_FINTA} ({PASSWORD_FINTA})");
    finta.segreti = vec![PASSWORD_FINTA.to_string()];

    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;
    let testo = serde_json::to_string(&esito).expect("l'esito deve essere serializzabile");

    assert!(
        !testo.contains(PASSWORD_FINTA),
        "la password non deve comparire nel testo prodotto: {testo}"
    );
    for passo in &esito.passi {
        assert!(
            !passo.dettaglio.contains(PASSWORD_FINTA),
            "la password non deve comparire in un dettaglio: {}",
            passo.dettaglio
        );
    }
    assert!(
        testo.contains("••••••"),
        "il segnaposto deve essere visibile: {testo}"
    );
}

#[tokio::test]
async fn l_invio_usa_gli_stessi_passi_senza_cartelle() {
    let finta = Finta::che_fallisce(Passo::Accesso, "535 5.7.8 Authentication credentials invalid");
    let esito = esegui_diagnostica(&finta, &PASSI_INVIO, "SMTP").await;

    assert_eq!(esito.protocollo, "SMTP");
    assert!(esito.interrotto);
    assert_eq!(
        esito.passi.iter().map(|p| p.passo.as_str()).collect::<Vec<_>>(),
        vec![
            "nome server",
            "connessione",
            "certificato",
            "saluto del server",
            "accesso"
        ]
    );
    assert!(
        esito.passi.last().expect("l'ultimo").dettaglio.contains("535"),
        "il testo del server: {}",
        esito.passi.last().expect("l'ultimo").dettaglio
    );
}

#[tokio::test]
async fn un_errore_al_certificato_nomina_il_passo() {
    let finta = Finta::che_fallisce(
        Passo::Certificato,
        "handshake TLS con imaps.esempiohost.it non riuscito: certificate has expired",
    );
    let esito = esegui_diagnostica(&finta, &PASSI_RICEZIONE, "IMAP").await;

    assert_eq!(esito.passi.len(), 3);
    let ultimo = esito.passi.last().expect("l'ultimo");
    assert_eq!(ultimo.passo, "certificato");
    assert!(ultimo.dettaglio.contains("certificate has expired"));
    assert!(
        esito.riepilogo.contains("passo 3") && esito.riepilogo.contains("certificato"),
        "riepilogo: {}",
        esito.riepilogo
    );
}

#[test]
fn occulta_non_tocca_i_testi_senza_segreti() {
    assert_eq!(occulta("a2 OK LOGIN completed", &[]), "a2 OK LOGIN completed");
    // Un segreto molto corto non viene sostituito (distruggerebbe il messaggio).
    assert_eq!(occulta("a2 NO", &["a".to_string()]), "a2 NO");
}
