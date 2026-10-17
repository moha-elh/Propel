import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface TabItem {
  label: string;
  route: string;
}

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './tab-bar.component.html',
  styleUrl: './tab-bar.component.scss',
})
export class TabBarComponent {
  tabs = input.required<TabItem[]>();
  baseRoute = input<string>('');
}
