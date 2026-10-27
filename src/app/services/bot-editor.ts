import { Injectable, computed, inject, signal } from '@angular/core';
import { BotConfigRepository, MAX_POLL_OPTIONS, DEFAULT_SCHEDULE, WEEKDAYS, type WeeklySchedule, type BotConfig, type Connection } from './bot-config';
import { SetupProgress } from './setup-progress';

@Injectable({ providedIn: 'root' })
export class BotEditor {
  readonly maxOptions = MAX_POLL_OPTIONS;
  readonly weekdays = WEEKDAYS;
  readonly schedule = computed(() => ({ ...DEFAULT_SCHEDULE, ...this.draft()?.SCHEDULE }));
  readonly scheduleSummary = computed(() => `Ogni ${WEEKDAYS[this.schedule().weekday]?.toLowerCase()} alle ${this.schedule().time} (ora italiana)`);
  readonly firstPollHours = signal(String(DEFAULT_SCHEDULE.first_poll_hours));
  readonly tiebreakHours = signal(String(DEFAULT_SCHEDULE.tiebreak_hours));
	private readonly repository = inject(BotConfigRepository);
	readonly progress = inject(SetupProgress);
	readonly connection = signal<Connection>({ owner: this.progress.state().owner, repo: this.progress.state().repo, branch: this.progress.state().branch, token: '' });
	readonly connectionFields = [
		{ key: 'owner', label: 'Proprietario GitHub', placeholder: 'Es. maddalena', hint: 'Il nome che compare dopo github.com/ nel link della TUA copia.' },
    { key: 'repo', label: 'Repository', placeholder: 'Es. weekly-friends-reunion-telegram-poll-bot', hint: 'Il nome dopo il proprietario nello stesso link. È già compilato: cambialo solo se hai rinominato la copia.' },
    { key: 'branch', label: 'Branch', placeholder: 'main', hint: 'Lascia main, salvo che tu abbia scelto un altro branch su GitHub.' },
    { key: 'token', label: 'Token GitHub', placeholder: 'Incolla il token creato al passaggio 4', hint: 'Incolla il token GitHub del passaggio precedente, diverso da quello di BotFather.' },
	] as const;
	readonly configFields = [
		{ key: 'GROUP_NAME', label: 'Nome del gruppo', hint: 'Il nome da usare nei messaggi del bot. Es. Amici del venerdì.' },
		{ key: 'FIRST_POLL_QUESTION', label: 'Domanda del primo sondaggio', hint: 'La domanda che leggerete su Telegram. Es. Quando ci vediamo?' },
		{ key: 'TIEBREAK_QUESTION', label: 'Domanda dello spareggio', hint: 'La domanda del secondo sondaggio, usato per scegliere tra le opzioni rimaste in gara.' },
		{ key: 'EXCLUDED_OPTION', label: 'Risposta per chi non partecipa', hint: 'Es. Non posso. La aggiungiamo automaticamente al sondaggio; non concorre alla scelta del vincitore.' },
	] as const;
	readonly draft = signal<BotConfig | null>(null);
  readonly participationOptions = computed(() => {
    const config = this.draft();
    return config ? config.OPTIONS.map((value, index) => ({ value, index }))
      .filter(option => option.value !== config.EXCLUDED_OPTION) : [];
  });
	readonly votes = signal('3');
	readonly busy = signal(false);
	readonly dirty = signal(false);
	readonly conflict = signal(false);
	readonly status = signal('Carica la configurazione per iniziare.');
	private sha = '';

  reset() {
    if (this.busy()) return false;
    this.progress.reset();
    const { owner, repo, branch } = this.progress.state();
    this.connection.set({ owner, repo, branch, token: '' });
    this.draft.set(null);
    this.votes.set('3');
    this.firstPollHours.set(String(DEFAULT_SCHEDULE.first_poll_hours));
    this.tiebreakHours.set(String(DEFAULT_SCHEDULE.tiebreak_hours));
    this.dirty.set(false);
    this.conflict.set(false);
    this.sha = '';
    this.status.set('Carica la configurazione per iniziare.');
    return true;
  }

