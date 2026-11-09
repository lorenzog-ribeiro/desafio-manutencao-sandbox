import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { IncomingIssueEvent, EventAcceptedResponse, TriageResult, GitHubRepo, GitHubIssue } from '../models/triage.model';

@Injectable({
  providedIn: 'root'
})
export class TriageApiService {
  private readonly http = inject(HttpClient);
  // Em desenvolvimento local (ng serve na porta 4200), conecta a http://localhost:5012.
  // Em produção/Docker (Dokploy), usa caminho relativo '' (via proxy reverso Nginx) ou window.__API_URL__
  private readonly baseUrl = (typeof window !== 'undefined' && (window as any).__API_URL__)
    || (typeof window !== 'undefined' && window.location.port === '4200' ? 'http://localhost:5012' : '');

  public readonly recentJobs = signal<TriageResult[]>([]);
  public readonly jobsLoaded = signal<boolean>(false);
  public readonly freshEventIds = signal<ReadonlySet<string>>(new Set());
  public readonly apiOnline = signal<boolean | null>(null);
  public readonly gitHubRepos = signal<GitHubRepo[]>([]);
  public readonly selectedRepoIssues = signal<GitHubIssue[]>([]);
  public readonly selectedRepo = signal<string | null>(null);

  public readonly isLoading = signal<boolean>(false);
  public readonly isLoadingGitHub = signal<boolean>(false);
  public readonly isTriagingIssue = signal<number | null>(null);
  public readonly error = signal<string | null>(null);

  public checkHealth(): void {
    this.http.get(`${this.baseUrl}/health`).pipe(
      map(() => true),
      catchError(() => of(false))
    ).subscribe((online) => this.apiOnline.set(online));
  }

  public loadRecentJobs(): Observable<TriageResult[]> {
    this.isLoading.set(true);
    return this.http.get<TriageResult[]>(`${this.baseUrl}/jobs`).pipe(
      tap((jobs) => {
        if (this.jobsLoaded()) {
          this.markNewJobsAsFresh(jobs);
        }
        this.recentJobs.set(jobs);
        this.jobsLoaded.set(true);
        this.error.set(null);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        console.error('Falha ao consultar jobs no backend:', err);
        this.error.set('Não foi possível conectar ao backend na porta 5012. Certifique-se de que a API está rodando.');
        this.isLoading.set(false);
        return of([] as TriageResult[]);
      })
    );
  }

  public submitEvent(event: IncomingIssueEvent): Observable<HttpResponse<EventAcceptedResponse>> {
    return this.http.post<EventAcceptedResponse>(`${this.baseUrl}/events`, event, { observe: 'response' }).pipe(
      tap(() => this.loadRecentJobs().subscribe())
    );
  }

  public getTriageResult(owner: string, repo: string, issueNumber: number): Observable<TriageResult> {
    return this.http.get<TriageResult>(`${this.baseUrl}/issues/${owner}/${repo}/${issueNumber}`).pipe(
      catchError((err) => {
        const msg = err.error?.error || err.message || 'Resultado de triagem não encontrado.';
        throw new Error(msg);
      })
    );
  }

  /** The API only lists open issues, so closed or simulated issues resolve to null. */
  public findOpenIssue(owner: string, repo: string, issueNumber: number): Observable<GitHubIssue | null> {
    return this.http.get<GitHubIssue[]>(`${this.baseUrl}/github/repos/${owner}/${repo}/issues`).pipe(
      map((issues) => issues.find((issue) => issue.number === issueNumber) ?? null),
      catchError(() => of(null))
    );
  }

  public loadGitHubRepositories(): void {
    this.isLoadingGitHub.set(true);
    this.http.get<GitHubRepo[]>(`${this.baseUrl}/github/repos`).pipe(
      catchError((err) => {
        console.error('Falha ao carregar repositórios do GitHub:', err);
        return of([] as GitHubRepo[]);
      })
    ).subscribe((repos) => {
      this.gitHubRepos.set(repos);
      this.isLoadingGitHub.set(false);

      // Auto-seleciona desafio-manutencao-sandbox ou o primeiro repositório se nenhum estiver ativo
      if (!this.selectedRepo() && repos.length > 0) {
        const preferred = repos.find(r => r.fullName.includes('desafio-manutencao-sandbox')) || repos[0];
        this.selectRepository(preferred.fullName);
      }
    });
  }

  public selectRepository(repoFullName: string): void {
    this.selectedRepo.set(repoFullName);
    const [owner, name] = repoFullName.split('/');
    if (owner && name) {
      this.loadRepositoryIssues(owner, name);
    }
  }

  public loadRepositoryIssues(owner: string, repo: string): void {
    this.isLoadingGitHub.set(true);
    this.http.get<GitHubIssue[]>(`${this.baseUrl}/github/repos/${owner}/${repo}/issues`).pipe(
      catchError((err) => {
        console.error(`Falha ao carregar issues de ${owner}/${repo}:`, err);
        return of([] as GitHubIssue[]);
      })
    ).subscribe((issues) => {
      this.selectedRepoIssues.set(issues);
      this.isLoadingGitHub.set(false);
    });
  }

  public triggerIssueTriage(owner: string, repo: string, issueNumber: number): Observable<TriageResult> {
    this.isTriagingIssue.set(issueNumber);
    return this.http.post<TriageResult>(`${this.baseUrl}/github/repos/${owner}/${repo}/issues/${issueNumber}/triage`, {}).pipe(
      tap(() => {
        this.isTriagingIssue.set(null);
        this.loadRecentJobs().subscribe();
      }),
      catchError((err) => {
        this.isTriagingIssue.set(null);
        const msg = err.error?.error || err.message || 'Falha ao iniciar triagem da issue.';
        this.error.set(msg);
        throw err;
      })
    );
  }

  public createIssue(owner: string, repo: string, title: string, body?: string): Observable<GitHubIssue> {
    return this.http.post<GitHubIssue>(`${this.baseUrl}/github/repos/${owner}/${repo}/issues`, { title, body }).pipe(
      tap(() => {
        this.loadRepositoryIssues(owner, repo);
        this.loadRecentJobs().subscribe();
      })
    );
  }

  public deleteIssue(owner: string, repo: string, issueNumber: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.baseUrl}/github/repos/${owner}/${repo}/issues/${issueNumber}`).pipe(
      tap(() => {
        this.loadRepositoryIssues(owner, repo);
        this.loadRecentJobs().subscribe();
      })
    );
  }

  public getJobForIssue(repository: string, issueNumber: number): TriageResult | undefined {
    return this.recentJobs().find(
      j => j.repository.toLowerCase() === repository.toLowerCase() && j.issueNumber === issueNumber
    );
  }

  private markNewJobsAsFresh(jobs: TriageResult[]): void {
    const known = new Set(this.recentJobs().map((job) => job.eventId));
    const added = jobs.filter((job) => !known.has(job.eventId));
    if (added.length > 0) {
      this.freshEventIds.update((fresh) => new Set([...fresh, ...added.map((job) => job.eventId)]));
    }
  }
}
