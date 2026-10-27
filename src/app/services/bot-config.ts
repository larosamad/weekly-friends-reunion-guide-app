import { Injectable } from '@angular/core';

export interface BotConfig {
  OPTIONS: string[];
  EXCLUDED_OPTION: string;
  MIN_TIEBREAK_VOTES: number;
  FIRST_POLL_QUESTION: string;
  TIEBREAK_QUESTION: string;
  GROUP_NAME: string;
}
export interface Connection { owner: string; repo: string; branch: string; token: string; }

export function validateConfig(value: unknown): asserts value is BotConfig {
  const c = value as BotConfig | null;
  if (!c || !Array.isArray(c.OPTIONS) || c.OPTIONS.length < 2 || c.OPTIONS.length > 10 ||
    c.OPTIONS.some(o => typeof o !== 'string' || !o.trim() || o.length > 100))
    throw new Error('Inserisci da 2 a 10 opzioni, ciascuna da 1 a 100 caratteri.');
  if (new Set(c.OPTIONS.map(o => o.trim())).size !== c.OPTIONS.length) throw new Error('Le opzioni devono essere univoche.');
  if (!c.OPTIONS.includes(c.EXCLUDED_OPTION)) throw new Error('L’opzione esclusa deve corrispondere a una delle opzioni.');
  if (!Number.isSafeInteger(c.MIN_TIEBREAK_VOTES) || c.MIN_TIEBREAK_VOTES < 1) throw new Error('La soglia deve essere un intero positivo.');
  for (const [key, limit] of [['FIRST_POLL_QUESTION', 300], ['TIEBREAK_QUESTION', 300], ['GROUP_NAME', 100]] as const) {
    if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > limit) throw new Error(`${key}: inserisci da 1 a ${limit} caratteri.`);
  }
}

export function encodeConfig(config: BotConfig): string {
  // ASCII JSON escapes preserve accents/emoji without Node's Buffer in native builds.
  return btoa((JSON.stringify(config, null, 2) + '\n').replace(/[\u007f-\uffff]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')));
}

@Injectable({ providedIn: 'root' })
export class BotConfigRepository {
  async startPoll(c: Connection): Promise<void> {
    const base = this.url(c).replace('/contents/bot_config.json', '');
    const response = await fetch(`${base}/actions/workflows/telegram-poll.yml/dispatches`, {
      method: 'POST', headers: this.headers(c),
      body: JSON.stringify({ ref: c.branch.trim(), inputs: { mode: 'start' } }),
    });
    this.check(response);
  }
  private url(c: Connection): string {
    if (!c.owner.trim() || !c.repo.trim() || !c.branch.trim() || !c.token.trim()) throw new Error('Completa tutti i campi della connessione.');
    return `https://api.github.com/repos/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/contents/bot_config.json`;
  }
  private headers(c: Connection) {
    return { Authorization: `Bearer ${c.token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  }
  private check(response: Response): void {
    if (response.ok) return;
    const messages: Record<number, string> = {
      401: 'Token GitHub non valido o scaduto.',
      403: 'Accesso negato: controlla i permessi Contents (configurazione), Actions (prova) e i limiti GitHub.',
      404: 'GitHub non trova la risorsa richiesta oppure il token non ha accesso alla tua copia. Controlla il collegamento e i permessi del token.',
      409: 'La configurazione è cambiata su GitHub. Ricarica prima di salvare.',
      422: 'Salvataggio rifiutato: controlla le regole e i permessi del branch.',
    };
    throw new Error(messages[response.status] ?? `Errore GitHub (${response.status}).`);
  }
  async load(c: Connection): Promise<{ config: BotConfig; sha: string }> {
    const response = await fetch(`${this.url(c)}?ref=${encodeURIComponent(c.branch.trim())}`, { headers: this.headers(c) });
    if (response.status === 404) await this.explainMissingConfig(c);
    this.check(response);
    const file = await response.json();
    if (file.encoding !== 'base64' || typeof file.content !== 'string' || typeof file.sha !== 'string') throw new Error('Risposta GitHub non valida.');
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), char => char.charCodeAt(0));
    const config: unknown = JSON.parse(new TextDecoder().decode(bytes));
    validateConfig(config);
    return { config, sha: file.sha };
  }
  private async explainMissingConfig(c: Connection): Promise<never> {
    const base = this.url(c).replace('/contents/bot_config.json', '');
    const repository = await fetch(base, { headers: this.headers(c) });
    if (repository.status === 404)
      throw new Error(`Non riesco ad accedere a ${c.owner.trim()}/${c.repo.trim()}. Controlla proprietario e nome del progetto. Se sono corretti, verifica che il token GitHub includa proprio questa copia.`);
    this.check(repository);
    const branch = await fetch(`${base}/branches/${encodeURIComponent(c.branch.trim())}`, { headers: this.headers(c) });
    if (branch.status === 404)
      throw new Error(`Il progetto è accessibile, ma il branch ${c.branch.trim()} non esiste. Apri il progetto su GitHub e inserisci il nome del branch mostrato sopra l’elenco dei file.`);
    this.check(branch);
    throw new Error(`Il progetto e il branch sono accessibili, ma manca bot_config.json nella cartella principale. Questa copia non è compatibile con la personalizzazione dall’app: serve la versione del bot che include quel file. Non occorre rigenerare il token.`);
  }

  async save(c: Connection, config: BotConfig, sha: string): Promise<string> {
    validateConfig(config);
    const response = await fetch(this.url(c), {
      method: 'PUT', headers: this.headers(c),
      body: JSON.stringify({ message: 'Update bot configuration from Friends Reunion', branch: c.branch.trim(), sha, content: encodeConfig(config) }),
    });
    this.check(response);
    const file = await response.json();
    if (typeof file.content?.sha !== 'string') throw new Error('Salvataggio ricevuto: ricarica per verificare la configurazione.');
    return file.content.sha;
  }
}
