//! Blocco V — aperture dall'esterno.
//!
//! macOS consegna all'app i link `mailto:` (schema dichiarato in `Info.plist`)
//! con `RunEvent::Opened`, e lo fa anche all'avvio a freddo, **prima** che
//! l'interfaccia abbia collegato i suoi ascoltatori. Per non perderli il kernel
//! li mette in una [`Coda`] e manda l'evento `aperture-esterne` come semplice
//! avviso: l'interfaccia ritira sempre dalla coda (comando `aperture_in_attesa`),
//! sia all'avvio sia a ogni avviso, così nessuna apertura va persa né si ripete.

use serde::Serialize;
use std::sync::Mutex;

/// Nome dell'evento di avviso verso l'interfaccia.
pub const EVENTO_APERTURE: &str = "aperture-esterne";

/// Un'apertura richiesta dall'esterno, nella forma che legge l'interfaccia.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum Apertura {
    /// Link `mailto:` intero: lo analizza l'interfaccia (`analizzaMailto`).
    Mailto { url: String },
}

/// Classifica un URL ricevuto dal sistema; `None` per ciò che l'app non apre.
pub fn classifica(url: &str) -> Option<Apertura> {
    let schema = url.split(':').next().unwrap_or("");
    if url.contains(':') && schema.eq_ignore_ascii_case("mailto") {
        return Some(Apertura::Mailto { url: url.to_string() });
    }
    None
}

/// Coda delle aperture in attesa che l'interfaccia le ritiri.
#[derive(Default)]
pub struct Coda(Mutex<Vec<Apertura>>);

impl Coda {
    /// Aggiunge un'apertura in fondo alla coda.
    pub fn metti(&self, apertura: Apertura) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(apertura);
    }

    /// Ritira tutte le aperture in attesa, nell'ordine d'arrivo.
    pub fn svuota(&self) -> Vec<Apertura> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}
