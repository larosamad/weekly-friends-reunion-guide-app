import { Injectable } from '@angular/core';

export const MAX_POLL_OPTIONS = 12;

export interface WeeklySchedule {
  weekday: number;
  time: string;
  timezone: 'Europe/Rome';
  first_poll_hours: number;
  tiebreak_hours: number;
}
export const DEFAULT_SCHEDULE: WeeklySchedule = {
  weekday: 6, time: '11:07', timezone: 'Europe/Rome', first_poll_hours: 22, tiebreak_hours: 8,
};
export const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'] as const;

export function validateSchedule(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La programmazione non è valida.');
  const schedule = { ...DEFAULT_SCHEDULE, ...value } as WeeklySchedule;
  if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6)
    throw new Error('Scegli un giorno della settimana valido.');
  if (typeof schedule.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))
    throw new Error('Inserisci l’ora nel formato HH:mm, es. 11:07.');
  if (schedule.timezone !== 'Europe/Rome') throw new Error('Il fuso orario supportato è Europe/Rome.');
  const durations = [schedule.first_poll_hours, schedule.tiebreak_hours];
  if (durations.some(hours => !Number.isInteger(hours) || hours < 1 || hours > 167) || durations[0] + durations[1] >= 168)
    throw new Error('Le durate devono essere ore intere positive, per un totale inferiore a 168 ore.');
}

export interface BotConfig {
  SCHEDULE?: WeeklySchedule;
  OPTIONS: string[];
  EXCLUDED_OPTION: string;
  MIN_TIEBREAK_VOTES: number;
  FIRST_POLL_QUESTION: string;
  TIEBREAK_QUESTION: string;
  GROUP_NAME: string;
}
export interface Connection { owner: string; repo: string; branch: string; token: string; }
export interface PollRun { id: number; url: string; }
export interface PollRunStatus { completed: boolean; message: string; }

