import { Component, computed, inject, signal } from '@angular/core';
import { Pressable, Text, TextInput, View, type LayoutEvent } from '@ng-native/components';
import { Keyboard } from '@ng-native/device';
import { NgIcon } from '@ng-native/icons';
import { provideIcons } from '@ng-icons/core';
import { heroTrash } from '@ng-icons/heroicons/outline';
import { BotEditor } from '../../services/bot-editor';
import { OptionDrag } from '../../services/option-drag';
import { ReorderHandle } from './reorder-handle';

interface RowFrame { y: number; height: number; }
interface DraggedOption {
  from: number;
  pointerY: number;
  scrollY: number;
  frames: RowFrame[];
  options: string[];
}

@Component({
  selector: 'poll-options',
  imports: [Pressable, Text, TextInput, View, ReorderHandle, NgIcon],
  providers: [provideIcons({ heroTrash })],
  templateUrl: './poll-options.html',
  styleUrls: ['../../styles/ui.css', './poll-options.css'],
})
export class PollOptions {
  readonly editor = inject(BotEditor);
  readonly drag = inject(OptionDrag);
  private readonly keyboard = inject(Keyboard);
  readonly dragging = signal<DraggedOption | null>(null);
  private readonly frames = new Map<number, RowFrame>();
  readonly actions = [
    { name: 'moveUp', label: 'Sposta prima' },
    { name: 'moveDown', label: 'Sposta dopo' },
  ];
  readonly offset = computed(() => {
    const state = this.dragging();
    if (!state) return 0;
    const source = state.frames[state.from];
    const last = state.frames[state.frames.length - 1];
    const delta = this.drag.pointerY() - state.pointerY + this.drag.scrollY() - state.scrollY;
    return Math.max(state.frames[0].y - source.y,
      Math.min(last.y + last.height - source.height - source.y, delta));
  });
  readonly target = computed(() => {
    const state = this.dragging();
    if (!state) return -1;
    const source = state.frames[state.from];
    const center = source.y + source.height / 2 + this.offset();
    let target = state.from;
    let distance = Infinity;
    state.frames.forEach((frame, index) => {
      const next = Math.abs(center - (frame.y + frame.height / 2));
      if (next < distance) { target = index; distance = next; }
    });
    return target;
  });

  measure(index: number, event: LayoutEvent) {
    const { y, height } = event.nativeEvent.layout;
    if (Number.isFinite(y) && height > 0) this.frames.set(index, { y, height });
  }

  start(from: number, y: number) {
    if (this.editor.busy() || this.drag.active()) return;
    const options = this.editor.participationOptions();
    if (options.length < 2) return;
    const frames = options.map(option => this.frames.get(option.index));
    if (frames.some(frame => !frame)) return;
    this.keyboard.dismiss();
    this.dragging.set({ from, pointerY: y, scrollY: this.drag.scrollY(),
      frames: frames as RowFrame[], options: this.editor.draft()!.OPTIONS });
    this.drag.begin(y, direction => {
      const state = this.dragging();
      if (!state) return false;
      const source = state.frames[state.from];
      const last = state.frames[state.frames.length - 1];
      return direction < 0 ? this.offset() > state.frames[0].y - source.y
        : this.offset() < last.y + last.height - source.height - source.y;
    });
  }

  move(y: number) { if (this.dragging()) this.drag.pointerY.set(y); }

  rowStyle(index: number) {
    const state = this.dragging();
    if (!state) return { transform: 'translateY(0px)', zIndex: 0 };
    let offset = 0;
    if (index === state.from) offset = this.offset();
    else {
      const source = state.frames[state.from];
      const next = state.frames[state.from + 1];
      const previous = state.frames[state.from - 1];
      const gap = next ? next.y - source.y - source.height
        : previous ? source.y - previous.y - previous.height : 12;
      const stride = source.height + gap;
      if (state.from < index && index <= this.target()) offset = -stride;
      if (this.target() <= index && index < state.from) offset = stride;
    }
    return { transform: `translateY(${offset}px)`, zIndex: index === state.from ? 10 : 0 };
  }

  finish(cancelled = false) {
    const state = this.dragging();
    if (!state) return;
    if (!cancelled && state.options === this.editor.draft()?.OPTIONS)
      this.editor.reorderOptions(state.from, this.target());
    this.dragging.set(null);
    this.drag.end();
  }

  accessibleMove(index: number, event: { nativeEvent: { actionName: string } }) {
    if (this.drag.active()) return;
    const action = event.nativeEvent.actionName;
    if (action === 'moveUp') this.editor.reorderOptions(index, index - 1);
    if (action === 'moveDown') this.editor.reorderOptions(index, index + 1);
  }

  ngOnDestroy() { this.finish(true); }
}
