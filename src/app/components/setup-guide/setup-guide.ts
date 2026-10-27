import { Component, inject, input, output, signal } from '@angular/core';
import { Pressable, Text, TextInput, View } from '@ng-native/components';
import { DeepLinks, OS } from '@ng-native/device';
import { BotConfigRepository, type Connection, type PollRun } from '../../services/bot-config';
import { SetupProgress } from '../../services/setup-progress';
import { TelegramSetup } from '../../services/telegram-setup';
import { GithubSetup } from '../github-setup/github-setup';
import { BotEditor } from '../../services/bot-editor';
import { OptionDrag } from '../../services/option-drag';
import { BotSettings } from '../bot-settings/bot-settings';

@Component({
  selector: 'setup-guide',
  imports: [Pressable, Text, TextInput, View, GithubSetup, BotSettings],
  templateUrl: './setup-guide.html',
  styleUrl: './setup-guide.css',
})
export class SetupGuide {
  readonly editor = inject(BotEditor);
  readonly drag = inject(OptionDrag);
  readonly commandStyle = { fontFamily: inject(OS) === 'ios' ? 'Menlo' : 'monospace' };
  readonly progress = inject(SetupProgress);
  private readonly links = inject(DeepLinks);
  private readonly repository = inject(BotConfigRepository);
  private readonly telegram = inject(TelegramSetup);
  readonly connection = input.required<Connection>();
  readonly finished = output<void>();
  readonly titles = ['Crea il tuo bot', 'Aggiungilo al gruppo', 'Collega il gruppo', 'Configura GitHub', 'Personalizza il sondaggio', 'Prova e completa'];
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
  readonly testRun = signal<PollRun | null>(null);
  readonly checkingRun = signal(false);
  readonly testMessage = signal('');
  canContinue() {
    const state = this.progress.state();
    if (state.step === 0) return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(state.botUsername) && /bot$/i.test(state.botUsername);
    if (state.step === 2) return /^-[1-9]\d*$/.test(state.chatId) && Number.isSafeInteger(Number(state.chatId));
    if (state.step === 4) return !!this.editor.draft();
    return true;
  }
  async next() {
    if (!this.canContinue() || this.sending() || this.searching() || this.drag.active() || this.editor.busy()) return;
    if (this.progress.state().step === 4 && this.editor.dirty()) {
      this.message.set('');
      if (!await this.editor.save()) {
        this.message.set(`Non posso continuare. ${this.editor.status() || 'Non riesco a salvare. Ricarica la configurazione e riprova.'}`);
        return;
      }
    }
    if (this.progress.state().step === 5) {
      this.progress.update({ completed: true }); this.finished.emit(); return;
    }
    this.move(this.progress.state().step + 1);
  }
  back() { if (!this.sending() && !this.searching() && !this.drag.active() && !this.editor.busy()) this.move(Math.max(0, this.progress.state().step - 1)); }
  private move(step: number) {
    this.progress.update({ step }); this.message.set('');
    this.telegramToken.set(''); this.prepared.set(false); this.groups.set([]); this.confirmTest.set(false); this.searched.set(false);
  }
  open(url: string) { this.links.open(url); }
  openRuns() {
    const c = this.connection();
    this.open(`https://github.com/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/actions`);
  }
  openTestRun() { const run = this.testRun(); if (run) this.open(run.url); }
  async refreshTest() {
    const run = this.testRun();
    if (!run || this.checkingRun()) return;
    this.checkingRun.set(true);
    try {
      const status = await this.repository.pollRunStatus(this.connection(), run.id);
      this.testMessage.set(status.message);
    } catch (error) {
      this.testMessage.set(error instanceof Error ? error.message : 'Non riesco a recuperare l’esito. Apri i dettagli della prova.');
    } finally { this.checkingRun.set(false); }
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
      this.testRun.set(await this.repository.startPoll(this.connection()));
      this.dispatched.set(true); this.confirmTest.set(false);
      this.testMessage.set('Prova avviata. Sto controllando l’esecuzione su GitHub.');
      await this.refreshTest();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Connessione non riuscita. Controlla Actions prima di riprovare.');
    } finally { this.sending.set(false); }
  }
}
