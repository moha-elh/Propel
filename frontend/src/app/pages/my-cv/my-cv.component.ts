import { Component, inject, computed } from '@angular/core'
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router'
import { AuthService } from '@app/services/auth.service'

@Component({
  selector: 'app-my-cv',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './my-cv.component.html',
  styleUrl: './my-cv.component.css',
})
export class MyCvComponent {
  protected readonly tabs = [
    { label: 'Projects', route: 'projects' }, { label: 'Skills', route: 'skills' },
    { label: 'Experience', route: 'experiences' }, { label: 'Education', route: 'educations' },
    { label: 'Certifications', route: 'certifications' }, { label: 'Languages', route: 'languages' },
    { label: 'Social links', route: 'sociallinks' }, { label: 'Interests', route: 'interests' },
  ];
  private authService = inject(AuthService)

  user = computed(() => this.authService.currentUser())

  avatarUrl = computed(() => this.user()?.avatarUrl ?? null)

  initials = computed(() => {
    const u = this.user()
    if (!u) return '?'
    return (u.firstName[0] + u.lastName[0]).toUpperCase()
  })

  fullName = computed(() => {
    const u = this.user()
    return u ? `${u.firstName} ${u.lastName}` : 'User'
  })
}
