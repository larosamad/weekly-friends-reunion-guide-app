import { Component, ElementRef, inject, input, output } from '@angular/core';
import { keepNativeView, type NativeSyntheticEvent } from '@ng-native/fabric';

/** Typed host for Expo UI's Android Material time dialog. */
@Component({
  selector: 'ui-time-picker-dialog',
  template: '',
  host: {
    '[initialDate]': 'initialDate()',
    '[is24Hour]': 'true',
    '[confirmButtonLabel]': "'Conferma'",
    '[dismissButtonLabel]': "'Annulla'",
  },
})
export class TimePickerDialog {
  readonly initialDate = input.required<number>();
  readonly dateSelected = output<NativeSyntheticEvent<{ date: number | null }>>();
  readonly dismissRequest = output<void>();

  constructor() { keepNativeView(inject(ElementRef).nativeElement); }
}
