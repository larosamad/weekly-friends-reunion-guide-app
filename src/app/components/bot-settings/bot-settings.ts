import { Component, inject, input, signal } from '@angular/core';
import { Pressable, Text, TextInput, View } from '@ng-native/components';
import { PollSchedule } from '../poll-schedule/poll-schedule';
import { BotEditor } from '../../services/bot-editor';
import { PollOptions } from '../poll-options/poll-options';
@Component({
  selector: 'bot-settings',
  imports: [Pressable, Text, TextInput, View, PollSchedule, PollOptions],
  templateUrl: './bot-settings.html',
  styleUrls: ['../../styles/ui.css', './bot-settings.css'],
})
export class BotSettings {
  readonly guided = input(false);
  readonly editConnection = signal(false);
  readonly showBranch = signal(false);
  readonly editor = inject(BotEditor);
}
