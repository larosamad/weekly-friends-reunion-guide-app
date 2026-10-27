import { Directive, inject } from '@angular/core';
import { OS } from '@ng-native/device';
import { declareNativeProps } from '@ng-native/fabric';

// UiDatePicker's typed wrapper does not yet expose Compose's color overrides.
declareNativeProps('ui-date-picker', ['elementColors']);
declareNativeProps('ui-time-picker-dialog', ['elementColors', 'color']);

@Directive({
  selector: 'ui-date-picker[androidPickerTheme], ui-time-picker-dialog[androidPickerTheme]',
  host: { '[elementColors]': 'colors', '[color]': 'accent' },
})
export class AndroidPickerTheme {
  readonly accent = inject(OS) === 'android' ? '#22684c' : undefined;
  readonly colors = inject(OS) === 'android' ? {
    selectorColor: '#22684c',
    timeSelectorSelectedContainerColor: '#22684c',
    timeSelectorSelectedContentColor: '#ffffff',
    clockDialSelectedContentColor: '#ffffff',
    clockDialColor: '#f5f5f5',
    clockDialContentColor: '#252525',
    timeSelectorContainerColor: '#f5f5f5',
    timeSelectorContentColor: '#252525',
  } : undefined;
}
