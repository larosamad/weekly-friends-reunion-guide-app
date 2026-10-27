import { cleanup, compileCss, fireEvent, render, screen, settle, userEvent } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { PollOptions } from './poll-options';
import { App } from '../../app';
import { BotConfigRepository, type BotConfig } from '../../services/bot-config';

afterEach(cleanup);
const config: BotConfig = {
  OPTIONS: ['Lunedì', 'Non posso', 'Venerdì', 'Sabato'], EXCLUDED_OPTION: 'Non posso',
  GROUP_NAME: 'Amici', FIRST_POLL_QUESTION: 'Quando?', TIEBREAK_QUESTION: 'Quale?', MIN_TIEBREAK_VOTES: 3,
};
const payload = (y: number, end = false) => {
  const point = { pageX: 20, pageY: y, identifier: 0 };
  return { ...point, touches: end ? [] : [point], changedTouches: [point] };
};
const hold = async () => { await new Promise(resolve => setTimeout(resolve, 480)); await settle(); };

async function setup() {
  const save = vi.fn().mockResolvedValue('new');
  const globalStyles = compileCss(':root { --color-text: #252525; --color-text-muted: #737373; --color-primary: #22684c; --color-surface: #fff; --color-background: #f5f5f5; --color-border: #dedede; }');
  const result = await render(PollOptions, { globalStyles, providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockResolvedValue({ config: { ...config, OPTIONS: [...config.OPTIONS] }, sha: 'old' }), save,
  } }] });
  await result.instance.editor.load();
  await result.detectChanges();
  for (let i = 0; i < 3; i++)
    await fireEvent.layout(screen.getByTestId(`option-row-${i}`), { y: i * 68, height: 56, width: 300 });
  return { ...result, save };
}

test('long hold previews a drag and saves the new order without moving the automatic answer', async () => {
  const { instance, save } = await setup();
  const handle = screen.getByRole('button', { name: 'Sposta opzione 1' });
  await fireEvent(handle, 'touchStart', payload(100));
  await hold();
  expect(instance.drag.active()).toBe(true);
  await fireEvent(handle, 'touchMove', payload(236));
  expect(instance.target()).toBe(2);
  expect(screen.getByTestId('option-row-0').props).toMatchObject({ transform: [{ translateY: 136 }] });
  expect(screen.getByTestId('option-row-1').props).toMatchObject({ transform: [{ translateY: -68 }] });
  expect(instance.editor.draft()?.OPTIONS).toEqual(config.OPTIONS);
  expect(instance.editor.dirty()).toBe(false);
  await fireEvent(handle, 'touchEnd', payload(236, true));
  expect(instance.drag.active()).toBe(false);
  expect(instance.editor.draft()?.OPTIONS).toEqual(['Venerdì', 'Non posso', 'Sabato', 'Lunedì']);
  await instance.editor.save();
  expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    OPTIONS: ['Venerdì', 'Non posso', 'Sabato', 'Lunedì'], EXCLUDED_OPTION: 'Non posso',
  }), 'old');
});

test('a quick swipe remains scrolling and a cancelled drag preserves the original order', async () => {
  const { instance } = await setup();
  const handle = screen.getByRole('button', { name: 'Sposta opzione 3' });
  await fireEvent(handle, 'touchStart', payload(200));
  await fireEvent(handle, 'touchMove', payload(170));
  await hold();
  expect(instance.drag.active()).toBe(false);
  await fireEvent(handle, 'touchEnd', payload(170, true));
  await fireEvent(handle, 'touchStart', payload(200));
  await hold();
  await fireEvent(handle, 'touchMove', payload(64));
  expect(instance.target()).toBe(0);
  await fireEvent(handle, 'touchCancel', payload(64, true));
  expect(instance.drag.active()).toBe(false);
  expect(instance.editor.draft()?.OPTIONS).toEqual(config.OPTIONS);
  expect(instance.editor.dirty()).toBe(false);
});

test('screen reader actions reorder options and respect the boundaries', async () => {
  const { instance } = await setup();
  const handle = screen.getByRole('button', { name: 'Sposta opzione 1' });
  await fireEvent(handle, 'accessibilityAction', { actionName: 'moveUp' });
  expect(instance.editor.dirty()).toBe(false);
  await fireEvent(handle, 'accessibilityAction', { actionName: 'moveDown' });
  expect(instance.editor.draft()?.OPTIONS).toEqual(['Venerdì', 'Non posso', 'Lunedì', 'Sabato']);
});

test('leaving the list during a drag clears the shared scroll lock', async () => {
  const result = await setup();
  const handle = screen.getByRole('button', { name: 'Sposta opzione 1' });
  await fireEvent(handle, 'touchStart', payload(100));
  await hold();
  expect(result.instance.drag.active()).toBe(true);
  result.unmount();
  expect(result.instance.drag.active()).toBe(false);
});

test('auto scrolls near the page edge while holding and restores scrolling after cancellation', async () => {
  const options = ['Non posso', ...Array.from({ length: 11 }, (_, i) => `Risposta ${i + 1}`)];
  const result = await render(App, { providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockResolvedValue({ config: { ...config, OPTIONS: options }, sha: 'old' }),
  } }] });
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Gestisci un bot già configurato' }));
  await user.press(screen.getByRole('button', { name: 'Carica configurazione' }));
  await screen.findByText('Configurazione caricata da GitHub.');
  for (let i = 0; i < 11; i++)
    await fireEvent.layout(screen.getByTestId(`option-row-${i}`), { y: i * 68, height: 56, width: 300 });
  result.fabric.frames.set('main-scroll', { x: 0, y: 0, width: 350, height: 400 });
  const scroll = screen.getByTestId('main-scroll');
  await fireEvent.scroll(scroll, { contentOffset: { x: 0, y: 100 }, contentSize: { width: 350, height: 1200 } });
  const handle = screen.getByRole('button', { name: 'Sposta opzione 1' });
  await fireEvent(handle, 'touchStart', payload(200));
  await hold();
  expect(screen.getByTestId('main-scroll').props['scrollEnabled']).toBe(false);
  await fireEvent(handle, 'touchMove', payload(395));
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(result.instance.drag.scrollY()).toBeGreaterThan(100);
  expect(result.fabric.commands.some(command => command.name === 'scrollTo')).toBe(true);
  await fireEvent(handle, 'touchCancel', payload(395, true));
  expect(screen.getByTestId('main-scroll').props['scrollEnabled']).toBe(true);
  expect(result.instance.editor.draft()?.OPTIONS).toEqual(options);
});
