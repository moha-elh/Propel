import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-stats-section',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsSectionComponent {
  plans = [
    {
      name: 'Free',
      price: '$0',
      period: '/mo',
      desc: 'Perfect for getting started.',
      cta: 'Get started free',
      ctaLink: '/applications',
      featured: false,
      features: [
        '5 AI-tailored CVs/mo',
        '20 tracked applications',
        '5 job search views',
        'Email reminders',
      ],
    },
    {
      name: 'Pro',
      price: '$12',
      period: '/mo',
      desc: 'For serious job seekers.',
      cta: 'Start Pro',
      ctaLink: '/applications',
      featured: true,
      features: [
        'Unlimited CVs & applications',
        'Live job recommendations',
        'AI cover letters',
        'ATS score & gap analysis',
        'Priority support',
      ],
    },
    {
      name: 'Career',
      price: '$28',
      period: '/mo',
      desc: 'For those who want every edge.',
      cta: 'Start Career',
      ctaLink: '/applications',
      featured: false,
      features: [
        'Everything in Pro',
        'Monthly 1-on-1 coaching',
        'Interview prep kit',
        'Salary benchmarks',
        'LinkedIn profile review',
      ],
    },
  ];
}
