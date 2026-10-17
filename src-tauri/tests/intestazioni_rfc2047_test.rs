//! Oggetti e nomi dei mittenti arrivano dall'ENVELOPE IMAP così come sono nel
//! messaggio, con le «encoded word» RFC 2047 (`=?utf-8?Q?...?=`) non decodificate:
//! la lista mostrava `=?utf-8?Q?Fwd=3A_La_tua_esperienza...?=`.

use outlook_ai_lib::mail::mime::decodifica_intestazione;

#[test]
fn due_encoded_word_q_adiacenti_si_uniscono_senza_spazio() {
    let grezzo = "=?utf-8?Q?Fwd=3A_La_tua_esperienza_di_Login_=C3=A8_cambiata_?= =?utf-8?Q?=F0=9F=93=B1?=";
    assert_eq!(decodifica_intestazione(grezzo), "Fwd: La tua esperienza di Login è cambiata 📱");
}

#[test]
fn encoded_word_b_in_utf8() {
    assert_eq!(decodifica_intestazione("=?UTF-8?B?Q2lhbyDDqCB0dXR0bw==?="), "Ciao è tutto");
}

#[test]
fn encoded_word_in_iso_8859_1() {
    assert_eq!(decodifica_intestazione("=?iso-8859-1?Q?Perch=E9_no?="), "Perché no");
}

#[test]
fn testo_misto_in_chiaro_e_codificato() {
    assert_eq!(decodifica_intestazione("Re: =?utf-8?Q?citt=C3=A0?= nuova"), "Re: città nuova");
}

#[test]
fn il_testo_in_chiaro_resta_identico() {
    for s in ["Piano manutenzione Q4", "Fwd: Hai condiviso alcuni dati", "Prezzo 50% = ok?", ""] {
        assert_eq!(decodifica_intestazione(s), s);
    }
}

#[test]
fn applicata_due_volte_non_cambia_nulla() {
    let una = decodifica_intestazione("=?utf-8?Q?Gr=C3=BC=C3=9Fe?=");
    assert_eq!(una, "Grüße");
    assert_eq!(decodifica_intestazione(&una), una);
}

#[test]
fn il_mittente_codificato_conserva_l_indirizzo() {
    assert_eq!(
        decodifica_intestazione("=?utf-8?Q?Nicol=C3=B2_Bianchi?= <nicolo@esempiohost.it>"),
        "Nicolò Bianchi <nicolo@esempiohost.it>"
    );
}