	setConnection(key: keyof Connection, value: string) {
		this.connection.update(c => ({ ...c, [key]: value }));
		if (key !== 'token') this.progress.update({ [key]: value });
		this.draft.set(null);
		this.sha = '';
		this.dirty.set(false);
		this.status.set('Connessione modificata: carica la configurazione.');
	}
	setField(key: 'GROUP_NAME' | 'FIRST_POLL_QUESTION' | 'TIEBREAK_QUESTION' | 'EXCLUDED_OPTION', value: string) {
    const config = this.draft();
    if (!config || this.busy()) return;
    if (key === 'EXCLUDED_OPTION') {
      if (config.OPTIONS.some(option => option !== config.EXCLUDED_OPTION && option.trim() === value.trim())) {
        this.status.set('Questa risposta è già usata tra le opzioni. Scegli un testo diverso per chi non partecipa.');
        return;
      }
      this.draft.set({ ...config, EXCLUDED_OPTION: value,
        OPTIONS: config.OPTIONS.map(option => option === config.EXCLUDED_OPTION ? value : option) });
    } else {
      this.draft.set({ ...config, [key]: value });
    }
    this.dirty.set(true);
	}
	setOption(index: number, value: string) {
    const config = this.draft();
    if (!config || this.busy() || !Number.isInteger(index) || index < 0 || index >= config.OPTIONS.length || config.OPTIONS[index] === config.EXCLUDED_OPTION) return;
    if (value.trim() === config.EXCLUDED_OPTION.trim()) {
      this.status.set('La risposta per chi non partecipa è già inclusa automaticamente. Inserisci un’altra opzione.');
      return;
    }
		this.draft.update(c => c ? { ...c, OPTIONS: c.OPTIONS.map((o, i) => i === index ? value : o) } : c);
		this.dirty.set(true);
	}
	addOption() {
		this.draft.update(c => c && c.OPTIONS.length < this.maxOptions ? { ...c, OPTIONS: [...c.OPTIONS, ''] } : c);
		this.dirty.set(true);
	}
  /** Positions refer to participating answers; the automatic answer keeps its slot. */
  reorderOptions(from: number, to: number) {
    const config = this.draft();
    const options = this.participationOptions().map(option => option.value);
    if (!config || this.busy() || !Number.isInteger(from) || !Number.isInteger(to) ||
        from === to || from < 0 || to < 0 || from >= options.length || to >= options.length) return;
    options.splice(to, 0, options.splice(from, 1)[0]);
    let index = 0;
    this.draft.set({ ...config, OPTIONS: config.OPTIONS.map(value =>
      value === config.EXCLUDED_OPTION ? value : options[index++]) });
    this.dirty.set(true);
  }
	removeOption(index: number) {
    const config = this.draft();
    if (!config || this.busy() || !Number.isInteger(index) || index < 0 || index >= config.OPTIONS.length || config.OPTIONS[index] === config.EXCLUDED_OPTION) return;
		this.draft.update(c => c && c.OPTIONS.length > 2 ? { ...c, OPTIONS: c.OPTIONS.filter((_, i) => i !== index) } : c);
		this.dirty.set(true);
	}
  setSchedule(patch: Partial<WeeklySchedule>) {
    if (!this.draft() || this.busy()) return;
    this.draft.update(config => config ? { ...config, SCHEDULE: { ...DEFAULT_SCHEDULE, ...config.SCHEDULE, ...patch } } : config);
    this.dirty.set(true);
  }
  setDuration(key: 'first' | 'tiebreak', value: string) {
    if (!this.draft() || this.busy()) return;
    (key === 'first' ? this.firstPollHours : this.tiebreakHours).set(value);
    this.dirty.set(true);
  }
	async reload() { await this.load(true); }
	async load(discard = false) {
		if (this.busy()) return;
		if (this.dirty() && !discard) { this.conflict.set(true); this.status.set('Salva le modifiche oppure scartale per ricaricare.'); return; }
		await this.run(async () => {
			const result = await this.repository.load({ ...this.connection() });
			this.draft.set(result.config);
      const schedule = { ...DEFAULT_SCHEDULE, ...result.config.SCHEDULE };
      this.firstPollHours.set(String(schedule.first_poll_hours));
      this.tiebreakHours.set(String(schedule.tiebreak_hours));
			this.votes.set(String(result.config.MIN_TIEBREAK_VOTES));
			this.sha = result.sha;
			this.dirty.set(false);
			this.conflict.set(false);
			this.status.set('Configurazione caricata da GitHub.');
		});
	}
	async save(): Promise<boolean> {
		const config = this.draft();
		if (!config || !this.sha || this.busy()) return false;
    if (!this.dirty()) return true;
		return this.run(async () => {
			const updated = { ...config, MIN_TIEBREAK_VOTES: Number(this.votes()), SCHEDULE: {
        ...this.schedule(), first_poll_hours: Number(this.firstPollHours()), tiebreak_hours: Number(this.tiebreakHours()),
      } };
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
		try { await action(); return true; }
		catch (error) {
			this.status.set(error instanceof Error ? error.message : 'Operazione non riuscita. Controlla la connessione.');
			if (this.dirty()) this.conflict.set(true);
      return false;
		}
		finally { this.busy.set(false); }
	}
}
