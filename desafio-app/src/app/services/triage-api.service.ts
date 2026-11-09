import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { IncomingIssueEvent, EventAcceptedResponse, TriageResult, GitHubRepo, GitHubIssue } from '../models/triage.model';

@Injectable({
  providedIn: 'root'
})
export class TriageApiService {
  private readonly http = inject(HttpClient);
  // Backend .NET 10 API rodando em localhost:5012
  private readonly baseUrl = 'http://localhost:5012';

  public readonly recentJobs = signal<TriageResult[]>([]);
  public readonly gitHubRepos = signal<GitHubRepo[]>([]);
  public readonly selectedRepoIssues = signal<GitHubIssue[]>([]);
  public readonly selectedRepo = signal<string | null>(null);

  public readonly isLoading = signal<boolean>(false);
  public readonly isLoadingGitHub = signal<boolean>(false);
  public readonly isTriagingIssue = signal<number | null>(null);
  public readonly error = signal<string | null>(null);

  public loadRecentJobs(): Observable<TriageResult[]> {
    return this.http.get<TriageResult[]>(`${this.baseUrl}/jobs`).pipe(
      tap((jobs) => {
        this.recentJobs.set(jobs);
        this.error.set(null);
      }),
      catchError((err) => {
        console.error('Falha ao consultar jobs no backend:', err);
        this.error.set('Não foi possível conectar ao backend na porta 5012. Certifique-se de que a API está rodando.');
        return of([] as TriageResult[]);
      })
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
      tap((result) => {
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

  public getJobForIssue(repository: string, issueNumber: number): TriageResult | undefined {
    return this.recentJobs().find(
      j => j.repository.toLowerCase() === repository.toLowerCase() && j.issueNumber === issueNumber
    );
  }
}
