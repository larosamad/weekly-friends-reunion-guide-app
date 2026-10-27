import { inject, Injectable, InjectionToken, signal } from '@angular/core';

export interface SetupState {
  step: number;
  completed: boolean;
  botUsername: string;
  chatId: string;
  owner: string;
  repo: string;
  branch: string;
}
export interface SetupStorage { read(): string | null; write(value: string): void; }
export const SETUP_STORAGE = new InjectionToken<SetupStorage>('Setup progress storage', {
  providedIn: 'root', factory: () => ({ read: () => null, write: () => {} }),
});
const defaults: SetupState = {
  step: 0, completed: false, botUsername: '', chatId: '', owner: '',
  repo: 'weekly-friends-reunion-telegram-poll-bot', branch: 'main',
};

@Injectable({ providedIn: 'root' })
export class SetupProgress {
  private readonly storage = inject(SETUP_STORAGE);
  readonly state = signal<SetupState>({ ...defaults });
  readonly storageError = signal('');
  constructor() {
    try {
      const raw = this.storage.read();
      if (!raw) return;
      const saved = JSON.parse(raw);
      const restored = { ...defaults };
      for (const key of ['botUsername', 'chatId', 'owner', 'repo', 'branch'] as const)
        if (typeof saved?.[key] === 'string') restored[key] = saved[key];
      if (Number.isInteger(saved?.step) && saved.step >= 0 && saved.step <= 5) restored.step = saved.step;
      restored.completed = saved?.completed === true;
      this.state.set(restored);
    } catch { this.storageError.set('Non riesco a recuperare l’avanzamento precedente. Puoi iniziare una nuova guida.'); }
  }
  reset() { this.update({ ...defaults }); }

  update(patch: Partial<SetupState>) {
    this.state.update(s => ({ ...s, ...patch }));
    try {
      // Explicit allowlist: no Telegram/GitHub tokens or pasted API responses.
      const { step, completed, botUsername, chatId, owner, repo, branch } = this.state();
      this.storage.write(JSON.stringify({ step, completed, botUsername, chatId, owner, repo, branch }));
      this.storageError.set('');
    } catch { this.storageError.set('Avanzamento disponibile per questa sessione: salvataggio sul dispositivo non riuscito.'); }
  }
}

export function findGroupIds(raw: string): { id: string; title: string }[] {
  const data = JSON.parse(raw);
  if (data?.ok !== true || !Array.isArray(data.result)) throw new Error('Incolla la risposta JSON completa di getUpdates.');
  const groups = new Map<string, string>();
  for (const update of data.result) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat ?? update.channel_post?.chat;
    if (chat && (chat.type === 'group' || chat.type === 'supergroup') && Number.isSafeInteger(chat.id) && chat.id < 0)
      groups.set(String(chat.id), typeof chat.title === 'string' ? chat.title : 'Gruppo Telegram');
  }
  return [...groups].map(([id, title]) => ({ id, title }));
}
