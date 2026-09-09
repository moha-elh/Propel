import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { NavbarComponent } from '@app/shared/components/navbar/navbar.component';
import { FooterComponent } from '@app/shared/components/footer/footer.component';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, NavbarComponent, FooterComponent],
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.scss'
})
export class ContactPageComponent {
  name = '';
  email = '';
  subject = '';
  message = '';
  submitted = false;

  onSubmit() {
    this.submitted = true;
    setTimeout(() => this.submitted = false, 5000);
  }
}
