import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TriageApiService } from './services/triage-api.service';

const POLL_INTERVAL_MS = 3000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  public readonly api = inject(TriageApiService);
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.poll();
    this.api.loadGitHubRepositories();
    this.pollingTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
  }

  private poll(): void {
    this.api.checkHealth();
    this.api.loadRecentJobs().subscribe();
  }
}
