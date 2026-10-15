//! Blocco I2 — conferme di lettura e recapito (`ChunkOutlookTracking`) lato
//! **arrivo**.
//!
//! Un messaggio che chiede una conferma porta le intestazioni standard:
//! `Disposition-Notification-To` (conferma di **lettura**, RFC 3798/8098) e/o
//! `Return-Receipt-To` (conferma di **recapito**, RFC 3798). Qui si riconosce la
//! richiesta e si compone la **risposta MDN**; la scelta dell'utente la registra
//! la cache (`store`). **Nessuna conferma parte da sé**: si invia solo al clic su
//! «Invia la conferma».
//!
//! Tutto è **puro** e collaudato senza rete.

/// Richiesta di conferma riconosciuta nelle intestazioni di un messaggio in arrivo.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RichiestaConferma {
    /// Il mittente chiede la conferma di lettura.
    pub lettura: bool,
    /// Il mittente chiede la conferma di recapito.
    pub recapito: bool,
    /// Indirizzo a cui inviare la conferma (dal campo `Disposition-Notification-To`
    /// o `Return-Receipt-To`), senza le parentesi angolari.
    pub indirizzo: Option<String>,
}

impl RichiestaConferma {
    /// Vero se una delle due conferme è richiesta.
    pub fn richiesta(&self) -> bool {
        self.lettura || self.recapito
    }
}

/// Estrae l'elenco `(nome, valore)` di intestazioni da un blocco di byte RFC 822.
/// Le intestazioni piegate (continuazione su riga che inizia con spazio) vengono
/// ricomposte. Si ferma alla prima riga vuota (inizio del corpo). Puro.
pub fn intestazioni_da_grezzo(raw: &[u8]) -> Vec<(String, String)> {
    let testo = String::from_utf8_lossy(raw);
    let mut out: Vec<(String, String)> = Vec::new();
    for riga in testo.split('\n') {
        let riga = riga.strip_suffix('\r').unwrap_or(riga);
        if riga.is_empty() {
            break;
        }
        if riga.starts_with(' ') || riga.starts_with('\t') {
            // Continuazione (folding) dell'ultima intestazione.
            if let Some(ultima) = out.last_mut() {
                ultima.1.push(' ');
                ultima.1.push_str(riga.trim());
            }
            continue;
        }
        if let Some((nome, valore)) = riga.split_once(':') {
            out.push((nome.trim().to_string(), valore.trim().to_string()));
        }
    }
    out
}

/// Riconosce la richiesta di conferma dalle intestazioni di un messaggio.
///
/// - `Disposition-Notification-To` presente e con un indirizzo utile → conferma
///   di **lettura** (RFC 3798/8098);
/// - `Return-Receipt-To` presente e con un indirizzo utile → conferma di
///   **recapito** (RFC 3798).
///
/// Un valore vuoto o `none` (convenzione RFC 8098) non è una richiesta.
pub fn riconosci_richiesta(intestazioni: &[(String, String)]) -> RichiestaConferma {
    let mut r = RichiestaConferma::default();
    for (nome, valore) in intestazioni {
        let n = nome.to_ascii_lowercase();
        let v = valore.trim();
        if v.is_empty() || v.eq_ignore_ascii_case("none") {
            continue;
        }
        if n == "disposition-notification-to" {
            r.lettura = true;
            if r.indirizzo.is_none() {
                r.indirizzo = pulisci_indirizzo(v);
            }
        } else if n == "return-receipt-to" {
            r.recapito = true;
            if r.indirizzo.is_none() {
                r.indirizzo = pulisci_indirizzo(v);
            }
        }
    }
    r
}

/// Toglie le parentesi angolari e le virgolette da un indirizzo; `None` se vuoto.
pub fn pulisci_indirizzo(v: &str) -> Option<String> {
    let pulito = v
        .trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .trim()
        .trim_matches('"')
        .trim()
        .to_string();
    if pulito.is_empty() {
        None
    } else {
        Some(pulito)
    }
}

