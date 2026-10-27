import { Injectable, inject, signal } from '@angular/core';
import { BotConfigRepository, type BotConfig, type Connection } from './bot-config';
import { SetupProgress } from './setup-progress';

@Injectable({ providedIn: 'root' })
export class BotEditor {
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
		{ key: 'EXCLUDED_OPTION', label: 'Opzione esclusa', hint: 'La risposta per chi non partecipa, es. Non posso. Deve coincidere con una delle opzioni qui sotto.' },
	] as const;
	readonly draft = signal<BotConfig | null>(null);
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
