import { cleanup, fireEvent, render, screen, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './app';
import { SETUP_STORAGE } from './services/setup-progress';
import { OS } from '@ng-native/device';
import { BotConfigRepository, validateConfig, type BotConfig } from './services/bot-config';

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
  expect(screen.queryByRole('button', { name: 'Salva su GitHub' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  await screen.findByText('PASSAGGIO 6 DI 6');
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'session-token' }),
    expect.objectContaining({ GROUP_NAME: 'Ciccini amici' }),
    'old',
  );
  expect(screen.getByText('PASSAGGIO 6 DI 6')).toBeTruthy();
});

test('Continue stays on personalization while saving and after an error, then advances on retry', async () => {
  let rejectSave!: (error: Error) => void;
  const save = vi.fn()
    .mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { rejectSave = reject; }))
    .mockResolvedValueOnce('new');
  await render(App, { providers: [
    { provide: BotConfigRepository, useValue: { load: vi.fn().mockResolvedValue({ config, sha: 'old' }), save } },
    { provide: SETUP_STORAGE, useValue: { read: () => JSON.stringify({ step: 4 }), write: () => {} } },
  ] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Riprendi la configurazione' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('2. Personalizza il sondaggio');
  await user.type(screen.getByLabelText('Nome del gruppo'), ' nuovi');
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  expect(screen.getByText('PASSAGGIO 5 DI 6')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Salvataggio…' }));
  expect(save).toHaveBeenCalledTimes(1);
  rejectSave(new Error('Salvataggio rifiutato da GitHub.'));
  await screen.findByText('Salvataggio rifiutato da GitHub.');
  expect(screen.getByText('PASSAGGIO 5 DI 6')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Continua' }));
  await screen.findByText('PASSAGGIO 6 DI 6');
  expect(save).toHaveBeenCalledTimes(2);
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


test('edits the nonparticipation answer once and automatically includes it when saving', async () => {
  const save = vi.fn().mockResolvedValue('new');
  await render(App, { providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockResolvedValue({ config, sha: 'old' }), save,
  } }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Configurazione caricata da GitHub.');
  expect(screen.getByLabelText('Opzione 1')).toBeTruthy();
  expect(screen.queryByLabelText('Opzione 2')).toBeNull();
  expect(screen.getByText('Risposte per chi partecipa (da 1 a 11)')).toBeTruthy();
  const answer = screen.getByLabelText('Risposta per chi non partecipa');
  await user.clear(answer);
  await user.type(answer, 'Non ci sono');
  await user.press(screen.getByRole('button', { name: 'Salva su GitHub' }));
  await screen.findByText('Configurazione salvata. Sarà letta alla prossima esecuzione del bot.');
  expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    EXCLUDED_OPTION: 'Non ci sono', OPTIONS: ['Non ci sono', 'Lunedì sera'],
  }), 'old');
});


test.each(['android', 'ios'])('confirms or cancels the time dialog and saves the schedule on %s', async platform => {
  const save = vi.fn().mockImplementation(async (_connection, config) => { validateConfig(config); return 'new'; });
  await render(App, { providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockResolvedValue({ config, sha: 'old' }), save,
  } }, { provide: OS, useValue: platform }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Configurazione caricata da GitHub.');
  expect(screen.getByText('Ogni domenica alle 11:07 (ora italiana)')).toBeTruthy();
  expect(screen.queryByTestId('schedule-time')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Giorno: Domenica' }));
  await user.press(screen.getByRole('radio', { name: 'Venerdì' }));
  expect(screen.queryByRole('radio', { name: 'Lunedì' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Ora: 11:07' }));
  const date = new Date(2026, 0, 5, 18, 30);
  if (platform === 'android') {
    expect(screen.getByTestId('schedule-time').props.elementColors).toMatchObject({
      selectorColor: '#22684c', timeSelectorSelectedContainerColor: '#22684c', timeSelectorSelectedContentColor: '#ffffff',
    });
    expect(screen.getByTestId('schedule-time').props.confirmButtonLabel).toBe('Conferma');
    expect(screen.getByTestId('schedule-time').props.dismissButtonLabel).toBe('Annulla');
    await fireEvent(screen.getByTestId('schedule-time'), 'dismissRequest', {});
  } else {
    await fireEvent(screen.getByTestId('schedule-time'), 'dateChange', { date: date.toISOString() });
    expect(screen.getByRole('button', { name: 'Ora: 11:07' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Annulla' }));
  }
  expect(screen.queryByTestId('schedule-time')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Ora: 11:07' }));
  if (platform === 'android') {
    await fireEvent(screen.getByTestId('schedule-time'), 'dateSelected', { date: date.getTime() });
  } else {
    await fireEvent(screen.getByTestId('schedule-time'), 'dateChange', { date: date.toISOString() });
    await user.press(screen.getByRole('button', { name: 'Conferma' }));
  }
  expect(screen.queryByTestId('schedule-time')).toBeNull();
  await screen.findByText('Ogni venerdì alle 18:30 (ora italiana)');
  expect(screen.queryByLabelText('Durata del primo sondaggio (ore)')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Durata dei sondaggi' }));
  const hours = screen.getByLabelText('Durata del primo sondaggio (ore)');
  await user.clear(hours);
  await user.type(hours, '168');
  await user.press(screen.getByRole('button', { name: 'Salva su GitHub' }));
  await screen.findByText('Le durate devono essere ore intere positive, per un totale inferiore a 168 ore.');
  await user.clear(hours);
  await user.type(hours, '24');
  await user.press(screen.getByRole('button', { name: 'Salva su GitHub' }));
  await screen.findByText('Configurazione salvata. Sarà letta alla prossima esecuzione del bot.');
  expect(save).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ SCHEDULE: {
    weekday: 4, time: '18:30', timezone: 'Europe/Rome', first_poll_hours: 24, tiebreak_hours: 8,
  } }), 'old');
});
