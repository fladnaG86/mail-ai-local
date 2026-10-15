//! Contrassegno con scadenza (blocco I1): calcolo **puro** delle date proposte.
//!
//! Come nel riferimento, il contrassegno può portare una data: le voci del menu
//! «Contrassegna» sono `Più tardi oggi`, `Questa sera`, `Domani`,
//! `Prossima settimana`, `Rimuovi contrassegno`. A differenza del contrassegno
//! semplice (`\Flagged`, che è un flag del server), la data è **metadato locale**
//! e vive nella colonna `scadenza` della cache, in forma ISO senza offset
//! (`AAAA-MM-GGTHH:MM:SS`), perché è quella che l'interfaccia mostra e rilegge.
//!
//! Qui non c'è nessuna dipendenza dal fuso orario di sistema: `OraLocale` porta
//! i campi civili e tutte le funzioni sono deterministiche. Il comando IPC
//! costruisce l'ora locale dall'orologio e dall'offset che l'interfaccia gli
//! passa; i test costruiscono l'ora a mano. Così il calcolo a cavallo di
//! mezzanotte e di fine settimana si collauda senza orologio vero.

/// Data e ora locali, senza fuso: la stessa forma salvata in `scadenza`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OraLocale {
    pub anno: i32,
    pub mese: u32,
    pub giorno: u32,
    pub ore: u32,
    pub minuti: u32,
    pub secondi: u32,
}

impl OraLocale {
    /// Costruisce un'ora locale con i campi indicati (per i test e chi chiama).
    pub fn nuova(anno: i32, mese: u32, giorno: u32, ore: u32, minuti: u32, secondi: u32) -> Self {
        OraLocale {
            anno,
            mese,
            giorno,
            ore,
            minuti,
            secondi,
        }
    }

    /// L'ora locale corrispondente a un istante Unix, dato l'offset (secondi a
    /// est di UTC: per l'Italia in ora legale `7200`).
    pub fn da_unix(epoch: i64, offset_secondi: i64) -> Self {
        Self::da_secondi(epoch + offset_secondi)
    }

    fn secondi_del_giorno(&self) -> i64 {
        self.ore as i64 * 3600 + self.minuti as i64 * 60 + self.secondi as i64
    }

    /// Secondi nella stessa "numerazione" dei giorni civili (giorno 0 = 1970-01-01).
    /// Tratta i campi locali **come se** fossero UTC: è una numerazione interna,
    /// non un istante assoluto, e serve solo all'aritmetica dei giorni.
    fn a_secondi(&self) -> i64 {
        giorni_da_civile(self.anno, self.mese, self.giorno) * 86_400 + self.secondi_del_giorno()
    }

    fn da_secondi(secondi: i64) -> Self {
        let giorni = secondi.div_euclid(86_400);
        let resto = secondi.rem_euclid(86_400);
        let (anno, mese, giorno) = civile_da_giorni(giorni);
        OraLocale {
            anno,
            mese,
            giorno,
            ore: (resto / 3600) as u32,
            minuti: ((resto % 3600) / 60) as u32,
            secondi: (resto % 60) as u32,
        }
    }

    /// Giorno della settimana: `0` = domenica … `6` = sabato.
    pub fn giorno_settimana(&self) -> u32 {
        // 1970-01-01 era un giovedì (4 con domenica = 0).
        let g = giorni_da_civile(self.anno, self.mese, self.giorno);
        ((g + 4).rem_euclid(7)) as u32
    }

    /// Forma ISO senza offset: `AAAA-MM-GGTHH:MM:SS`.
    pub fn iso(&self) -> String {
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
            self.anno, self.mese, self.giorno, self.ore, self.minuti, self.secondi
        )
    }
}

/// Le voci del sottomenu «Contrassegna», con l'etichetta esatta del riferimento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoScadenza {
    PiuTardiOggi,
    QuestaSera,
    Domani,
    ProssimaSettimana,
}

/// Ore di scarto per «Più tardi oggi» (come il rinvio breve del riferimento).
pub const ORE_PIU_TARDI: i64 = 3;
/// Ora di «Questa sera» (18:00 locali).
pub const ORA_SERA: u32 = 18;
/// Ora di «Prossima settimana» (lunedì mattina).
pub const ORA_PROSSIMA_SETTIMANA: u32 = 9;

impl TipoScadenza {
    /// Riconosce la voce dall'identificatore usato dall'interfaccia.
    pub fn da_id(id: &str) -> Option<Self> {
        match id {
            "piu-tardi-oggi" => Some(TipoScadenza::PiuTardiOggi),
            "questa-sera" => Some(TipoScadenza::QuestaSera),
            "domani" => Some(TipoScadenza::Domani),
            "prossima-settimana" => Some(TipoScadenza::ProssimaSettimana),
            _ => None,
        }
    }