export function validateConfig(value: unknown): asserts value is BotConfig {
  const c = value as BotConfig | null;
  if (c?.SCHEDULE !== undefined) validateSchedule(c.SCHEDULE);
  if (!c || !Array.isArray(c.OPTIONS) || c.OPTIONS.length < 2 || c.OPTIONS.length > MAX_POLL_OPTIONS ||
    c.OPTIONS.some(o => typeof o !== 'string' || !o.trim() || o.length > 100))
    throw new Error(`Inserisci da 2 a ${MAX_POLL_OPTIONS} opzioni, ciascuna da 1 a 100 caratteri.`);
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
  async startPoll(c: Connection): Promise<PollRun> {
    const base = this.url(c).replace('/contents/bot_config.json', '');
    const workflow = await fetch(`${base}/actions/workflows/telegram-poll.yml`, { headers: this.headers(c) });
    await this.check(workflow, 'start');
    if ((await workflow.json()).state !== 'active')
      throw new Error('Gli invii sono disattivati su GitHub. Apri le esecuzioni del tuo progetto, premi il pulsante per abilitare i workflow e riprova. GitHub richiede questo passaggio dopo la creazione della copia.');
    const response = await fetch(`${base}/actions/workflows/telegram-poll.yml/dispatches`, {
      method: 'POST', headers: { ...this.headers(c), 'X-GitHub-Api-Version': '2026-03-10' },
      body: JSON.stringify({ ref: c.branch.trim(), inputs: { mode: 'start' } }),
    });
    await this.check(response, 'start');
    const run = await response.json();
    if (!Number.isSafeInteger(run.workflow_run_id))
      throw new Error('Richiesta ricevuta, ma GitHub non ha restituito il collegamento alla prova. Controlla le esecuzioni prima di riprovare.');
    return { id: run.workflow_run_id, url: `https://github.com/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/actions/runs/${run.workflow_run_id}` };
  }
  async pollRunStatus(c: Connection, id: number): Promise<PollRunStatus> {
    const base = this.url(c).replace('/contents/bot_config.json', '');
    const response = await fetch(`${base}/actions/runs/${id}`, { headers: this.headers(c) });
    await this.check(response, 'start');
    const run = await response.json();
    if (run.status !== 'completed') return { completed: false, message: run.status === 'in_progress'
      ? 'La prova è in corso. Attendi e premi Aggiorna esito.' : 'La prova è in attesa su GitHub. Premi Aggiorna esito tra poco.' };
    const jobsResponse = await fetch(`${base}/actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100`, { headers: this.headers(c) });
    await this.check(jobsResponse, 'start');
    const jobs = await jobsResponse.json();
    const steps: { name: string; conclusion: string }[] = jobs.jobs?.flatMap((job: { steps?: unknown[] }) => job.steps ?? []) ?? [];
    const bot = steps.find(step => step.name === 'Run bot');
    const failed = steps.find(step => step.conclusion === 'failure');
    let message: string;
    if (run.conclusion !== 'success') {
      message = failed?.name === 'Validate secrets' ? 'Mancano BOT_TOKEN o CHAT_ID nei Secrets GitHub della tua copia. Aggiungili nelle impostazioni del progetto e riprova.'
        : failed?.name === 'Run bot' ? 'Il bot non ha completato la prova. Apri i dettagli della prova: verifica il token Telegram, il codice del gruppo e che il bot possa inviare sondaggi.'
        : bot?.conclusion === 'success' ? 'Il bot è stato eseguito, ma GitHub non ha completato il salvataggio. Controlla il gruppo prima di riprovare e apri i dettagli della prova.'
        : 'La prova non è riuscita. Apri i dettagli della prova per vedere l’errore di GitHub.';
    } else if (bot?.conclusion === 'skipped') {
      message = 'Nessun nuovo sondaggio inviato: risulta già un sondaggio attivo. Controlla quello presente nel gruppo.';
    } else if (bot?.conclusion === 'success') {
      message = 'Il bot ha completato la prova. Apri Telegram per verificare il sondaggio nel gruppo.';
    } else message = 'Esecuzione terminata, ma non posso confermare l’invio. Apri i dettagli della prova.';
    return { completed: true, message };
  }
  private url(c: Connection): string {
    if (!c.owner.trim() || !c.repo.trim() || !c.branch.trim() || !c.token.trim()) throw new Error('Completa tutti i campi della connessione.');
    return `https://api.github.com/repos/${encodeURIComponent(c.owner.trim())}/${encodeURIComponent(c.repo.trim())}/contents/bot_config.json`;
  }
  private headers(c: Connection) {
    return { Authorization: `Bearer ${c.token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  }
  private async check(response: Response, operation: 'load' | 'save' | 'start' = 'load'): Promise<void> {
    if (response.ok) return;
    if (response.status === 403 || response.status === 429) {
      let message = '';
      try {
        const data = await response.clone().json();
        if (typeof data?.message === 'string') message = data.message;
      } catch { /* A proxy may return an empty or non-JSON error response. */ }
      if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after') || /rate limit|abuse detection/i.test(message))
        throw new Error('GitHub ha limitato temporaneamente le richieste. Attendi prima di riprovare; non serve cambiare il token.');
      const permission = operation === 'start' ? 'Actions → Read and write'
        : operation === 'save' ? 'Contents → Read and write' : 'Contents → Read (oppure Read and write)';
      throw new Error(`GitHub ha negato l’accesso. Apri le impostazioni del token: il proprietario (Resource owner) deve coincidere con quello del progetto indicato nell’app; tra i progetti selezionati deve esserci il repository del BOT. Nei permessi verifica ${permission}. Se sono già corretti, controlla eventuali approvazioni richieste dall’organizzazione.`);
    }
    const messages: Record<number, string> = {
      401: 'Token GitHub non valido o scaduto.',
      404: 'GitHub non trova la risorsa richiesta oppure il token non ha accesso alla tua copia. Controlla il collegamento e i permessi del token.',
      409: 'La configurazione è cambiata su GitHub. Ricarica prima di salvare.',
      422: 'Salvataggio rifiutato: controlla le regole e i permessi del branch.',
    };
    throw new Error(messages[response.status] ?? `Errore GitHub (${response.status}).`);
  }
  async load(c: Connection): Promise<{ config: BotConfig; sha: string }> {
    const response = await fetch(`${this.url(c)}?ref=${encodeURIComponent(c.branch.trim())}`, { headers: this.headers(c) });
    if (response.status === 404) await this.explainMissingConfig(c);
    await this.check(response);
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
    await this.check(repository);
    const branch = await fetch(`${base}/branches/${encodeURIComponent(c.branch.trim())}`, { headers: this.headers(c) });
    if (branch.status === 404)
      throw new Error(`Il progetto è accessibile, ma il branch ${c.branch.trim()} non esiste. Apri il progetto su GitHub e inserisci il nome del branch mostrato sopra l’elenco dei file.`);
    await this.check(branch);
    throw new Error(`Il progetto e il branch sono accessibili, ma manca bot_config.json nella cartella principale. Questa copia non è compatibile con la personalizzazione dall’app: serve la versione del bot che include quel file. Non occorre rigenerare il token.`);
  }

  async save(c: Connection, config: BotConfig, sha: string): Promise<string> {
    validateConfig(config);
    const response = await fetch(this.url(c), {
      method: 'PUT', headers: this.headers(c),
      body: JSON.stringify({ message: 'Update bot configuration from Friends Reunion', branch: c.branch.trim(), sha, content: encodeConfig(config) }),
    });
    await this.check(response, 'save');
    const file = await response.json();
    if (typeof file.content?.sha !== 'string') throw new Error('Salvataggio ricevuto: ricarica per verificare la configurazione.');
    return file.content.sha;
  }
}
