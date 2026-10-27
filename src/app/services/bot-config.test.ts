import { afterEach, expect, test, vi } from 'vitest';
import { BotConfigRepository, DEFAULT_SCHEDULE, encodeConfig, validateConfig, type BotConfig } from './bot-config';

export const sample: BotConfig = {
  OPTIONS: ['Non posso', 'Lunedì sera', 'Martedì sera'], EXCLUDED_OPTION: 'Non posso',
  MIN_TIEBREAK_VOTES: 3, FIRST_POLL_QUESTION: 'Che giorno preferite?',
  TIEBREAK_QUESTION: 'Ex aequo: quale giorno scegliamo?', GROUP_NAME: 'Ciccini 🍿',
};
const connection = { owner: 'owner', repo: 'bot', branch: 'main', token: 'test-token' };
afterEach(() => vi.unstubAllGlobals());

test('validates option consistency and threshold', () => {
  expect(() => validateConfig(sample)).not.toThrow();
  for (const patch of [
    { OPTIONS: ['Solo una'] }, { OPTIONS: ['Non posso', 'Non posso'] },
    { EXCLUDED_OPTION: 'Assente' }, { MIN_TIEBREAK_VOTES: 0 },
    { MIN_TIEBREAK_VOTES: 1.5 }, { FIRST_POLL_QUESTION: ' ' },
  ]) expect(() => validateConfig({ ...sample, ...patch })).toThrow();
});

test('loads UTF-8 from GitHub and saves using the loaded SHA', async () => {
  const remote = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(sample))));
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ encoding: 'base64', content: remote, sha: 'old' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'new' } })));
  vi.stubGlobal('fetch', request);
  const repository = new BotConfigRepository();
  expect(await repository.load(connection)).toEqual({ config: sample, sha: 'old' });
  expect(await repository.save(connection, sample, 'old')).toBe('new');
  const body = JSON.parse(request.mock.calls[1][1].body);
  expect(body.sha).toBe('old');
  expect(body.branch).toBe('main');
  expect(JSON.parse(atob(body.content))).toEqual(sample);
  expect(JSON.parse(atob(encodeConfig(sample)))).toEqual(sample);
});

test('rejects a concurrent edit without overwriting it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 409 })));
  await expect(new BotConfigRepository().save(connection, sample, 'old')).rejects.toThrow('Ricarica');
});

test('does not send invalid configuration', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  await expect(new BotConfigRepository().save(connection, { ...sample, OPTIONS: [] }, 'old')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

test('starts the existing workflow in start mode', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'active' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_run_id: 42 })));
  vi.stubGlobal('fetch', request);
  expect((await new BotConfigRepository().startPoll(connection)).id).toBe(42);
  expect(request.mock.calls[1][0]).toBe('https://api.github.com/repos/owner/bot/actions/workflows/telegram-poll.yml/dispatches');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ ref: 'main', inputs: { mode: 'start' } });
  expect(request.mock.calls[1][1].headers['X-GitHub-Api-Version']).toBe('2026-03-10');
});

test('does not dispatch a workflow disabled after a fork', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'disabled_fork' })));
  vi.stubGlobal('fetch', request);
  await expect(new BotConfigRepository().startPoll(connection)).rejects.toThrow('abilitare i workflow');
  expect(request).toHaveBeenCalledTimes(1);
});

test('tracks the exact run and distinguishes skipped sending from missing secrets and success', async () => {
  for (const [conclusion, steps, message] of [
    ['success', [{ name: 'Run bot', conclusion: 'skipped' }], 'Nessun nuovo sondaggio'],
    ['success', [{ name: 'Run bot', conclusion: 'success' }], 'ha completato la prova'],
    ['failure', [{ name: 'Validate secrets', conclusion: 'failure' }], 'Mancano BOT_TOKEN o CHAT_ID'],
    ['failure', [{ name: 'Run bot', conclusion: 'failure' }], 'non ha completato'],
    ['failure', [{ name: 'Run bot', conclusion: 'success' }, { name: 'Save poll state', conclusion: 'failure' }], 'salvataggio'],
  ] as const) {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', conclusion, run_attempt: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobs: [{ steps }] })));
    vi.stubGlobal('fetch', request);
    expect(await new BotConfigRepository().pollRunStatus(connection, 42)).toEqual({ completed: true, message: expect.stringContaining(message) });
    expect(request.mock.calls[1][0]).toContain('/actions/runs/42/attempts/2/jobs');
  }
});

test('a queued run is not reported as a sent poll', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'queued' })));
  vi.stubGlobal('fetch', request);
  expect(await new BotConfigRepository().pollRunStatus(connection, 42)).toEqual({ completed: false, message: expect.stringContaining('in attesa') });
  expect(request).toHaveBeenCalledTimes(1);
});


test('distinguishes an inaccessible repository from a missing configuration', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response('', { status: 404 }));
  vi.stubGlobal('fetch', request);
  await expect(new BotConfigRepository().load(connection)).rejects.toThrow('verifica che il token GitHub includa proprio questa copia');
  expect(request).toHaveBeenCalledTimes(2);
});

test('identifies an incorrect branch after confirming repository access', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response('', { status: 404 }));
  vi.stubGlobal('fetch', request);
  await expect(new BotConfigRepository().load(connection)).rejects.toThrow('il branch main non esiste');
  expect(request.mock.calls[2][0]).toBe('https://api.github.com/repos/owner/bot/branches/main');
});

test('reports an incompatible bot copy only after confirming repository and branch access', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', request);
  await expect(new BotConfigRepository().load(connection)).rejects.toThrow('manca bot_config.json');
  expect(request.mock.calls.every(call => !call[1].method)).toBe(true);
});


test('explains loading permissions without asking for Actions permission', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 })));
  const error = await new BotConfigRepository().load(connection).catch(error => error);
  expect(error.message).toContain('Resource owner');
  expect(error.message).toContain('repository del BOT');
  expect(error.message).toContain('Contents → Read');
  expect(error.message).not.toContain('Actions');
});

test('distinguishes rate limits from missing permissions', async () => {
  for (const response of [
    new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit' }), { status: 403 }),
    new Response('', { status: 429 }),
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(new BotConfigRepository().load(connection)).rejects.toThrow('non serve cambiare il token');
  }
});

test('explains Actions permission only when dispatching a poll', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
  await expect(new BotConfigRepository().startPoll(connection)).rejects.toThrow('Actions → Read and write');
});


test('accepts twelve answers and rejects thirteen', () => {
  const config = { ...sample, OPTIONS: ['Non posso', ...Array.from({ length: 11 }, (_, i) => `Giorno ${i}`)] };
  expect(() => validateConfig(config)).not.toThrow();
  expect(() => validateConfig({ ...config, OPTIONS: [...config.OPTIONS, 'Troppa'] })).toThrow('da 2 a 12');
});


test('validates weekly scheduling while keeping older configurations readable', () => {
  expect(() => validateConfig(sample)).not.toThrow();
  expect(() => validateConfig({ ...sample, SCHEDULE: DEFAULT_SCHEDULE })).not.toThrow();
  for (const patch of [
    { weekday: 7 }, { weekday: -1 }, { time: '24:00' }, { time: '9:30' },
    { first_poll_hours: 0 }, { tiebreak_hours: 1.5 },
    { first_poll_hours: 160, tiebreak_hours: 8 }, { timezone: 'UTC' },
  ]) expect(() => validateConfig({ ...sample, SCHEDULE: { ...DEFAULT_SCHEDULE, ...patch } })).toThrow();
});
