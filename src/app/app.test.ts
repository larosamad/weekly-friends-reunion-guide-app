import { cleanup, render, screen, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './app';
import { SETUP_STORAGE } from './services/setup-progress';
import { BotConfigRepository, type BotConfig } from './services/bot-config';

afterEach(cleanup);
const config: BotConfig = {
  OPTIONS: ['Non posso', 'Lunedì sera'], EXCLUDED_OPTION: 'Non posso', MIN_TIEBREAK_VOTES: 3,
  FIRST_POLL_QUESTION: 'Che giorno preferite?', TIEBREAK_QUESTION: 'Spareggio?', GROUP_NAME: 'Ciccini',
};

test('loads configuration, edits a native field and saves it', async () => {
  const repository = {
    load: vi.fn().mockResolvedValue({ config, sha: 'old' }),
    save: vi.fn().mockResolvedValue('new'),
  };
  await render(App, { providers: [{ provide: BotConfigRepository, useValue: repository }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Configurazione caricata da GitHub.');
  await user.type(screen.getByLabelText('Nome del gruppo'), ' amici');
  await user.press(screen.getByRole('button', { name: 'Salva su GitHub' }));
  await screen.findByText('Configurazione salvata. Sarà letta alla prossima esecuzione del bot.');
  expect(repository.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ GROUP_NAME: 'Ciccini amici' }), 'old');
});

test('shows load errors without enabling configuration editing', async () => {
  await render(App, { providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockRejectedValue(new Error('Token non valido.')),
  } }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Token non valido.');
  expect(screen.queryByText('Sondaggio settimanale')).toBeNull();
});


test('shares the editor between management and setup without losing unsaved changes', async () => {
  const load = vi.fn().mockResolvedValue({ config, sha: 'old' });
  const save = vi.fn().mockResolvedValue('new');
  await render(App, { providers: [
    { provide: BotConfigRepository, useValue: { load, save } },
    { provide: SETUP_STORAGE, useValue: {
      read: () => JSON.stringify({ step: 4, completed: false, botUsername: 'reunion_test_bot', chatId: '-100123', owner: 'amici', repo: 'bot', branch: 'main' }),
      write: () => {},
    } },
  ] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.type(screen.getByLabelText('Token GitHub'), 'session-token');
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Configurazione caricata da GitHub.');
  await user.type(screen.getByLabelText('Nome del gruppo'), ' amici');
  await user.press(screen.getByRole('button', { name: 'Torna alla home' }));
  await user.press(screen.getByRole('button', { name: 'Riprendi la configurazione' }));
  expect(screen.getByLabelText('Nome del gruppo')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 5 DI 6')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Salva su GitHub' }));
  await screen.findByText('Configurazione salvata. Sarà letta alla prossima esecuzione del bot.');
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'session-token' }),
    expect.objectContaining({ GROUP_NAME: 'Ciccini amici' }),
    'old',
  );
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 6 DI 6')).toBeTruthy();
});


test('restarts setup only after confirmation and persists the cleared progress', async () => {
  let saved = JSON.stringify({ step: 4, completed: false, botUsername: 'old_bot', chatId: '-100123', owner: 'amici', repo: 'bot', branch: 'main' });
  await render(App, { providers: [
    { provide: SETUP_STORAGE, useValue: { read: () => saved, write: (value: string) => { saved = value; } } },
  ] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.type(screen.getByLabelText('Token GitHub'), 'session-token');
  await user.press(screen.getByRole('button', { name: 'Torna alla home' }));
  await user.press(screen.getByRole('button', { name: 'Ricomincia la configurazione' }));
  await user.press(screen.getByRole('button', { name: 'Annulla' }));
  expect(JSON.parse(saved).step).toBe(4);
  await user.press(screen.getByRole('button', { name: 'Ricomincia la configurazione' }));
  await user.press(screen.getByRole('button', { name: 'Conferma e ricomincia' }));
  expect(screen.getByText('PASSAGGIO 1 DI 6')).toBeTruthy();
  expect(JSON.parse(saved)).toEqual({ step: 0, completed: false, botUsername: '', chatId: '', owner: '', repo: 'weekly-friends-reunion-telegram-poll-bot', branch: 'main' });
});


test('guides personalization from GitHub fields to continuing with unchanged settings', async () => {
  const load = vi.fn().mockResolvedValue({ config, sha: 'old' });
  const save = vi.fn();
  await render(App, { providers: [
    { provide: BotConfigRepository, useValue: { load, save } },
    { provide: SETUP_STORAGE, useValue: {
      read: () => JSON.stringify({ step: 4, completed: false, botUsername: 'reunion_test_bot', chatId: '-100123', owner: 'amici', repo: 'bot', branch: 'main' }),
      write: () => {},
    } },
  ] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Riprendi la configurazione' }));
  expect(screen.getByText('1. Collega la tua copia GitHub')).toBeTruthy();
  expect(screen.getByText(/Il nome che compare dopo github.com/)).toBeTruthy();
  expect(screen.queryByLabelText('Branch')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 5 DI 6')).toBeTruthy();
  await user.type(screen.getByLabelText('Token GitHub'), 'session-token');
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('2. Personalizza il sondaggio');
  expect(screen.queryByLabelText('Token GitHub')).toBeNull();
  expect(screen.getByRole('button', { name: 'Modifica collegamento GitHub' })).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 6 DI 6')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
