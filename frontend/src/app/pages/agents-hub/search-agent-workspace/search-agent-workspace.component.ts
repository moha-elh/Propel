import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

// The embedding-based semantic search was removed — categorization/taxonomy
// (category nodes + entity tags) is now the search signal. This page is kept as
// a stub so existing links in the Agents Hub don't dead-end.
@Component({
  selector: 'app-search-agent-workspace',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './search-agent-workspace.component.html',
  styleUrl: './search-agent-workspace.component.scss'
})
export class SearchAgentWorkspaceComponent {}
