//! Blocco I2 — invio programmato (`OLChunkSendLater`).
//!
//! La coda degli invii programmati è **locale**: vive in
//! `invii_programmati.json` nella cartella di configurazione e parte **mentre
//! l'app è aperta**, quando l'ora scelta è arrivata. Non c'è alcun invio lato
//! server: se l'app è chiusa all'ora scelta, il messaggio parte alla riapertura
//! (o resta in coda finché non lo si annulla). L'interfaccia lo dichiara.
//!
//! Tutta la logica è **pura** e prende «adesso» come parametro, così si collauda
//! con un orologio iniettato: niente dipende dall'ora reale.

use crate::send::AllegatoInviato;
use serde::{Deserialize, Serialize};

/// Un invio programmato: i campi della composizione più l'ora di partenza.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvioProgrammato {
    /// Identificativo stabile: serve ad annullarlo.
    pub id: String,
    /// Secondi dall'epoca Unix in cui inviare il messaggio.
    pub quando: i64,
    pub account_id: String,
    pub a: String,
    pub cc: String,
    pub ccn: String,
    pub oggetto: String,
    pub corpo_testo: String,
    pub corpo_html: String,
    pub allegati: Vec<AllegatoInviato>,
    pub conferma_lettura: bool,
    pub conferma_recapito: bool,
    /// Secondi dall'epoca in cui è stato programmato.
    pub creato: i64,
}

/// Vero se l'invio **non** è ancora dovuto: l'ora scelta è nel futuro.
pub fn in_attesa(inv: &InvioProgrammato, adesso: i64) -> bool {
    inv.quando > adesso
}

/// Gli invii dovuti (ora scelta raggiunta o superata), dal più vecchio. Un invio
/// programmato per «adesso» è dovuto: parte subito, non un istante dopo.
pub fn dovuti(coda: &[InvioProgrammato], adesso: i64) -> Vec<InvioProgrammato> {
    let mut out: Vec<InvioProgrammato> = coda
        .iter()
        .filter(|i| i.quando <= adesso)
        .cloned()
        .collect();
    out.sort_by(|a, b| a.quando.cmp(&b.quando).then(a.creato.cmp(&b.creato)));
    out
}

/// Gli invii ancora in attesa, dal più imminente.
pub fn in_coda(coda: &[InvioProgrammato], adesso: i64) -> Vec<InvioProgrammato> {
    let mut out: Vec<InvioProgrammato> = coda
        .iter()
        .filter(|i| in_attesa(i, adesso))
        .cloned()
        .collect();
    out.sort_by(|a, b| a.quando.cmp(&b.quando).then(a.creato.cmp(&b.creato)));
    out
}

/// Aggiunge un invio alla coda (senza duplicare lo stesso id) e la riordina per
/// ora di partenza.
pub fn aggiungi(coda: &mut Vec<InvioProgrammato>, inv: InvioProgrammato) {
    coda.retain(|i| i.id != inv.id);
    coda.push(inv);
    coda.sort_by(|a, b| a.quando.cmp(&b.quando).then(a.creato.cmp(&b.creato)));
}

/// Annulla l'invio con l'id indicato. Vero se qualcosa è stato tolto.
pub fn annulla(coda: &mut Vec<InvioProgrammato>, id: &str) -> bool {
    let prima = coda.len();
    coda.retain(|i| i.id != id);
    coda.len() != prima
}

/// Il momento del prossimo invio in attesa, se ce n'è uno.
pub fn prossimo(coda: &[InvioProgrammato], adesso: i64) -> Option<i64> {
    in_coda(coda, adesso).first().map(|i| i.quando)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inv(id: &str, quando: i64) -> InvioProgrammato {
        InvioProgrammato {
            id: id.to_string(),
            quando,
            account_id: "a".to_string(),
            a: "dest@example.it".to_string(),
            cc: String::new(),
            ccn: String::new(),
            oggetto: "Prova".to_string(),
            corpo_testo: "corpo".to_string(),
            corpo_html: String::new(),
            allegati: Vec::new(),
            conferma_lettura: false,
            conferma_recapito: false,
            creato: 0,
        }
    }

    #[test]
    fn non_parte_prima_dell_ora_scelta_e_parte_dopo() {
        let mut coda = vec![inv("1", 1_000)];
        assert!(in_attesa(&coda[0], 999), "non deve partire prima");
        assert!(dovuti(&coda, 999).is_empty());
        assert!(dovuti(&coda, 1_000).len() == 1, "parte all'ora scelta");
        assert!(dovuti(&coda, 1_001).len() == 1, "parte anche dopo");
        // Un invio già dovuto non è più «in attesa».
        assert!(!in_attesa(&coda[0], 1_001));
        annulla(&mut coda, "1");
        assert!(coda.is_empty());
    }

    #[test]
    fn gli_invii_dovuti_escono_dal_piu_vecchio() {
        let coda = vec![inv("a", 500), inv("b", 100), inv("c", 900)];
        let d = dovuti(&coda, 600);
        assert_eq!(
            d.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            vec!["b", "a"]
        );
    }

    #[test]
    fn annullare_un_invio_inesistente_non_cambia_nulla() {
        let mut coda = vec![inv("x", 10)];
        assert!(!annulla(&mut coda, "y"));
        assert_eq!(coda.len(), 1);
    }

    #[test]
    fn aggiungere_lo_stesso_id_non_duplica() {
        let mut coda = Vec::new();
        aggiungi(&mut coda, inv("1", 100));
        aggiungi(&mut coda, inv("1", 200));
        assert_eq!(coda.len(), 1);
        assert_eq!(coda[0].quando, 200);
    }

    #[test]
    fn il_prossimo_e_il_piu_imminente_in_attesa() {
        let coda = vec![inv("a", 500), inv("b", 100), inv("c", 50)];
        // Con adesso=200: "b" (100) è già dovuto, "a" (500) è il prossimo.
        assert_eq!(prossimo(&coda, 200), Some(500));
        assert_eq!(in_coda(&coda, 200).len(), 1);
    }
}
