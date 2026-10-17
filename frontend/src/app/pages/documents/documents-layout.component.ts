import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TabBarComponent, TabItem } from '@app/shared/components/tab-bar/tab-bar.component';

@Component({
  selector: 'app-documents-layout',
  standalone: true,
  imports: [RouterOutlet, TabBarComponent],
  templateUrl: './documents-layout.component.html',
  styleUrl: './documents-layout.component.scss',
})
export class DocumentsLayoutComponent {
  protected readonly tabs: TabItem[] = [
    { label: 'CVs', route: 'cvs' },
    { label: 'Letters', route: 'letters' },
    { label: 'Templates', route: 'templates' },
    { label: 'Images', route: 'images' },
  ];
}