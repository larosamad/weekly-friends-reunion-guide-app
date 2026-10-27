import { Directive, ElementRef, effect, inject } from '@angular/core';
import { ScrollView, type ScrollEvent } from '@ng-native/components';
import { HostEngine, type HostNode } from '@ng-native/fabric';
import { OptionDrag } from '../../services/option-drag';

/** Scroll the page while an option is held near its top or bottom edge. */
@Directive({ selector: '[optionDragScroll]', host: { '(scroll)': 'onScroll($event)' } })
export class OptionDragScroll {
  private readonly drag = inject(OptionDrag);
  private readonly scroll = inject(ScrollView, { self: true });
  private readonly engine = inject(HostEngine);
  private readonly node = inject<ElementRef<HostNode>>(ElementRef).nativeElement;

  constructor() {
    effect(onCleanup => {
      if (!this.drag.active()) return;
      const timer = setInterval(() => {
        this.engine.measure(this.node, frame => {
          if (!this.drag.active() || frame.height <= 0) return;
          const y = this.drag.pointerY();
          const edge = Math.min(64, frame.height / 4);
          const top = frame.y + edge;
          const bottom = frame.y + frame.height - edge;
          const speed = y < top ? -Math.min(14, (top - y) / 4)
            : y > bottom ? Math.min(14, (y - bottom) / 4) : 0;
          if (!speed || !this.drag.allowsScroll(speed)) return;
          const max = Math.max(0, this.drag.contentHeight() - frame.height);
          const next = Math.max(0, Math.min(max, this.drag.scrollY() + speed));
          if (next === this.drag.scrollY()) return;
          this.drag.scrollY.set(next);
          this.scroll.scrollTo({ y: next, animated: false });
        });
      }, 32);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected onScroll(event: ScrollEvent) {
    this.drag.scrollY.set(event.nativeEvent.contentOffset.y);
    this.drag.contentHeight.set(event.nativeEvent.contentSize.height);
  }
}
