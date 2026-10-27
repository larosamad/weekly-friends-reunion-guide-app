import { cleanup, render, screen, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../app';
import { SetupGuide } from './setup-guide';
import { findGroupIds, SETUP_STORAGE, type SetupState } from '../../services/setup-progress';
import { BotConfigRepository } from '../../services/bot-config';
import { TelegramSetup } from '../../services/telegram-setup';

afterEach(cleanup);
const state: SetupState = {
  step: 0, completed: false, botUsername: '', chatId: '', owner: 'amici', repo: 'bot', branch: 'main',
};
const connection = { owner: 'amici', repo: 'bot', branch: 'main', token: 'secret-github-token' };

test('new user enters the guide and must supply a bot username', async () => {
  let saved = '';
  await render(App, { providers: [{ provide: SETUP_STORAGE, useValue: {
    read: () => null, write: (value: string) => { saved = value; },
  } }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Configura un nuovo bot' }));
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 1 DI 6')).toBeTruthy();
  await user.type(screen.getByLabelText('Username del bot'), 'reunion_test_bot');
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 2 DI 6')).toBeTruthy();
  expect(JSON.parse(saved).step).toBe(1);
  expect(JSON.parse(saved).botUsername).toBe('reunion_test_bot');
});

test('resumes saved progress and keeps tokens out of storage', async () => {
  let saved = '';
  await render(App, { providers: [{ provide: SETUP_STORAGE, useValue: {
    read: () => JSON.stringify({ ...state, step: 2, botUsername: 'reunion_test_bot' }),
    write: (value: string) => { saved = value; },
  } }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Riprendi la configurazione' }));
  expect(screen.getByText('PASSAGGIO 3 DI 6')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Ho già il codice del gruppo' }));
  await user.type(screen.getByLabelText('CHAT_ID del gruppo'), '-100123');
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(JSON.parse(saved).chatId).toBe('-100123');
  await user.press(screen.getByRole('button', { name: 'Torna alla home' }));
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.type(screen.getByLabelText('Token GitHub'), 'secret-github-token');
  expect(saved).not.toContain('secret-github-token');
  expect(Object.keys(JSON.parse(saved)).sort()).toEqual(Object.keys(state).sort());
});

test('extracts only groups and deduplicates them', () => {
  const group = { id: -100123, title: 'Amici', type: 'supergroup' };
  expect(findGroupIds(JSON.stringify({ ok: true, result: [
    { message: { chat: { id: 42, type: 'private' } } },
    { my_chat_member: { chat: group } }, { message: { chat: group } },
  ] }))).toEqual([{ id: '-100123', title: 'Amici' }]);
  expect(() => findGroupIds('{"ok":false}')).toThrow();
});

test('test dispatch requires confirmation and does not claim delivery', async () => {
  const startPoll = vi.fn().mockResolvedValue(undefined);
  await render(SetupGuide, {
    inputs: { connection, configured: true },
    providers: [
      { provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ ...state, step: 5, chatId: '-100123' }), write: () => {} } },
      { provide: BotConfigRepository, useValue: { startPoll } },
    ],
  });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Invia un sondaggio di prova nel gruppo' }));
  expect(startPoll).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Conferma e avvia il workflow' }));
  await screen.findByText('Richiesta accettata da GitHub. Controlla l’esito in Actions e nel gruppo Telegram.');
  expect(startPoll).toHaveBeenCalledExactlyOnceWith(connection);
});

test('personalization requires a loaded saved configuration', async () => {
  const result = await render(SetupGuide, {
    inputs: { connection, configured: false },
    providers: [{ provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ ...state, step: 4 }), write: () => {} } }],
  });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 5 DI 6')).toBeTruthy();
  await result.rerender({ inputs: { configured: true } });
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 6 DI 6')).toBeTruthy();
});

test('finds groups without URLs or JSON and lets the user select one', async () => {
  const findGroups = vi.fn().mockResolvedValue([{ id: '-100456', title: 'Amici del cinema' }]);
  let saved = '';
  await render(SetupGuide, {
    inputs: { connection },
    providers: [
      { provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ ...state, step: 2, botUsername: 'reunion_test_bot' }), write: (raw: string) => { saved = raw; } } },
      { provide: TelegramSetup, useValue: { prepareGroups: vi.fn().mockResolvedValue([]), findGroups } },
    ],
  });
  const user = userEvent.setup();
  expect(screen.queryByText('https://api.telegram.org/botIL_TUO_TOKEN/getUpdates')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cerca il mio gruppo' })).toBeNull();
  await user.type(screen.getByLabelText('Token Telegram di BotFather'), '123:private-token');
  await user.press(screen.getByRole('button', { name: 'Prepara il bot' }));
  await screen.findByText('2. Invia il comando nel gruppo');
  await user.press(screen.getByRole('button', { name: 'Cerca il mio gruppo' }));
  await screen.findByText('Amici del cinema');
  expect(findGroups).toHaveBeenCalledExactlyOnceWith('123:private-token', 'reunion_test_bot');
  await user.press(screen.getByRole('button', { name: 'Seleziona Amici del cinema' }));
  expect(JSON.parse(saved).chatId).toBe('-100456');
  expect(saved).not.toContain('private-token');
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 4 DI 6')).toBeTruthy();
});

test('empty group search explains how to retry', async () => {
  await render(SetupGuide, {
    inputs: { connection },
    providers: [
      { provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ ...state, step: 2 }), write: () => {} } },
      { provide: TelegramSetup, useValue: { prepareGroups: vi.fn().mockResolvedValue([]), findGroups: vi.fn().mockResolvedValue([]) } },
    ],
  });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Token Telegram di BotFather'), '123:token');
  await user.press(screen.getByRole('button', { name: 'Prepara il bot' }));
  await screen.findByText('2. Invia il comando nel gruppo');
  await user.press(screen.getByRole('button', { name: 'Cerca il mio gruppo' }));
  await screen.findByText('Il gruppo non compare ancora?');
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 3 DI 6')).toBeTruthy();
});


test('offers already available groups during preparation and invalidates preparation when the token changes', async () => {
  const prepareGroups = vi.fn().mockResolvedValue([{ id: '-100456', title: 'Amici del cinema' }]);
  await render(SetupGuide, {
    inputs: { connection },
    providers: [
      { provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ ...state, step: 2, botUsername: 'reunion_test_bot' }), write: () => {} } },
      { provide: TelegramSetup, useValue: { prepareGroups } },
    ],
  });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Token Telegram di BotFather'), '123:token');
  await user.press(screen.getByRole('button', { name: 'Prepara il bot' }));
  await screen.findByText('Amici del cinema');
  expect(prepareGroups).toHaveBeenCalledWith('123:token', 'reunion_test_bot');
  await user.type(screen.getByLabelText('Token Telegram di BotFather'), 'x');
  expect(screen.queryByText('Amici del cinema')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cerca il mio gruppo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Prepara il bot' })).toBeTruthy();
});
