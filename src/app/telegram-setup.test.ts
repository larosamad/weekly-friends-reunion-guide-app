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
  expect(request.mock.calls[2][1].body).toBeUndefined();
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
