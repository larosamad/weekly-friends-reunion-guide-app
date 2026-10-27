import { cleanup, render, screen, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './app';
import { BotConfigRepository, type BotConfig } from './bot-config';

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
