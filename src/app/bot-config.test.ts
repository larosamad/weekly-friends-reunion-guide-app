import { afterEach, expect, test, vi } from 'vitest';
import { BotConfigRepository, encodeConfig, validateConfig, type BotConfig } from './bot-config';

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
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  await new BotConfigRepository().startPoll(connection);
  expect(request.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/bot/actions/workflows/telegram-poll.yml/dispatches');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ ref: 'main', inputs: { mode: 'start' } });
});
