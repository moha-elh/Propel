import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { RevealOverlayComponent } from './pages/reveal-overlay/reveal-overlay.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { BimeChatComponent } from './shared/components/bime-chat/bime-chat';
import { APP_NAME } from './app-name';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent, RevealOverlayComponent, ToastComponent, BimeChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private router = inject(Router);
  private title = inject(Title);

  isAuthPage = false;
  showHeader = false;

  ngOnInit(): void {
    this.title.setTitle(APP_NAME);
    this.router.events.subscribe(() => {
      const url = this.router.url.split('#')[0].split('?')[0];
      this.isAuthPage = url === '/' || url.startsWith('/about') || url.startsWith('/contact');
      this.showHeader = !this.isAuthPage;
    });
    const initialUrl = this.router.url.split('#')[0].split('?')[0];
    this.isAuthPage = initialUrl === '/' || initialUrl.startsWith('/about') || initialUrl.startsWith('/contact');
    this.showHeader = !this.isAuthPage;
  }
}
