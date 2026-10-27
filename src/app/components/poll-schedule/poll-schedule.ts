import { Component, computed, inject, signal } from '@angular/core';
import { Modal, Pressable, Text, TextInput, View } from '@ng-native/components';
import { OS } from '@ng-native/device';
import { UiDatePicker, UiHost } from '@ng-native/expo/expo-ui-components';
import { BotEditor } from '../../services/bot-editor';
import { AndroidPickerTheme } from './android-picker-theme';
import { TimePickerDialog } from './time-picker-dialog';

@Component({
  selector: 'poll-schedule',
  imports: [Modal, Pressable, Text, TextInput, View, UiDatePicker, UiHost, AndroidPickerTheme, TimePickerDialog],
  templateUrl: './poll-schedule.html',
  styleUrls: ['../../styles/ui.css', './poll-schedule.css'],
})
export class PollSchedule {
  readonly editor = inject(BotEditor);
  readonly android = inject(OS) === 'android';
  readonly pendingTime = signal<Date | null>(null);
  readonly durationsOpen = signal(false);
  readonly picker = signal<'day' | 'time' | null>(null);
  readonly days = this.editor.weekdays.map((label, value) => ({ label, value }));
  readonly time = computed(() => {
    const [hours, minutes] = this.editor.schedule().time.split(':').map(Number);
    // Only the wall-clock time is saved; the date anchors the native control.
    return new Date(2026, 0, 5, hours, minutes);
  });
  setDay(day: string | number | null) {
    if (typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6) {
      this.editor.setSchedule({ weekday: day });
      this.picker.set(null);
    }
  }
  openTime() {
    if (this.editor.busy()) return;
    this.pendingTime.set(new Date(this.time().getTime()));
    this.picker.set('time');
  }
  confirmTime(date = this.pendingTime()) {
    if (this.editor.busy()) return;
    this.setTime(date);
    this.picker.set(null);
  }
  confirmAndroidTime(timestamp: number | null) {
    if (timestamp !== null) this.confirmTime(new Date(timestamp));
    else this.picker.set(null);
  }
  setTime(date: Date | null) {
    if (!date || !Number.isFinite(date.getTime())) return;
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (time !== this.editor.schedule().time) this.editor.setSchedule({ time });
  }
}
