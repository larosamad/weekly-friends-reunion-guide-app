import { Component, inject, signal } from '@angular/core';
import { Pressable, SafeAreaProvider, SafeAreaView, ScrollView, Text, TextInput, View } from '@ng-native/components';
import { StatusBar } from '@ng-native/device';
import { BotConfigRepository, type BotConfig, type Connection } from './bot-config';
import { SetupGuide } from './setup-guide';
import { SetupProgress } from './setup-progress';

@Component({
  selector: 'app-root',
  imports: [Pressable, SafeAreaProvider, SafeAreaView, ScrollView, Text, TextInput, View, SetupGuide],
  template: `
    <safe-area-provider>
      <safe-area-view class="screen">
        <scroll-view [style]="{ flex: 1 }">
          <view class="body">
            <text class="eyebrow">FRIENDS REUNION</text>
            <text class="title">Il tuo gruppo. Le vostre regole.</text>
            @if (mode() === 'home') {
              <text class="hint">Organizza i vostri incontri con un sondaggio Telegram. Ti accompagniamo dalla creazione del bot alla prima prova.</text>
              <view class="card">
                <text class="heading">Da dove vuoi iniziare?</text>
                <text class="hint">Servono Telegram, un account GitHub e circa 10–15 minuti. I passaggi su Telegram e GitHub si completano nei rispettivi servizi.</text>
                <pressable class="button" accessibilityRole="button" (press)="mode.set('guide')">
                  <text class="buttonLabel">{{ progress.state().completed ? 'Rivedi la guida' : progress.state().step > 0 ? 'Riprendi la configurazione' : 'Configura un nuovo bot' }}</text>
                </pressable>
                @if (progress.state().step > 0 && !progress.state().completed) {
                  <text class="hint">Riparti dal passaggio {{ progress.state().step + 1 }} di 6.</text>
                }
                @if (progress.state().completed) {
                  <text class="hint">Guida completata. Controlla su GitHub Actions che il bot funzioni correttamente.</text>
                }
                <pressable accessibilityRole="button" (press)="mode.set('manage')"><text class="action">Gestisci un bot già configurato</text></pressable>
                <text class="hint">Salviamo sul dispositivo l’avanzamento, lo username del bot, il CHAT_ID e il repository. I token restano esclusi.</text>
                <text class="hint">{{ progress.storageError() }}</text>
              </view>
            } @else {
              <pressable accessibilityRole="button" [disabled]="busy()" (press)="mode.set('home')"><text class="action">Torna alla home</text></pressable>
            }
            @if (mode() === 'guide') {
              <setup-guide [connection]="connection()" [configured]="!!draft() && !dirty()" (finished)="mode.set('home')" />
            }
            @if (mode() === 'manage' || (mode() === 'guide' && progress.state().step === 4)) {
            <text class="hint">Gestisci le impostazioni del sondaggio Telegram.</text>
            <view class="card">
              <text class="heading">Connessione GitHub</text>
              <text class="hint">Token con Contents: lettura e scrittura, conservato solo in memoria fino alla chiusura dell’app.</text>
              @for (field of connectionFields; track field.key) {
                <text class="label">{{ field.label }}</text>
                <text-input [accessibilityLabel]="field.label" [value]="connection()[field.key]"
                  [secureTextEntry]="field.key === 'token'" autoCapitalize="none" [autoCorrect]="false"
                  [editable]="!busy()" (changeText)="setConnection(field.key, $event)" />
              }
              <pressable class="button" accessibilityRole="button" [disabled]="busy()" (press)="load()">
                <text class="buttonLabel">Carica configurazione</text>
              </pressable>
            </view>
            @if (draft(); as config) {
              <view class="card">
                <text class="heading">Sondaggio settimanale</text>
                @for (field of configFields; track field.key) {
                  <text class="label">{{ field.label }}</text>
                  <text-input [accessibilityLabel]="field.label" [value]="config[field.key]"
                    [editable]="!busy()" (changeText)="setField(field.key, $event)" />
                }
                <text class="label">Voti minimi per lo spareggio</text>
                <text-input accessibilityLabel="Voti minimi per lo spareggio" keyboardType="number-pad"
                  [value]="votes()" [editable]="!busy()" (changeText)="votes.set($event); dirty.set(true)" />
                <text class="label">Opzioni (da 2 a 10)</text>
                <text class="hint">L’ordine qui è quello mostrato nel sondaggio. L’opzione esclusa non concorre alla vittoria.</text>
                @for (option of config.OPTIONS; track $index; let i = $index) {
                  <view class="option">
                    <text-input [style]="{ flex: 1 }" [accessibilityLabel]="'Opzione ' + (i + 1)"
                      [value]="option" [editable]="!busy()" (changeText)="setOption(i, $event)" />
                    <pressable accessibilityRole="button" [accessibilityLabel]="'Rimuovi opzione ' + (i + 1)"
                      [disabled]="busy() || config.OPTIONS.length <= 2" (press)="removeOption(i)">
                      <text class="action">Rimuovi</text>
                    </pressable>
                  </view>
                }
                <pressable accessibilityRole="button" [disabled]="busy() || config.OPTIONS.length >= 10" (press)="addOption()">
                  <text class="action">+ Aggiungi opzione</text>
                </pressable>
                <text class="hint">{{ dirty() ? 'Modifiche da salvare' : 'Configurazione sincronizzata' }}</text>
                <text class="hint">Il bot legge questi valori a ogni esecuzione, anche alla chiusura di un sondaggio già attivo.</text>
                <pressable class="button" accessibilityRole="button" [disabled]="busy() || !dirty()" (press)="save()">
                  <text class="buttonLabel">Salva su GitHub</text>
                </pressable>
                @if (conflict()) {
                  <pressable accessibilityRole="button" [disabled]="busy()" (press)="reload()">
                    <text class="action">Scarta modifiche e ricarica</text>
                  </pressable>
                }
              </view>
            }
            @if (busy()) { <text class="hint">Operazione in corso…</text> }
            <text accessibilityRole="alert" class="status">{{ status() }}</text>
            }
          </view>
        </scroll-view>
      </safe-area-view>
    </safe-area-provider>
  `,
  styles: `
    :host { flex: 1; }
    .screen { flex: 1; background-color: #f2f5f1; }
    .body { padding: 24px; gap: 16px; }
    .eyebrow { color: #39715a; font-size: 12px; font-weight: 700; letter-spacing: 2px; }
    .title { color: #173e32; font-size: 32px; font-weight: 700; }
    .hint { color: #58675e; font-size: 14px; line-height: 21px; }
    .card { padding: 20px; gap: 12px; background-color: #ffffff; border-radius: 20px; }
    .heading { color: #173e32; font-size: 21px; font-weight: 700; }
    .label { color: #263e32; font-size: 14px; font-weight: 600; }
    text-input { color: #173e32; background-color: #f2f5f1; padding: 12px; border-radius: 10px; font-size: 16px; }
    .button { background-color: #22684c; border-radius: 12px; padding: 16px; align-items: center; }
    .buttonLabel { color: #ffffff; font-size: 16px; font-weight: 600; }
    .option { flex-direction: row; align-items: center; gap: 12px; }
    .action { color: #22684c; padding: 8px; font-weight: 600; }
    .status { color: #173e32; font-size: 15px; }
  `,
})
export class App {
  private readonly repository = inject(BotConfigRepository);
  readonly progress = inject(SetupProgress);
  readonly mode = signal<'home' | 'guide' | 'manage'>('home');
  readonly connection = signal<Connection>({ owner: this.progress.state().owner, repo: this.progress.state().repo, branch: this.progress.state().branch, token: '' });
  readonly connectionFields = [
    { key: 'owner', label: 'Proprietario GitHub' }, { key: 'repo', label: 'Repository' },
    { key: 'branch', label: 'Branch' }, { key: 'token', label: 'Token GitHub' },
  ] as const;
  readonly configFields = [
    { key: 'GROUP_NAME', label: 'Nome del gruppo' },
    { key: 'FIRST_POLL_QUESTION', label: 'Domanda del primo sondaggio' },
    { key: 'TIEBREAK_QUESTION', label: 'Domanda dello spareggio' },
    { key: 'EXCLUDED_OPTION', label: 'Opzione esclusa' },
  ] as const;
  readonly draft = signal<BotConfig | null>(null);
  readonly votes = signal('3');
  readonly busy = signal(false);
  readonly dirty = signal(false);
  readonly conflict = signal(false);
  readonly status = signal('Carica la configurazione per iniziare.');
  private sha = '';
  constructor() { inject(StatusBar).set({ style: 'dark' }); }

