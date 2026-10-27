import { Component, inject, signal } from '@angular/core';
import { KeyboardAvoidingView, Pressable, SafeAreaProvider, SafeAreaView, ScrollView, Text, View } from '@ng-native/components';
import { StatusBar } from '@ng-native/device';
import { BotEditor } from './services/bot-editor';
import { HomePage } from './pages/home/home';
import { SetupPage } from './pages/setup/setup';
import { ManageBotPage } from './pages/manage-bot/manage-bot';
import { OptionDrag } from './services/option-drag';
import { OptionDragScroll } from './components/poll-options/option-drag-scroll';

@Component({
  selector: 'app-root',
  imports: [KeyboardAvoidingView, Pressable, SafeAreaProvider, SafeAreaView, ScrollView, Text, View, HomePage, SetupPage, ManageBotPage, OptionDragScroll],
  templateUrl: './app.html',
  styleUrls: ['./styles/theme.css', './styles/ui.css', './app.css'],
})
export class App {
  readonly editor = inject(BotEditor);
  readonly drag = inject(OptionDrag);
  readonly mode = signal<'home' | 'guide' | 'manage'>('home');

  constructor() { inject(StatusBar).set({ style: 'dark' }); }
}
