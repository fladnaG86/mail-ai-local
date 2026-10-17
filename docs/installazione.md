# Installazione e distribuzione

## Per chi riceve l'app

1. Apri la pagina [Releases](https://github.com/fladnaG86/mail-ai-local/releases) e scarica il file `Outlook.AI_<versione>_universal.dmg`. Va bene sia per i Mac Apple Silicon sia per gli Intel (provata su macOS recente, Apple Silicon).
2. Apri il `.dmg` e trascina **Outlook AI** nella cartella **Applicazioni**.
3. **Primo avvio.** Finché l'app non è firmata con un certificato Apple Developer, macOS dice che non può verificare lo sviluppatore e non la apre. Una volta sola:
   - prova ad aprirla, e chiudi l'avviso;
   - vai in **Impostazioni di Sistema → Privacy e sicurezza**, scorri fino a «Outlook AI è stata bloccata» e premi **Apri comunque**;
   - conferma con la password del Mac.

   Da lì in poi si apre normalmente.
4. **Configura la casella** nella finestra che si apre da sola: indirizzo, server di posta in arrivo e in uscita, password. La password va nel Portachiavi di macOS, mai in un file.
5. **Portachiavi.** Alla prima sincronizzazione macOS chiede il permesso di leggere la password dal Portachiavi: inserisci la password del Mac e premi **Consenti sempre** (non «Consenti», che vale una volta sola). Con un'app firmata ad-hoc il permesso va ridato **una volta dopo ogni aggiornamento** dell'app; con la firma Developer ID resta valido anche fra gli aggiornamenti.

## Per chi pubblica una versione

La Release la costruisce GitHub Actions (`.github/workflows/release.yml`): test dell'interfaccia e del kernel, poi un `.dmg` universale in una Release **in bozza**.

1. Alza la versione negli stessi tre posti: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`.
2. Fai commit e crea il tag con la stessa versione:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

   In alternativa: GitHub → **Actions → Release → Run workflow** (usa la versione di `tauri.conf.json`).
3. A build finita, in **Releases** c'è la bozza col `.dmg`: controllala e premi **Publish release**.

### Firma e notarizzazione Apple (facoltative)

Senza segreti l'app è firmata ad-hoc. Per farla aprire senza avvisi serve un account Apple Developer (99 $/anno) e questi segreti in **Settings → Secrets and variables → Actions**:

| Segreto | Contenuto |
|---|---|
| `APPLE_CERTIFICATE` | il certificato «Developer ID Application» esportato in `.p12`, in base64 (`base64 -i certificato.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | la password scelta all'esportazione del `.p12` |
| `APPLE_SIGNING_IDENTITY` | il nome completo, es. `Developer ID Application: Nome Cognome (TEAMID)` |
| `APPLE_ID` | l'Apple ID dell'account sviluppatore (per la notarizzazione) |
| `APPLE_PASSWORD` | una password specifica per app, da appleid.apple.com |
| `APPLE_TEAM_ID` | l'identificativo del team, 10 caratteri |

Il workflow li usa solo se ci sono: senza, continua a produrre la versione ad-hoc.

## Build locale

```bash
npm run build:mac      # firma col certificato locale «Outlook AI Dev»
npm run tauri build    # firma ad-hoc, su qualsiasi Mac
```

`build:mac` usa un certificato di firma personale nel Portachiavi «login» di chi compila: la firma resta la stessa fra una compilazione e l'altra, quindi il «Consenti sempre» del Portachiavi non va ridato. Per crearne uno: **Accesso Portachiavi → Assistente Certificato → Crea un certificato…**, nome `Outlook AI Dev`, tipo «Firma del codice».
