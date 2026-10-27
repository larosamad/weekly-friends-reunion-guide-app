import { cleanup, render, screen, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { DeepLinks } from '@ng-native/device';
import { GithubSetup } from './github-setup';
import { SETUP_STORAGE } from '../../services/setup-progress';

afterEach(cleanup);

test('reveals the required GitHub tasks one at a time', async () => {
  const open = vi.fn();
  await render(GithubSetup, { providers: [{ provide: SETUP_STORAGE, useValue: {
    read: () => JSON.stringify({ chatId: '-100123', owner: 'pomodorho' }), write: () => {},
  } }, { provide: DeepLinks, useValue: { open } }] });
  const user = userEvent.setup();
  expect(screen.queryByText('Nome: BOT_TOKEN')).toBeNull();
  expect(screen.queryByText('Repository permissions')).toBeNull();
  expect(screen.queryByText(/La copia deve includere/)).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Ho creato la copia →' }));
  expect(screen.getByText('Nome: BOT_TOKEN')).toBeTruthy();
  expect(screen.getByText('-100123')).toBeTruthy();
  expect(screen.queryByText(/La copia deve includere/)).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Ho salvato i due valori →' }));
  expect(screen.getByText(/Workflow permissions/)).toBeTruthy();
  expect(screen.getByText(/Enable workflow/)).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Apri il workflow della mia copia' }));
  expect(open).toHaveBeenCalledWith('https://github.com/pomodorho/weekly-friends-reunion-telegram-poll-bot/actions/workflows/telegram-poll.yml');
  await user.press(screen.getByRole('button', { name: 'Ho attivato le esecuzioni →' }));
  expect(screen.getByText('2. Scegli il tuo progetto')).toBeTruthy();
  expect(screen.getByText(/Only select repositories/)).toBeTruthy();
  expect(screen.getByText('Contents → Read and write')).toBeTruthy();
  expect(screen.getByText('Actions → Read and write')).toBeTruthy();
  expect(screen.getByText(/GitHub lo mostra una sola volta/)).toBeTruthy();
  await user.press(screen.getByRole('button', { name: '1. Crea la tua copia' }));
  expect(screen.getByRole('button', { name: 'Apri GitHub e crea la copia' })).toBeTruthy();
  expect(screen.queryByText('Repository permissions')).toBeNull();
});
