import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TriageApiService } from './services/triage-api.service';

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

    // Polling inteligente: só pesquisa se houver jobs em andamento (Accepted ou Processing)
    this.pollingTimer = setInterval(() => {
      const hasPendingJobs = this.api.recentJobs().some(
        j => j.status === 'Accepted' || j.status === 'Processing'
      );
      if (hasPendingJobs) {
        this.api.loadRecentJobs().subscribe();
      }
    }, 5000);
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
