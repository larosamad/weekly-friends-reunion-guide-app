import { Component, inject, output, signal } from '@angular/core';
import { Pressable, Text, View } from '@ng-native/components';
import { BotEditor } from '../../services/bot-editor';
import { SetupProgress } from '../../services/setup-progress';
@Component({
  selector: 'home-page',
  imports: [Pressable, Text, View],
  templateUrl: './home.html',
  styleUrls: ['../../styles/ui.css', './home.css'],
})
export class HomePage {
  readonly editor = inject(BotEditor);
  readonly confirmReset = signal(false);
  readonly progress = inject(SetupProgress);
  readonly startSetup = output<void>();
  readonly manageBot = output<void>();

  restart() {
    if (!this.editor.reset()) return;
    this.confirmReset.set(false);
    this.startSetup.emit();
  }
}
