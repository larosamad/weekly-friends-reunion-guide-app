import { Directive, ElementRef, inject, input, output } from '@angular/core';
import { HostEngine, type HostNode, type ResponderEvent } from '@ng-native/fabric';

/** A long hold claims the drag; a quick movement remains a normal page scroll. */
@Directive({ selector: '[reorderHandle]' })
export class ReorderHandle {
  readonly blocked = input(false);
  readonly dragStart = output<number>();
  readonly dragMove = output<number>();
  readonly dragEnd = output<void>();
  readonly dragCancel = output<void>();
  private readonly engine = inject(HostEngine);
  private readonly node = inject<ElementRef<HostNode>>(ElementRef).nativeElement;
  private stop?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private origin = { x: 0, y: 0 };
  private holding = false;

  ngOnInit() {
    this.stop = this.engine.setResponder(this.node, {
      onStartShouldSetResponder: () => !this.blocked(),
      onResponderGrant: event => this.grant(event),
      onResponderMove: event => this.move(event),
      onResponderRelease: () => this.finish(false),
      onResponderTerminate: () => this.finish(true),
      onResponderTerminationRequest: () => !this.holding,
    });
  }

  private grant(event: ResponderEvent) {
    this.clearTimer();
    this.origin = { x: event.nativeEvent.pageX ?? 0, y: event.nativeEvent.pageY ?? 0 };
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.blocked()) return;
      this.holding = true;
      this.dragStart.emit(this.origin.y);
    }, 450);
  }

  private move(event: ResponderEvent) {
    if (this.blocked()) { this.finish(true); return; }
    const x = event.nativeEvent.pageX ?? this.origin.x;
    const y = event.nativeEvent.pageY ?? this.origin.y;
    if (this.holding) this.dragMove.emit(y);
    else if (Math.hypot(x - this.origin.x, y - this.origin.y) > 8) this.clearTimer();
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private finish(cancelled: boolean) {
    this.clearTimer();
    if (!this.holding) return;
    this.holding = false;
    if (cancelled) this.dragCancel.emit();
    else this.dragEnd.emit();
  }

  ngOnDestroy() {
    this.finish(true);
    this.stop?.();
  }
}
