import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { GitHubRepo } from '../../models/triage.model';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="eyebrow">Catálogo de projetos</div>
        <h1 class="page-title">Repositórios</h1>
        <p class="page-lede lede-narrow">
          Repositórios GitHub cadastrados no catálogo para triagem automática. Selecione um projeto para visualizar, criar ou gerenciar issues.
        </p>
      </div>

      @if (api.gitHubRepos().length === 0 && api.isLoadingGitHub()) {
        <div class="card empty"><p>Carregando repositórios da sua conta do GitHub…</p></div>
      }

      <div class="repo-grid">
        @for (repo of api.gitHubRepos(); track repo.id) {
          <article class="card repo-card" [routerLink]="['/catalog', repo.owner, repo.name]">
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

            <p class="repo-description">
              {{ repo.description || 'Repositório de software integrado ao sistema de triagem autônoma.' }}
            </p>

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

            <div class="repo-footer">
              <span class="btn btn-sm btn-secondary view-issues-btn">
                <span class="material-symbols-outlined icon-sm" aria-hidden="true">folder_open</span>
                Ver Issues do Repositório
                <span class="material-symbols-outlined icon-xs arrow" aria-hidden="true">arrow_forward</span>
              </span>
            </div>
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
    .repo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 18px; align-items: stretch; }
    .repo-card {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    .repo-card:hover {
      border-color: var(--primary);
      box-shadow: 0 10px 24px rgba(79, 70, 229, 0.08);
      transform: translateY(-2px);
    }
    .repo-card:active {
      transform: translateY(0);
    }
    .repo-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .repo-head .badge { flex: none; }
    .repo-name { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .repo-owner { font-size: 12.5px; color: var(--text-muted); }
    .repo-short { font-size: 16px; font-weight: 700; color: var(--text-strong); word-break: break-all; }
    .repo-description {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--text-secondary);
      flex: 1;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .repo-facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding: 12px 14px;
      background: var(--surface-muted);
      border-radius: 10px;
      border: 1px solid var(--border);
    }
    .fact { display: flex; flex-direction: column; gap: 2px; }
    .fact-label { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
    .fact-value { font-size: 16px; font-weight: 700; color: var(--text-strong); }
    .repo-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-top: 4px;
      margin-top: auto;
    }
    .view-issues-btn {
      width: 100%;
      justify-content: center;
      pointer-events: none; /* Deixa o card receber o clique */
    }
    .arrow { margin-left: 4px; transition: transform 0.15s; }
    .repo-card:hover .arrow { transform: translateX(3px); }
    .icon-xs { font-size: 0.8rem !important; }

    .unknown-card {
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      gap: 12px;
      border-style: dashed;
      border-color: var(--border-strong);
      background: transparent;
      box-shadow: none;
    }
    .unknown-title { font-size: 15px; font-weight: 600; }
    .unknown-card p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--text-secondary); }

    .empty { padding: 48px 24px; text-align: center; color: var(--text-secondary); }

    /* Media queries para responsividade */
    @media (max-width: 768px) {
      .repo-card { padding: 18px; gap: 14px; }
    }

    @media (max-width: 480px) {
      .repo-head { flex-direction: column; align-items: flex-start; gap: 8px; }
      .repo-facts { grid-template-columns: 1fr; gap: 8px; }
    }
  `]
})
export class CatalogComponent {
  public readonly api = inject(TriageApiService);

  public eventCount(repo: GitHubRepo): number {
    return this.api.recentJobs().filter(
      (job) => job.repository.toLowerCase() === repo.fullName.toLowerCase()
    ).length;
  }
}