  setConnection(key: keyof Connection, value: string) {
    this.connection.update(c => ({ ...c, [key]: value }));
    if (key !== 'token') this.progress.update({ [key]: value });
    this.draft.set(null);
    this.sha = '';
    this.dirty.set(false);
    this.status.set('Connessione modificata: carica la configurazione.');
  }
  setField(key: 'GROUP_NAME' | 'FIRST_POLL_QUESTION' | 'TIEBREAK_QUESTION' | 'EXCLUDED_OPTION', value: string) {
    this.draft.update(c => c ? { ...c, [key]: value } : c);
    this.dirty.set(true);
  }
  setOption(index: number, value: string) {
    this.draft.update(c => c ? { ...c, OPTIONS: c.OPTIONS.map((o, i) => i === index ? value : o) } : c);
    this.dirty.set(true);
  }
  addOption() {
    this.draft.update(c => c && c.OPTIONS.length < 10 ? { ...c, OPTIONS: [...c.OPTIONS, ''] } : c);
    this.dirty.set(true);
  }
  removeOption(index: number) {
    this.draft.update(c => c && c.OPTIONS.length > 2 ? { ...c, OPTIONS: c.OPTIONS.filter((_, i) => i !== index) } : c);
    this.dirty.set(true);
  }
  async reload() { await this.load(true); }
  async load(discard = false) {
    if (this.busy()) return;
    if (this.dirty() && !discard) { this.conflict.set(true); this.status.set('Salva le modifiche oppure scartale per ricaricare.'); return; }
    await this.run(async () => {
      const result = await this.repository.load({ ...this.connection() });
      this.draft.set(result.config);
      this.votes.set(String(result.config.MIN_TIEBREAK_VOTES));
      this.sha = result.sha;
      this.dirty.set(false);
      this.conflict.set(false);
      this.status.set('Configurazione caricata da GitHub.');
    });
  }
  async save() {
    const config = this.draft();
    if (!config || !this.sha || this.busy() || !this.dirty()) return;
    await this.run(async () => {
      const updated = { ...config, MIN_TIEBREAK_VOTES: Number(this.votes()) };
      this.sha = await this.repository.save({ ...this.connection() }, updated, this.sha);
      this.draft.set(updated);
      this.dirty.set(false);
      this.conflict.set(false);
      this.status.set('Configurazione salvata. Sarà letta alla prossima esecuzione del bot.');
    });
  }
  private async run(action: () => Promise<void>) {
    this.busy.set(true);
    this.status.set('');
    try { await action(); }
    catch (error) {
      this.status.set(error instanceof Error ? error.message : 'Operazione non riuscita. Controlla la connessione.');
      if (this.dirty()) this.conflict.set(true);
    }
    finally { this.busy.set(false); }
  }
}
