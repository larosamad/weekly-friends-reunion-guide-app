import { Component, inject } from '@angular/core';
import { Pressable, Text } from '@ng-native/components';
import { BotSettings } from '../../components/bot-settings/bot-settings';
import { BotEditor } from '../../services/bot-editor';
import { OptionDrag } from '../../services/option-drag';
@Component({
  selector: 'manage-bot-page',
  imports: [BotSettings, Pressable, Text],
  templateUrl: './manage-bot.html',
  styleUrls: ['../../styles/ui.css', './manage-bot.css'],
})
export class ManageBotPage {
  readonly editor = inject(BotEditor);
  readonly drag = inject(OptionDrag);
}
