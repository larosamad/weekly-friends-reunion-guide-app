import { Component, inject, input, output, signal } from '@angular/core';
import { Pressable, Text, TextInput, View } from '@ng-native/components';
import { DeepLinks, OS } from '@ng-native/device';
import { BotConfigRepository, type Connection } from './bot-config';
import { SetupProgress } from './setup-progress';
import { TelegramSetup } from './telegram-setup';

@Component({
  selector: 'setup-guide',
  imports: [Pressable, Text, TextInput, View],
  template: `
    <view class="card">
      <text class="eyebrow">PASSAGGIO {{ progress.state().step + 1 }} DI 6</text>
      <view class="progress">
        @for (title of titles; track $index) {
          <view [style]="{ flex: 1, height: 5, borderRadius: 3, backgroundColor: $index <= progress.state().step ? '#22684c' : '#dde5df' }" />
        }
      </view>
      <text class="title">{{ titles[progress.state().step] }}</text>
      @switch (progress.state().step) {
        @case (0) {
          <text>Apri BotFather su Telegram e invia questo comando:</text>
          <text [selectable]="true" class="command" [style]="commandStyle">/newbot</text>
          <text>Scegli un nome e uno username che termini con bot. BotFather ti consegnerà il token del tuo bot.</text>
          <text class="hint">Conserva il token: lo inserirai nei Secrets GitHub al passaggio 4. Non inviarlo nella chat del gruppo.</text>
          <pressable accessibilityRole="button" (press)="open('https://t.me/BotFather')"><text class="action">Apri BotFather</text></pressable>
          <text class="label">Username del bot (senza @)</text>
          <text-input accessibilityLabel="Username del bot" autoCapitalize="none" [autoCorrect]="false"
            [value]="progress.state().botUsername" (changeText)="progress.update({ botUsername: $event.trim().replace('@', '') })" />
        }
        @case (1) {
          <text>Aggiungi il bot al gruppo in cui vuoi organizzare gli incontri. Puoi usare il pulsante qui sotto oppure aprire il gruppo, scegliere Aggiungi membri e cercare lo username del bot.</text>
          <pressable accessibilityRole="button" (press)="open('https://t.me/' + progress.state().botUsername + '?startgroup=true')"><text class="action">Aggiungi il bot a un gruppo</text></pressable>
          <text>Nel gruppo invia un comando indirizzato al bot:</text>
          <text [selectable]="true" class="command" [style]="commandStyle">/start@{{ progress.state().botUsername }}</text>
          <text class="hint">Il bot esegue sondaggi programmati e potrebbe non rispondere al comando: va bene. Verifica che possa inviare messaggi e sondaggi nelle autorizzazioni del gruppo.</text>
        }
        @case (2) {
          <text>Scegli il gruppo in cui il bot invierà i sondaggi. Ti basta mandare un comando su Telegram e poi cercare il gruppo qui.</text>
          <view class="instruction">
            <text class="label">1. Manda questo comando nel tuo gruppo</text>
            <text class="hint">Apri Telegram, entra nel gruppo a cui hai aggiunto il bot e invia il testo qui sotto. Non inviarlo nella chat con BotFather o in privato al bot.</text>
            <text [selectable]="true" class="command" [style]="commandStyle">/start@{{ progress.state().botUsername }}</text>
            <text class="hint">Poi torna in questa app. Non serve che il bot risponda.</text>
          </view>
          <view class="instruction">
            <text class="label">2. Incolla il token di BotFather</text>
            <text class="hint">È il codice ricevuto quando hai creato @{{ progress.state().botUsername }}, non il token GitHub. Lo trovi nella conversazione con BotFather.</text>
            <text-input accessibilityLabel="Token Telegram di BotFather" placeholder="Incolla qui il token del bot"
              [secureTextEntry]="true" autoCapitalize="none" [autoCorrect]="false" [editable]="!searching()"
              [value]="telegramToken()" (changeText)="telegramToken.set($event)" />
            <text class="hint">Il token viene usato solo per contattare Telegram e non viene salvato sul dispositivo.</text>
          </view>
          <view class="instruction">
            <text class="label">3. Cerca e seleziona il tuo gruppo</text>
            <pressable class="button" accessibilityRole="button" [disabled]="searching() || !telegramToken().trim()" (press)="searchGroups()">
              <text class="buttonLabel">{{ searching() ? 'Ricerca in corso…' : 'Cerca il mio gruppo' }}</text>
            </pressable>
          </view>
          @if (searched() && !groups().length) {
            <view class="instruction">
              <text class="label">Il gruppo non compare ancora?</text>
              <text class="hint">Controlla che @{{ progress.state().botUsername }} sia tra i membri. Invia di nuovo il comando nel gruppo, torna qui e premi Cerca il mio gruppo.</text>
            </view>
          }
          @for (group of groups(); track group.id) {
            <pressable class="group" accessibilityRole="button" [accessibilityLabel]="'Seleziona ' + group.title"
              [accessibilityState]="{ selected: progress.state().chatId === group.id }"
              (press)="progress.update({ chatId: group.id })">
              <text class="label">{{ group.title }}</text>
              <text class="hint">{{ progress.state().chatId === group.id ? 'Selezionato' : 'Tocca per scegliere questo gruppo' }}</text>
            </pressable>
          }
          @if (canContinue()) {
            <text class="success">Gruppo collegato · codice {{ progress.state().chatId }}. Premi Continua per il prossimo passaggio.</text>
          }
          <pressable accessibilityRole="button" (press)="manualGroup.set(!manualGroup())"><text class="action">{{ manualGroup() ? 'Nascondi inserimento manuale' : 'Ho già il codice del gruppo' }}</text></pressable>
          @if (manualGroup()) {
            <text class="hint">Inserisci il CHAT_ID fornito dal servizio che gestisce il tuo bot. È un numero negativo, diverso dal nome o dal link del gruppo.</text>
            <text-input accessibilityLabel="CHAT_ID del gruppo" placeholder="Esempio: -1001234567890" [value]="progress.state().chatId"
              (changeText)="progress.update({ chatId: $event.trim() })" />
          }
        }
        @case (3) {
          <text>Crea una copia personale del repository del bot con Fork. I sondaggi saranno eseguiti da GitHub Actions nella tua copia.</text>
          <pressable accessibilityRole="button" (press)="open('https://github.com/larosamad/weekly-friends-reunion-telegram-poll-bot/fork')"><text class="action">Crea la tua copia su GitHub</text></pressable>
          <text class="hint">Nella pagina del fork lascia selezionato Copy the main branch only. La copia deve includere bot.py, config.py, bot_config.json, poll_state.py, state_store.py e i workflow. Lo stato viene creato automaticamente nel tuo branch bot-state, separato dal codice; uno stato copiato da un altro repository viene ignorato.</text>
          <text>Nel repository apri Settings → Secrets and variables → Actions → New repository secret e aggiungi:</text>
          <text selectable="true" class="code">BOT_TOKEN = il token di BotFather</text>
          <text selectable="true" class="code">CHAT_ID = {{ progress.state().chatId }}</text>
          <text>In Settings → Actions → General → Workflow permissions abilita Read and write permissions. Nella scheda Actions abilita i workflow della tua copia.</text>
          <text>Crea un token GitHub fine-grained limitato alla tua copia: Contents: Read and write per le impostazioni e Actions: Read and write per avviare la prova dall’app.</text>
          <pressable accessibilityRole="button" (press)="open('https://github.com/settings/personal-access-tokens/new')"><text class="action">Crea il token GitHub</text></pressable>
          <text class="hint">Il token GitHub sarà richiesto nella schermata successiva. Non serve inserirlo nel codice o nei Secrets del bot. Gli avvii programmati usano il branch predefinito. Le esecuzioni avvengono nel tuo account GitHub e usano la tua quota; non quella di chi ha creato il progetto.</text>
        }
        @case (4) {
          <text>Collega qui sotto la tua copia del repository. Carica le impostazioni, personalizzale e salvale su GitHub. Se i valori esistenti vanno bene, puoi continuare dopo averli caricati.</text>
          <text class="hint">Usa il branch predefinito della tua copia, normalmente main. Il token viene mantenuto solo in memoria.</text>
        }
        @case (5) {
          <text>Controlla il riepilogo, poi avvia la prima prova quando sei pronto.</text>
          <text class="label">Bot: @{{ progress.state().botUsername }}</text>
          <text class="label">Gruppo: {{ progress.state().chatId }}</text>
          <text class="label">Repository: {{ connection().owner }}/{{ connection().repo }}</text>
          <text class="label">Branch: {{ connection().branch }}</text>
          <text class="hint">La prova avvia il workflow in modalità start e può pubblicare un vero sondaggio nel gruppo. Se un sondaggio è già attivo, il workflow salta l’invio. Gli orari sono quelli definiti nel workflow.</text>
          @if (!connection().token) {
            <text class="hint">Per inviare la prova torna al passaggio 5 e reinserisci il token GitHub.</text>
          }
          @if (!confirmTest() && !dispatched()) {
            <pressable class="button" accessibilityRole="button" [disabled]="!connection().token || sending()" (press)="confirmTest.set(true)">
              <text class="buttonLabel">Invia un sondaggio di prova nel gruppo</text>
            </pressable>
          }
          @if (confirmTest()) {
            <text>Vuoi avviare il sondaggio reale nel gruppo {{ progress.state().chatId }}?</text>
            <pressable class="button" accessibilityRole="button" [disabled]="sending()" (press)="sendTest()"><text class="buttonLabel">Conferma e avvia il workflow</text></pressable>
            <pressable accessibilityRole="button" [disabled]="sending()" (press)="confirmTest.set(false)"><text class="action">Annulla</text></pressable>
          }
          @if (sending()) { <text>Richiesta in corso…</text> }
          <pressable accessibilityRole="button" (press)="openRuns()"><text class="action">Controlla le esecuzioni su GitHub</text></pressable>
          <text class="hint">Completa la guida anche se preferisci provare più tardi. L’app non verifica i Secrets né l’esito del workflow: controlla Actions e il gruppo Telegram.</text>
        }
      }
      <pressable accessibilityRole="button" (press)="help.set(!help())"><text class="action">{{ help() ? 'Nascondi aiuto' : 'Hai problemi?' }}</text></pressable>
      @if (help()) { <text class="hint">{{ helpTexts[progress.state().step] }}</text> }
      <text accessibilityRole="alert" class="hint">{{ message() }}</text>
      <text class="hint">{{ progress.storageError() }}</text>
      <view class="navigation">
        <pressable accessibilityRole="button" [disabled]="progress.state().step === 0 || sending() || searching()" (press)="back()"><text class="action">Indietro</text></pressable>
        <pressable class="button" accessibilityRole="button" [disabled]="!canContinue() || sending() || searching()" (press)="next()">
          <text class="buttonLabel">{{ progress.state().step === 5 ? 'Completa la guida' : 'Continua' }}</text>
        </pressable>
      </view>
    </view>
  `,
  styles: `
    .card { padding: 20px; gap: 16px; background-color: #ffffff; border-radius: 20px; }
    text { color: #263e32; font-size: 16px; line-height: 24px; }
    .eyebrow { color: #39715a; font-size: 12px; font-weight: 700; letter-spacing: 2px; }
    .title { color: #173e32; font-size: 24px; font-weight: 700; }
    .hint { color: #58675e; font-size: 14px; line-height: 21px; }
    .label { font-weight: 600; }
    .code { background-color: #f2f5f1; padding: 12px; border-radius: 8px; font-size: 14px; }
    .command { color: #174f3c; background-color: #e7f2ec; padding: 14px; border-radius: 10px; border-left-width: 3px; border-left-color: #22684c; font-size: 16px; font-weight: 600; }
    text-input { color: #173e32; background-color: #f2f5f1; padding: 12px; border-radius: 10px; font-size: 16px; }
    .action { color: #22684c; padding: 8px; font-weight: 600; }
    .button { background-color: #22684c; border-radius: 12px; padding: 16px; align-items: center; }
    .buttonLabel { color: #ffffff; font-weight: 600; }
    .navigation { flex-direction: row; justify-content: space-between; align-items: center; gap: 12px; }
    .progress { flex-direction: row; gap: 5px; }
    .instruction { gap: 10px; }
    .group { padding: 16px; gap: 4px; border-width: 1px; border-color: #a8c7b6; border-radius: 12px; background-color: #f2f7f3; }
    .success { color: #174f3c; background-color: #e7f2ec; padding: 14px; border-radius: 10px; }
  `,
})
export class SetupGuide {
  readonly commandStyle = { fontFamily: inject(OS) === 'ios' ? 'Menlo' : 'monospace' };
  readonly progress = inject(SetupProgress);
  private readonly links = inject(DeepLinks);
  private readonly repository = inject(BotConfigRepository);
  private readonly telegram = inject(TelegramSetup);
  readonly connection = input.required<Connection>();
  readonly configured = input(false);
  readonly finished = output<void>();
  readonly titles = ['Crea il tuo bot', 'Aggiungilo al gruppo', 'Collega il gruppo', 'Configura GitHub', 'Personalizza il sondaggio', 'Prova e completa'];
  readonly helpTexts = [
    'Lo username deve terminare con bot ed essere disponibile. Se perdi il token, gestiscilo tramite BotFather.',
    'Controlla di aver aggiunto proprio il bot creato al passaggio 1. Il comando deve includere il suo username.',
    'Se non trovi il token, apri BotFather e usa /mybots per scegliere il tuo bot e recuperare il token API. Se il gruppo non compare, invia nuovamente il comando al suo interno e ripeti la ricerca. Se il bot è gestito da un altro servizio, usa l’inserimento manuale.',
    'Un errore 404 può indicare repository privato non accessibile al token o file non ancora pubblicati. Un errore 403 può indicare permessi mancanti.',
    'L’opzione esclusa deve comparire nella lista. Non puoi salvare opzioni duplicate o una soglia inferiore a 1.',
    'Richiesta accettata non significa sondaggio inviato. In Actions apri l’ultima esecuzione e controlla Run bot e Check poll state. Il branch bot-state conserva lo stato: se c’è già un sondaggio attivo il nuovo invio viene saltato.',
  ];
  readonly help = signal(false);
  readonly message = signal('');
  readonly telegramToken = signal('');
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly manualGroup = signal(false);
  readonly groups = signal<{ id: string; title: string }[]>([]);
  readonly confirmTest = signal(false);
  readonly sending = signal(false);
  readonly dispatched = signal(false);
  canContinue() {
    const state = this.progress.state();
    if (state.step === 0) return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(state.botUsername) && /bot$/i.test(state.botUsername);
    if (state.step === 2) return /^-[1-9]\d*$/.test(state.chatId) && Number.isSafeInteger(Number(state.chatId));
    if (state.step === 4) return this.configured();
    return true;
  }
  next() {
    if (!this.canContinue() || this.sending() || this.searching()) return;
    if (this.progress.state().step === 5) {
      this.progress.update({ completed: true }); this.finished.emit(); return;
    }
    this.move(this.progress.state().step + 1);
  }
  back() { if (!this.sending() && !this.searching()) this.move(Math.max(0, this.progress.state().step - 1)); }
  private move(step: number) {
    this.progress.update({ step }); this.help.set(false); this.message.set('');
    this.telegramToken.set(''); this.groups.set([]); this.confirmTest.set(false); this.searched.set(false);
  }
  open(url: string) { this.links.open(url); }
  openRuns() {
    const c = this.connection();
    this.open(`https://github.com/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/actions`);
  }
  async searchGroups() {
    if (this.searching()) return;
    this.searching.set(true); this.message.set(''); this.groups.set([]); this.searched.set(false);
    try {
      const groups = await this.telegram.findGroups(this.telegramToken(), this.progress.state().botUsername);
      this.groups.set(groups);
      this.searched.set(true);
      this.message.set(groups.length ? 'Tocca il nome del gruppo per selezionarlo.' : '');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Ricerca non riuscita. Controlla la connessione e riprova.');
    } finally { this.searching.set(false); }
  }
  async sendTest() {
    if (!this.confirmTest() || this.sending() || !this.connection().token || this.dispatched()) return;
    this.sending.set(true); this.message.set('');
    try {
      await this.repository.startPoll(this.connection());
      this.dispatched.set(true); this.confirmTest.set(false);
      this.message.set('Richiesta accettata da GitHub. Controlla l’esito in Actions e nel gruppo Telegram.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Connessione non riuscita. Controlla Actions prima di riprovare.');
    } finally { this.sending.set(false); }
  }
}