    /// Identificatore stabile della voce.
    pub fn id(&self) -> &'static str {
        match self {
            TipoScadenza::PiuTardiOggi => "piu-tardi-oggi",
            TipoScadenza::QuestaSera => "questa-sera",
            TipoScadenza::Domani => "domani",
            TipoScadenza::ProssimaSettimana => "prossima-settimana",
        }
    }

    /// Etichetta in italiano, come nel riferimento.
    pub fn etichetta(&self) -> &'static str {
        match self {
            TipoScadenza::PiuTardiOggi => "Più tardi oggi",
            TipoScadenza::QuestaSera => "Questa sera",
            TipoScadenza::Domani => "Domani",
            TipoScadenza::ProssimaSettimana => "Prossima settimana",
        }
    }
}

/// L'elenco delle voci del sottomenu, nell'ordine del riferimento, più la voce
/// che toglie il contrassegno.
pub fn voci_sottomenu() -> [(&'static str, &'static str); 5] {
    [
        (TipoScadenza::PiuTardiOggi.id(), TipoScadenza::PiuTardiOggi.etichetta()),
        (TipoScadenza::QuestaSera.id(), TipoScadenza::QuestaSera.etichetta()),
        (TipoScadenza::Domani.id(), TipoScadenza::Domani.etichetta()),
        (TipoScadenza::ProssimaSettimana.id(), TipoScadenza::ProssimaSettimana.etichetta()),
        ("rimuovi", "Rimuovi contrassegno"),
    ]
}

/// Calcola la data ISO proposta per una voce, dall'ora locale data.
///
/// Regole, dichiarate perché siano verificabili:
/// - **Più tardi oggi**: l'ora attuale più [`ORE_PIU_TARDI`] ore; se supera la
///   mezzanotte cade nel giorno dopo (è "più tardi" comunque).
/// - **Questa sera**: oggi alle 18:00; se sono già le 18:00 o più, domani alle
///   18:00. A cavallo di mezzanotte resta quindi sempre nel futuro.
/// - **Domani**: il giorno civile successivo, alla stessa ora.
/// - **Prossima settimana**: il lunedì successivo alle 09:00 (se oggi è lunedì,
///   il lunedì della settimana dopo). Sabato e domenica cadono sul lunedì
///   immediatamente successivo.
pub fn proponi(tipo: TipoScadenza, ora: OraLocale) -> String {
    match tipo {
        TipoScadenza::PiuTardiOggi => {
            OraLocale::da_secondi(ora.a_secondi() + ORE_PIU_TARDI * 3600).iso()
        }
        TipoScadenza::QuestaSera => {
            let oggi_sera = giorni_da_civile(ora.anno, ora.mese, ora.giorno) * 86_400
                + ORA_SERA as i64 * 3600;
            let base = ora.a_secondi();
            let quando = if base >= oggi_sera {
                oggi_sera + 86_400
            } else {
                oggi_sera
            };
            OraLocale::da_secondi(quando).iso()
        }
        TipoScadenza::Domani => OraLocale::da_secondi(ora.a_secondi() + 86_400).iso(),
        TipoScadenza::ProssimaSettimana => {
            // 0 = domenica … 6 = sabato: quanti giorni mancano al lunedì (1).
            let dow = ora.giorno_settimana();
            let mut giorni = (1 + 7 - dow as i64) % 7;
            if giorni == 0 {
                giorni = 7;
            }
            let lunedi =
                giorni_da_civile(ora.anno, ora.mese, ora.giorno) * 86_400 + giorni * 86_400;
            let quando = lunedi + ORA_PROSSIMA_SETTIMANA as i64 * 3600;
            OraLocale::da_secondi(quando).iso()
        }
    }
}

