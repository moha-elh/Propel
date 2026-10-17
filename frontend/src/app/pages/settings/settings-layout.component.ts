import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TabBarComponent, TabItem } from '@app/shared/components/tab-bar/tab-bar.component';

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [RouterOutlet, TabBarComponent],
  templateUrl: './settings-layout.component.html',
  styleUrl: './settings-layout.component.scss',
})
export class SettingsLayoutComponent {
  tabs: TabItem[] = [
    { label: 'Notifications', route: 'notifications' },
    { label: 'AI Model', route: 'llm' },
  ];
}
