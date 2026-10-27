import { afterEach, expect, test, vi } from 'vitest';
import { TelegramSetup } from './telegram-setup';

afterEach(() => vi.unstubAllGlobals());
const response = (result: unknown) => new Response(JSON.stringify({ ok: true, result }));

test('checks bot identity and webhook then reads groups without acknowledging updates', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
    .mockResolvedValueOnce(response({ url: '' }))
    .mockResolvedValueOnce(response([{ message: { chat: { id: -10042, title: 'Cinema', type: 'supergroup' } } }]));
  vi.stubGlobal('fetch', request);
  expect(await new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).toEqual([{ id: '-10042', title: 'Cinema' }]);
  expect(request.mock.calls.map(call => call[0])).toEqual([
    'https://api.telegram.org/bot123:token/getMe',
    'https://api.telegram.org/bot123:token/getWebhookInfo',
    'https://api.telegram.org/bot123:token/getUpdates',
  ]);
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ timeout: 0 });
});

test('does not read updates belonging to a different bot', async () => {
  const request = vi.fn().mockResolvedValue(response({ username: 'other_bot' }));
  vi.stubGlobal('fetch', request);
  await expect(new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).rejects.toThrow('altro bot');
  expect(request).toHaveBeenCalledTimes(1);
});

test('does not modify an existing webhook', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
    .mockResolvedValueOnce(response({ url: 'https://example.com/webhook' }));
  vi.stubGlobal('fetch', request);
  await expect(new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).rejects.toThrow('altro servizio');
  expect(request).toHaveBeenCalledTimes(2);
});

test('never exposes the token in a network error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed https://api.telegram.org/bot123:private-token/getMe')));
  await expect(new TelegramSetup().findGroups('123:private-token', 'reunion_test_bot')).rejects.toThrow('Controlla la connessione');
});


test('enables group messages while preserving existing subscriptions and pending updates', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
    .mockResolvedValueOnce(response({ url: '', allowed_updates: ['poll', 'poll_answer'] }))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', request);
  await expect(new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).rejects.toThrow('ora è abilitata');
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({
    timeout: 0,
    allowed_updates: ['poll', 'poll_answer', 'message', 'my_chat_member'],
  });
});

test('distinguishes an empty queue from private-chat events', async () => {
  for (const [updates, message] of [
    [[], 'non ha restituito messaggi'],
    [[{ message: { chat: { id: 123, type: 'private' } } }], 'nessuno identifica un gruppo'],
  ] as const) {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
      .mockResolvedValueOnce(response({ url: '' }))
      .mockResolvedValueOnce(response(updates)));
    await expect(new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).rejects.toThrow(message);
  }
});


test('automatically retries native cancellation without requiring another command', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
    .mockResolvedValueOnce(response({ url: '' }))
    .mockRejectedValueOnce(new Error('fetch failed: fetch request has been canceled'))
    .mockResolvedValueOnce(response([{ message: { chat: { id: -10042, title: 'Cinema', type: 'supergroup' } } }]));
  vi.stubGlobal('fetch', request);
  expect(await new TelegramSetup().findGroups('123:token', 'reunion_test_bot')).toEqual([{ id: '-10042', title: 'Cinema' }]);
  expect(request).toHaveBeenCalledTimes(4);
});

test('never leaks a native cancellation or token after retry fails', async () => {
  const request = vi.fn().mockRejectedValue(new Error('fetch failed: fetch request has been canceled https://api.telegram.org/bot123:private-token/getMe'));
  vi.stubGlobal('fetch', request);
  await expect(new TelegramSetup().findGroups('123:private-token', 'reunion_test_bot')).rejects.toThrow('Connessione a Telegram interrotta');
  expect(request).toHaveBeenCalledTimes(2);
});

test('prepares reception before a command even when no group event exists yet', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(response({ username: 'reunion_test_bot' }))
    .mockResolvedValueOnce(response({ url: '', allowed_updates: ['poll_answer'] }))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', request);
  expect(await new TelegramSetup().prepareGroups('123:token', 'reunion_test_bot')).toEqual([]);
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ timeout: 0, allowed_updates: ['poll_answer', 'message', 'my_chat_member'] });
});
