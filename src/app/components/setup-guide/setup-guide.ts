import { Component, inject, input, output, signal } from '@angular/core';
import { Pressable, Text, TextInput, View } from '@ng-native/components';
import { DeepLinks, OS } from '@ng-native/device';
import { BotConfigRepository, type Connection } from '../../services/bot-config';
import { SetupProgress } from '../../services/setup-progress';
import { TelegramSetup } from '../../services/telegram-setup';
import { GithubSetup } from '../github-setup/github-setup';
import { BotSettings } from '../bot-settings/bot-settings';

@Component({
  selector: 'setup-guide',
  imports: [Pressable, Text, TextInput, View, GithubSetup, BotSettings],
  templateUrl: './setup-guide.html',
  styleUrl: './setup-guide.css',
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
  readonly prepared = signal(false);
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
    this.telegramToken.set(''); this.prepared.set(false); this.groups.set([]); this.confirmTest.set(false); this.searched.set(false);
  }
  open(url: string) { this.links.open(url); }
  openRuns() {
    const c = this.connection();
    this.open(`https://github.com/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/actions`);
  }
  setTelegramToken(value: string) {
    this.telegramToken.set(value);
    this.prepared.set(false);
    this.groups.set([]);
    this.searched.set(false);
    this.message.set('');
  }
  async prepareGroups() {
    if (this.searching()) return;
    this.searching.set(true); this.message.set(''); this.searched.set(false);
    try {
      const groups = await this.telegram.prepareGroups(this.telegramToken(), this.progress.state().botUsername);
      this.groups.set(groups);
      this.prepared.set(true);
      this.message.set(groups.length ? 'Tocca il nome del gruppo per selezionarlo.' : 'Bot pronto. Ora invia il comando nel gruppo, poi torna qui per cercarlo.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Preparazione non riuscita. Riprova.');
    } finally { this.searching.set(false); }
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
