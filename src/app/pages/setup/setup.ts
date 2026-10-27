import { Component, inject, output } from '@angular/core';
import { SetupGuide } from '../../components/setup-guide/setup-guide';
import { BotEditor } from '../../services/bot-editor';
@Component({
  selector: 'setup-page',
  imports: [SetupGuide],
  templateUrl: './setup.html',
  styleUrls: ['./setup.css'],
})
export class SetupPage {
  // The guide reads readiness directly from the shared editor.
  readonly editor = inject(BotEditor);
  readonly finished = output<void>();
}
