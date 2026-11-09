import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { GitHubRepo } from '../../models/triage.model';
import { toTriageView } from '../../models/triage-view';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="eyebrow">Catálogo de projetos</div>
        <h1 class="page-title">Repositórios e issues</h1>
        <p class="page-lede lede-narrow">Repositórios conectados à sua conta do GitHub. Abra as issues de um repositório para acionar a triagem pelo harness.</p>
      </div>

      @if (api.gitHubRepos().length === 0 && api.isLoadingGitHub()) {
        <p class="page-lede">Carregando repositórios…</p>
      }

      <div class="repo-grid">
        @for (repo of api.gitHubRepos(); track repo.id) {
          <article class="card repo-card">
            <div class="repo-head">
              <div class="repo-name">
                <span class="mono repo-owner">{{ repo.owner }}/</span>
                <span class="mono repo-short">{{ repo.name }}</span>
              </div>
              <span class="badge b-none">
                <span class="material-symbols-outlined icon-xs" aria-hidden="true">{{ repo.isPrivate ? 'lock' : 'public' }}</span>
                {{ repo.isPrivate ? 'Privado' : 'Público' }}
              </span>
            </div>

            <div class="repo-facts">
              <div class="fact">
                <span class="fact-label">Issues abertas</span>
                <span class="fact-value">{{ repo.openIssuesCount }}</span>
              </div>
              <div class="fact">
                <span class="fact-label">Triagens registradas</span>
                <span class="fact-value">{{ eventCount(repo) }}</span>
              </div>
            </div>

            @if (repo.description) {
              <p class="repo-description">{{ repo.description }}</p>
            }

            @if (api.selectedRepo() === repo.fullName) {
              <div>
                <div class="section-label issues-label">Issues abertas</div>
                @if (api.isLoadingGitHub()) {
                  <p class="issues-empty">Buscando issues no GitHub…</p>
                } @else if (api.selectedRepoIssues().length === 0) {
                  <p class="issues-empty">Nenhuma issue aberta neste repositório.</p>
                } @else {
                  <ul class="issues">
                    @for (issue of api.selectedRepoIssues(); track issue.id) {
                      @let job = jobFor(repo, issue.number);
                      <li class="issue">
                        <div class="issue-main">
                          <span class="mono issue-number">#{{ issue.number }}</span>
                          <span class="issue-title">{{ issue.title }}</span>
                        </div>
                        <span class="mono issue-meta">&#64;{{ issue.author || 'autor' }} · {{ issue.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                        <div class="issue-actions">
                          @if (job) {
                            <span [class]="'badge badge-sm ' + job.catClass">{{ job.catLabel }}</span>
                            <a class="btn btn-sm" [routerLink]="job.detailLink">Inspecionar detalhes</a>
                          }
                          <button type="button" class="btn btn-sm btn-ai" [disabled]="api.isTriagingIssue() === issue.number" (click)="triage(repo, issue.number)">
                            {{ api.isTriagingIssue() === issue.number ? 'Enviando…' : job ? 'Re-triar' : 'Triar com IA' }}
                          </button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              </div>
            } @else {
              <button type="button" class="btn btn-sm view-issues" (click)="api.selectRepository(repo.fullName)">Ver issues abertas</button>
            }
          </article>
        }

        <article class="card unknown-card">
          <span class="badge b-review"><span class="dot"></span>Fora do catálogo</span>
          <div class="unknown-title">Repositórios desconhecidos</div>
          <p>Eventos de repositórios não cadastrados são aceitos (HTTP 202), mas nunca publicam no GitHub: vão direto para Revisão Humana.</p>
          <span class="badge b-none"><span class="dot"></span>Diretriz de Segurança Ativa</span>
        </article>
      </div>
    </div>
  `,
  styles: [`
    .lede-narrow { max-width: 720px; }
    .repo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 16px; align-items: start; }
    .repo-card { padding: 20px; display: flex; flex-direction: column; gap: 16px; transition: border-color 0.15s, box-shadow 0.15s; }
    .repo-card:hover { border-color: var(--border-strong); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07); }
    .repo-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .repo-head .badge { flex: none; }
    .repo-name { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .repo-owner { font-size: 12px; color: var(--text-muted); }
    .repo-short { font-size: 15px; font-weight: 600; color: var(--text); word-break: break-all; }
    .repo-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .fact { display: flex; flex-direction: column; gap: 3px; }
    .fact-label { font-size: 12px; color: var(--text-muted); }
    .fact-value { font-size: 13.5px; font-weight: 500; }
    .repo-description { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-secondary); }
    .icon-xs { font-size: 0.8rem !important; }
    .issues-label { margin-bottom: 10px; }
    .issues-empty { margin: 0; font-size: 13.5px; color: var(--text-secondary); }
    .issues { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; max-height: 520px; overflow-y: auto; }
    .issue { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--surface-muted); }
    .issue-main { display: flex; gap: 8px; align-items: baseline; }
    .issue-number { font-size: 12.5px; color: var(--primary); flex: none; }
    .issue-title { font-size: 13.5px; line-height: 1.5; color: var(--text-strong); }
    .issue-meta { font-size: 11.5px; color: var(--text-muted); }
    .issue-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
    .badge-sm { height: 20px; font-size: 11px; padding: 0 8px; }
    .view-issues { align-self: flex-start; }
    .unknown-card { padding: 20px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 12px; border-style: dashed; border-color: var(--border-strong); background: transparent; box-shadow: none; }
    .unknown-title { font-size: 15px; font-weight: 600; }
    .unknown-card p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--text-secondary); }

    /* Media queries para responsividade */
    @media (max-width: 768px) {
      .repo-card { padding: 16px; gap: 14px; }
      .issues { max-height: 420px; }
    }

    @media (max-width: 480px) {
      .repo-head { flex-direction: column; align-items: flex-start; gap: 8px; }
      .repo-facts { grid-template-columns: 1fr; gap: 8px; }
      .view-issues { width: 100%; justify-content: center; }
      .issue-actions { flex-direction: column; align-items: stretch; width: 100%; }
      .issue-actions .btn { width: 100%; justify-content: center; }
    }
  `]
})
export class CatalogComponent {
  public readonly api = inject(TriageApiService);
  private readonly router = inject(Router);

  public eventCount(repo: GitHubRepo): number {
    return this.api.recentJobs().filter((job) => job.repository.toLowerCase() === repo.fullName.toLowerCase()).length;
  }

  public jobFor(repo: GitHubRepo, issueNumber: number) {
    const job = this.api.getJobForIssue(repo.fullName, issueNumber);
    return job ? toTriageView(job) : null;
  }

  public triage(repo: GitHubRepo, issueNumber: number): void {
    this.api.triggerIssueTriage(repo.owner, repo.name, issueNumber).subscribe({
      next: () => this.router.navigate(['/issues', repo.owner, repo.name, issueNumber])
    });
  }
}
