import { Component } from '@angular/core';
import { BotSettings } from '../../components/bot-settings/bot-settings';
@Component({
  selector: 'manage-bot-page',
  imports: [BotSettings],
  templateUrl: './manage-bot.html',
  styleUrls: ['./manage-bot.css'],
})
export class ManageBotPage {
}
