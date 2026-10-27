import { Component, inject, signal } from '@angular/core';
import { Pressable, Text, View } from '@ng-native/components';
import { DeepLinks } from '@ng-native/device';
import { SetupProgress } from '../../services/setup-progress';

@Component({
  selector: 'github-setup',
  imports: [Pressable, Text, View],
  templateUrl: './github-setup.html',
  styleUrls: ['../../styles/ui.css', './github-setup.css'],
})
export class GithubSetup {
  readonly progress = inject(SetupProgress);
  private readonly links = inject(DeepLinks);
  readonly section = signal(0);
  readonly sections = ['Crea la tua copia', 'Collega il bot', 'Attiva i sondaggi', 'Crea il codice per l’app'];

  showSection(index: number) {
    this.section.set(index);
  }
  open(url: string) { this.links.open(url); }
}
