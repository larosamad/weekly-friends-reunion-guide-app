# My Angular Native app

An Angular app rendering real native views, created from `@ng-native/template`.

```sh
npm start          # Metro; scan the QR code with Expo Go, or press i / a for a simulator
npm run ios        # straight to the iOS simulator
npm run android    # straight to the Android emulator
npm test           # the example test in src/app/app.test.ts, in Node with no simulator
npm run typecheck
```

`src/app/app.ts` is the root component and `src/main.ts` mounts it. Expo Go is enough for development; a
release build or a native module Expo Go does not include needs a development build
(`npx expo run:ios`).

The app targets iOS and Android, so `npm run web`, which `create-expo-app` suggests as it finishes,
only says so and exits. Angular Native components can also render in a browser, set up as
https://ng-native.com/packages/web#beside-a-native-app describes.

`AGENTS.md` tells a coding agent how this framework differs from the web Angular it knows
(Claude Code reads it through `CLAUDE.md`). Add your own conventions to it as the app grows.

Docs: https://ng-native.com

# Controllo del bot Telegram

All’avvio puoi scegliere **Configura un nuovo bot** oppure **Gestisci un bot già
configurato**. La guida accompagna in sei passaggi: BotFather, aggiunta al gruppo,
recupero CHAT_ID, preparazione GitHub, personalizzazione e prova.

L’avanzamento e i dati non segreti (username, CHAT_ID, repository e branch) sono
salvati nella directory documenti dell’app con `expo-file-system`. Puoi tornare
alla home e riprendere la guida anche dopo il riavvio. I token e la risposta JSON
di Telegram non vengono salvati. Al passaggio 3 invia il comando indicato nel
gruppo, incolla il token di BotFather nell’app e premi **Cerca il mio gruppo**.
L’app contatta direttamente Telegram, controlla che il token appartenga al bot
scelto e mostra i nomi dei gruppi da selezionare. Non occorre aprire URL o leggere
JSON. Il token resta in memoria durante questo passaggio e viene eliminato quando
si passa al precedente/successivo o si esce dalla guida. Per un bot già collegato
a un altro servizio è disponibile **Ho già il codice del gruppo**: la ricerca
non modifica né rimuove i webhook esistenti.

La preparazione su Telegram e GitHub rimane manuale, con istruzioni e collegamenti
diretti dalla guida. Nel fork lascia attiva l’opzione **Copy the main branch only**.
Ogni utente usa il proprio bot, i propri Secrets e le Actions del proprio account.
Il workflow del bot salva `poll_info.json` per il sondaggio attivo e
`schedule_state.json` per ricordare l’ultimo invio settimanale. I nuovi stati sono
associati al repository e al gruppo Telegram; gli stati di altre copie vengono ignorati.

Il passaggio finale permette di avviare `telegram-poll.yml` in modalità `start`,
con una conferma esplicita: può creare un sondaggio reale nel gruppo. Per questa
funzione il token GitHub deve avere anche **Actions: Read and write**. L’app
segnala solo l’accettazione della richiesta; l’esito va controllato in GitHub
Actions e nel gruppo Telegram. Non verifica i Secrets né l’invio effettivo.

Fonti per i passaggi guidati:
[Telegram Bot tutorial](https://core.telegram.org/bots/tutorial),
[Telegram Bot API](https://core.telegram.org/bots/api#getupdates),
[GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

L’app Angular Native (iOS/Android) legge e modifica `bot_config.json` nel repository
del bot usando le API GitHub. Non serve un server aggiuntivo.

1. Pubblica nel repository `weekly-friends-reunion-telegram-poll-bot` le modifiche
   a `bot.py`, `config.py`, `scheduler.py`, `bot_config.json` e al workflow.
2. Crea un token GitHub fine-grained limitato a quel repository, con permesso
   **Contents: Read and write**. Il branch deve consentire i commit diretti.
3. Avvia l’app con `npm start`, aprila su Android/iOS con Expo e inserisci
   proprietario, repository, branch e token. Usa il branch eseguito dal workflow
   (attualmente `main`).
4. Premi **Carica configurazione**, modifica i valori e premi **Salva su GitHub**.
   Ogni salvataggio crea un commit su quel branch.

Sono modificabili opzioni e ordine, opzione esclusa, soglia minima dello spareggio,
domande e nome del gruppo. Sono ammesse da 2 a 12 opzioni univoche, lunghe al massimo
100 caratteri; le domande hanno un limite di 300 caratteri. L’opzione esclusa deve
corrispondere esattamente a una delle opzioni e la soglia deve essere un intero positivo.

Per riordinare le risposte, tieni premuta la maniglia **≡** e trascina la riga.
La pagina scorre automaticamente vicino ai bordi. Rilascia per confermare l’ordine,
poi premi **Salva su GitHub**. La risposta per chi non partecipa mantiene la sua
posizione automatica. Con un lettore di schermo sono disponibili le azioni
**Sposta prima** e **Sposta dopo**.

Il bot rilegge la configurazione a ogni avvio: le modifiche valgono anche per la
chiusura di un sondaggio già attivo, ma non riscrivono il messaggio Telegram già inviato.
Nella sezione **Quando parte il sondaggio** puoi scegliere giorno settimanale,
ora italiana e durate di primo sondaggio e spareggio. I valori sono salvati sotto
`SCHEDULE` in `bot_config.json`. I file precedenti usano domenica 11:07, durata
22 ore più 8 ore per l’eventuale spareggio. Le scadenze di un sondaggio già attivo
restano quelle assegnate all’invio. Il controllo avviene ogni 15 minuti e GitHub
può ritardarlo. La programmazione funziona con l’app chiusa.

Per attivare questa funzione serve anche il workflow aggiornato e `scheduler.py`
nel branch predefinito del bot: salvare solo il JSON non modifica le esecuzioni
di una versione precedente del workflow.

Il token GitHub è mascherato e mantenuto solo in memoria: va reinserito quando il
processo dell’app viene riavviato. `BOT_TOKEN` e `CHAT_ID` rimangono nei GitHub Secrets.
Le impostazioni sono visibili a chi può leggere il repository.

Se il file viene modificato da altri, il salvataggio fallisce senza sovrascriverlo.
Usa **Scarta modifiche e ricarica** per caricare la versione aggiornata e ripeti le
modifiche. Un errore di rete conserva la bozza per un nuovo tentativo.

Verifiche locali: `npm test` e `npm run typecheck`.

Documentazione API: https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