/// La risposta MDN composta: destinatario, oggetto e le sue parti.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mdn {
    /// Destinatario della conferma (chi l'ha chiesta).
    pub a: String,
    /// Oggetto: quello originale, come prevede la prassi MDN.
    pub oggetto: String,
    /// Intestazioni aggiuntive (incluso il tipo di contenuto della conferma).
    pub intestazioni: Vec<(String, String)>,
    /// Corpo: i campi `message/disposition-notification` (RFC 8098).
    pub corpo: String,
}

/// Compone la risposta MDN per la richiesta indicata. `None` se non c'è un
/// indirizzo a cui rispondere (non si inventa un destinatario).
pub fn componi_mdn(
    richiesta: &RichiestaConferma,
    oggetto_originale: &str,
    mittente: &str,
) -> Option<Mdn> {
    if !richiesta.richiesta() {
        return None;
    }
    let a = richiesta.indirizzo.clone()?;
    // RFC 8098: `Disposition` dice come è stata gestita la richiesta. Nel nostro
    // caso è azione manuale dell'utente (`MDN-sent-manually`).
    let disposizione = "manual-action/MDN-sent-manually; displayed";
    let corpo = format!(
        "Reporting-UA: Outlook AI\n\
         Final-Recipient: rfc822; {a}\n\
         Original-Recipient: rfc822; {a}\n\
         Disposition: {disposizione}\n"
    );
    let intestazioni = vec![
        ("Auto-Submitted".to_string(), "auto-replied".to_string()),
        ("From".to_string(), mittente.to_string()),
        (
            "Content-Type".to_string(),
            "message/disposition-notification".to_string(),
        ),
    ];
    Some(Mdn {
        a,
        oggetto: oggetto_originale.to_string(),
        intestazioni,
        corpo,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn riconosce_la_conferma_di_lettura() {
        let h = vec![(
            "Disposition-Notification-To".to_string(),
            "<luca@esempiogroup.it>".to_string(),
        )];
        let r = riconosci_richiesta(&h);
        assert!(r.lettura);
        assert!(!r.recapito);
        assert_eq!(r.indirizzo.as_deref(), Some("luca@esempiogroup.it"));
    }

    #[test]
    fn riconosce_la_conferma_di_recapito() {
        let h = vec![(
            "Return-Receipt-To".to_string(),
            "<luca@esempiogroup.it>".to_string(),
        )];
        let r = riconosci_richiesta(&h);
        assert!(r.recapito);
        assert!(!r.lettura);
    }

    #[test]
    fn un_messaggio_senza_intestazioni_non_chiede_nulla() {
        let h = vec![("Subject".to_string(), "Ciao".to_string())];
        assert!(!riconosci_richiesta(&h).richiesta());
    }

    #[test]
    fn un_valore_none_non_e_una_richiesta() {
        let h = vec![(
            "Disposition-Notification-To".to_string(),
            "none".to_string(),
        )];
        assert!(!riconosci_richiesta(&h).richiesta());
    }

    #[test]
    fn le_intestazioni_piegate_vengono_ricomposte() {
        let raw = b"Subject: Prova\r\nDisposition-Notification-To:\r\n <a@b.it>\r\n\r\ncorpo";
        let h = intestazioni_da_grezzo(raw);
        let r = riconosci_richiesta(&h);
        assert!(r.lettura);
        assert_eq!(r.indirizzo.as_deref(), Some("a@b.it"));
    }

    #[test]
    fn la_mdn_ha_le_intestazioni_standard_e_il_destinatario_giusto() {
        let h = vec![
            (
                "Disposition-Notification-To".to_string(),
                "<luca@esempiogroup.it>".to_string(),
            ),
            (
                "Return-Receipt-To".to_string(),
                "<luca@esempiogroup.it>".to_string(),
            ),
        ];
        let r = riconosci_richiesta(&h);
        let mdn = componi_mdn(&r, "Piano Q4", "mario@esempiogroup.it").unwrap();
        assert_eq!(mdn.a, "luca@esempiogroup.it");
        assert!(mdn.intestazioni.iter().any(|(n, _)| n == "Auto-Submitted"));
        assert!(mdn
            .intestazioni
            .iter()
            .any(|(n, v)| n == "Content-Type" && v.contains("disposition-notification")));
        assert!(mdn
            .corpo
            .contains("Disposition: manual-action/MDN-sent-manually"));
    }
}