/// Giorni civili dall'epoca (algoritmo di Howard Hinnant, dominio prolettico).
fn giorni_da_civile(anno: i32, mese: u32, giorno: u32) -> i64 {
    let y = if mese <= 2 { anno - 1 } else { anno } as i64;
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = mese as i64;
    let d = giorno as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// L'inverso di [`giorni_da_civile`]: dalla numerazione dei giorni ai campi civili.
fn civile_da_giorni(giorni: i64) -> (i32, u32, u32) {
    let z = giorni + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let anno = if m <= 2 { y + 1 } else { y };
    (anno as i32, m as u32, d as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn i_cinque_identificatori_sono_quelli_del_riferimento() {
        assert_eq!(TipoScadenza::PiuTardiOggi.id(), "piu-tardi-oggi");
        assert_eq!(TipoScadenza::QuestaSera.id(), "questa-sera");
        assert_eq!(TipoScadenza::Domani.id(), "domani");
        assert_eq!(TipoScadenza::ProssimaSettimana.id(), "prossima-settimana");
        assert_eq!(TipoScadenza::da_id("domani"), Some(TipoScadenza::Domani));
        assert_eq!(TipoScadenza::da_id("boh"), None);
        assert_eq!(voci_sottomenu()[4].1, "Rimuovi contrassegno");
    }

    #[test]
    fn il_conteggio_dei_giorni_torna_su_se_stesso() {
        for (y, m, d) in [(1970, 1, 1), (2026, 10, 13), (2000, 2, 29), (1999, 12, 31)] {
            assert_eq!(civile_da_giorni(giorni_da_civile(y, m, d)), (y, m, d));
        }
        // 1970-01-01 era un giovedì → domenica = 0, giovedì = 4.
        assert_eq!(OraLocale::nuova(1970, 1, 1, 0, 0, 0).giorno_settimana(), 4);
    }

    #[test]
    fn piu_tardi_oggi_aggiunge_tre_ore_e_scavalca_la_mezzanotte() {
        let ora = OraLocale::nuova(2026, 10, 13, 9, 15, 0);
        assert_eq!(proponi(TipoScadenza::PiuTardiOggi, ora), "2026-10-13T12:15:00");

        // 23:30 → 02:30 del giorno dopo.
        let tardi = OraLocale::nuova(2026, 10, 13, 23, 30, 0);
        assert_eq!(proponi(TipoScadenza::PiuTardiOggi, tardi), "2026-10-14T02:30:00");
    }

    #[test]
    fn questa_sera_e_oggi_alle_18_o_domani_se_e_gia_sera() {
        let giorno = OraLocale::nuova(2026, 10, 13, 10, 0, 0);
        assert_eq!(proponi(TipoScadenza::QuestaSera, giorno), "2026-10-13T18:00:00");

        // Alle 18:00 esatte "questa sera" è già passata: si va a domani.
        let sera = OraLocale::nuova(2026, 10, 13, 18, 0, 0);
        assert_eq!(proponi(TipoScadenza::QuestaSera, sera), "2026-10-14T18:00:00");

        // A cavallo di mezzanotte resta nel futuro (domani sera).
        let notte = OraLocale::nuova(2026, 10, 13, 23, 59, 0);
        assert_eq!(proponi(TipoScadenza::QuestaSera, notte), "2026-10-14T18:00:00");
    }

    #[test]
    fn domani_e_il_giorno_dopo_alla_stessa_ora() {
        let ora = OraLocale::nuova(2026, 10, 13, 8, 5, 30);
        assert_eq!(proponi(TipoScadenza::Domani, ora), "2026-10-14T08:05:30");

        // Da fine mese a inizio mese.
        let fine = OraLocale::nuova(2026, 10, 31, 20, 0, 0);
        assert_eq!(proponi(TipoScadenza::Domani, fine), "2026-11-01T20:00:00");
    }

    #[test]
    fn prossima_settimana_e_il_lunedi_successivo_alle_nove() {
        // 13/10/2026 è un martedì → lunedì 19/10.
        let martedi = OraLocale::nuova(2026, 10, 13, 11, 0, 0);
        assert_eq!(martedi.giorno_settimana(), 2);
        assert_eq!(
            proponi(TipoScadenza::ProssimaSettimana, martedi),
            "2026-10-19T09:00:00"
        );

        // Da lunedì si va al lunedì dopo.
        let lunedi = OraLocale::nuova(2026, 10, 12, 15, 0, 0);
        assert_eq!(lunedi.giorno_settimana(), 1);
        assert_eq!(
            proponi(TipoScadenza::ProssimaSettimana, lunedi),
            "2026-10-19T09:00:00"
        );

        // Sabato e domenica cadono sul lunedì immediatamente successivo.
        let sabato = OraLocale::nuova(2026, 10, 17, 12, 0, 0);
        assert_eq!(sabato.giorno_settimana(), 6);
        assert_eq!(
            proponi(TipoScadenza::ProssimaSettimana, sabato),
            "2026-10-19T09:00:00"
        );
        let domenica = OraLocale::nuova(2026, 10, 18, 12, 0, 0);
        assert_eq!(domenica.giorno_settimana(), 0);
        assert_eq!(
            proponi(TipoScadenza::ProssimaSettimana, domenica),
            "2026-10-19T09:00:00"
        );
    }

    #[test]
    fn da_unix_tiene_conto_dell_offset() {
        // 2026-10-13T12:00:00Z con offset +2h (ora legale italiana) → 14:00 locali.
        let epoch = 1_760_000_000; // valore indicativo, si verifica la coerenza
        let con_offset = OraLocale::da_unix(epoch, 7200);
        let senza_offset = OraLocale::da_unix(epoch, 0);
        assert_eq!(con_offset.ore, (senza_offset.ore + 2) % 24);
    }
}
