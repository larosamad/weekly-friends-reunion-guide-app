import { Injectable, signal } from '@angular/core';

/** Shared by the option list and its scrolling page. Never persisted. */
@Injectable({ providedIn: 'root' })
export class OptionDrag {
  readonly active = signal(false);
  readonly pointerY = signal(0);
  readonly scrollY = signal(0);
  readonly contentHeight = signal(0);
  private canScroll: (direction: number) => boolean = () => true;

  begin(y: number, canScroll: (direction: number) => boolean = () => true) {
    this.canScroll = canScroll;
    this.pointerY.set(y);
    this.active.set(true);
  }

  allowsScroll(direction: number) { return this.active() && this.canScroll(direction); }

  end() {
    this.active.set(false);
    this.canScroll = () => true;
  }
}
