import { cleanup, injectService } from '@ng-native/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { BotEditor } from './bot-editor';
import { BotConfigRepository, DEFAULT_SCHEDULE, validateConfig } from './bot-config';
const sample = {
  OPTIONS: ['Non posso', 'Lunedì sera', 'Martedì sera'], EXCLUDED_OPTION: 'Non posso',
  MIN_TIEBREAK_VOTES: 3, FIRST_POLL_QUESTION: 'Quando ci vediamo?',
  TIEBREAK_QUESTION: 'Quale giorno?', GROUP_NAME: 'Amici',
};

afterEach(cleanup);

async function editorWith(options = sample.OPTIONS) {
  const save = vi.fn().mockResolvedValue('new');
  const editor = injectService(BotEditor, { providers: [{ provide: BotConfigRepository, useValue: {
    load: vi.fn().mockResolvedValue({ config: { ...sample, OPTIONS: [...options] }, sha: 'old' }), save,
  } }] });
  await editor.load();
  return { editor, save };
}

test('renames the nonparticipation answer in place and saves it exactly once', async () => {
  const options = ['Lunedì', 'Non posso', 'Martedì', ...Array.from({ length: 9 }, (_, i) => `Giorno ${i}`)];
  const { editor, save } = await editorWith(options);
  editor.setField('EXCLUDED_OPTION', 'Non ci sono');
  expect(editor.draft()?.OPTIONS).toEqual(options.map(o => o === 'Non posso' ? 'Non ci sono' : o));
  expect(editor.participationOptions()).toHaveLength(11);
  expect(() => validateConfig(editor.draft())).not.toThrow();
  await editor.save();
  expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ EXCLUDED_OPTION: 'Non ci sono', OPTIONS: expect.not.arrayContaining(['Non posso']) }), 'old');
});

test('updates visible options using their original indexes and protects the automatic answer', async () => {
  const { editor } = await editorWith();
  editor.setOption(editor.participationOptions()[0].index, 'Venerdì');
  expect(editor.draft()?.OPTIONS).toEqual(['Non posso', 'Venerdì', 'Martedì sera']);
  editor.removeOption(0);
  editor.setOption(0, 'Altro');
  expect(editor.draft()?.OPTIONS[0]).toBe('Non posso');
  editor.removeOption(2);
  editor.removeOption(1);
  expect(editor.draft()?.OPTIONS).toEqual(['Non posso', 'Venerdì']);
});

test('prevents collisions between the automatic answer and participating answers', async () => {
  const { editor } = await editorWith();
  editor.setField('EXCLUDED_OPTION', 'Lunedì sera');
  expect(editor.draft()?.EXCLUDED_OPTION).toBe('Non posso');
  editor.setOption(1, 'Non posso');
  expect(editor.draft()?.OPTIONS).toEqual(sample.OPTIONS);
});


test('allows adding up to twelve total answers and no more', async () => {
  const { editor } = await editorWith();
  while (editor.draft()!.OPTIONS.length < 12) {
    editor.addOption();
    editor.setOption(editor.draft()!.OPTIONS.length - 1, `Risposta ${editor.draft()!.OPTIONS.length}`);
  }
  editor.addOption();
  expect(editor.draft()?.OPTIONS).toHaveLength(12);
  expect(editor.participationOptions()).toHaveLength(11);
  expect(() => validateConfig(editor.draft())).not.toThrow();
});

test('reorders answers in both directions, retaining the automatic slot and rejecting invalid moves', async () => {
  const { editor } = await editorWith(['Lunedì', 'Non posso', 'Venerdì', 'Sabato']);
  for (const [from, to] of [[0, 0], [-1, 1], [1, 3], [0.5, 1]]) editor.reorderOptions(from, to);
  expect(editor.dirty()).toBe(false);
  editor.reorderOptions(0, 2);
  expect(editor.draft()?.OPTIONS).toEqual(['Venerdì', 'Non posso', 'Sabato', 'Lunedì']);
  editor.reorderOptions(2, 0);
  expect(editor.draft()?.OPTIONS).toEqual(['Lunedì', 'Non posso', 'Venerdì', 'Sabato']);
  editor.busy.set(true);
  editor.reorderOptions(0, 1);
  expect(editor.draft()?.OPTIONS).toEqual(['Lunedì', 'Non posso', 'Venerdì', 'Sabato']);
});


test('loads default weekly scheduling from old files and saves edited day, time and durations', async () => {
  const { editor, save } = await editorWith();
  expect(editor.schedule()).toEqual(DEFAULT_SCHEDULE);
  editor.setSchedule({ weekday: 4, time: '18:30' });
  editor.setDuration('first', '24');
  editor.setDuration('tiebreak', '12');
  await editor.save();
  expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ SCHEDULE: {
    weekday: 4, time: '18:30', timezone: 'Europe/Rome', first_poll_hours: 24, tiebreak_hours: 12,
  } }), 'old');
  expect(editor.scheduleSummary()).toContain('venerdì alle 18:30');
});
