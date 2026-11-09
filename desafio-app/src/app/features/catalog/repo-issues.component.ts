import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { GitHubIssue, GitHubRepo } from '../../models/triage.model';
import { toTriageView } from '../../models/triage-view';

type IssueFilter = 'all' | 'triaged' | 'pending';

@Component({
  selector: 'app-repo-issues',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <div class="page">
      <!-- Top Navigation -->
      <div class="top-nav">
        <a class="btn btn-sm btn-ghost back" routerLink="/catalog">
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">arrow_back</span>
          Voltar ao Catálogo
        </a>

        <button type="button" class="btn btn-primary" (click)="openCreateModal()">
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">add</span>
          Nova Issue
        </button>
      </div>

      <!-- Repo Header Card -->
      <section class="card repo-hero">
        <div class="hero-main">
          <div class="hero-title-group">
            <div class="eyebrow">Repositório</div>
            <h1 class="repo-title">
              <span class="owner">{{ owner() }}</span> / <span class="repo-name">{{ repo() }}</span>
            </h1>
          </div>

          <div class="hero-actions">
            <span class="badge b-none">
              <span class="material-symbols-outlined icon-xs" aria-hidden="true">{{ currentRepo()?.isPrivate ? 'lock' : 'public' }}</span>
              {{ currentRepo()?.isPrivate ? 'Privado' : 'Público' }}
            </span>
            <a class="btn btn-sm btn-ghost" [href]="githubRepoUrl()" target="_blank" rel="noopener noreferrer">
              Ver no GitHub
              <span class="material-symbols-outlined icon-sm" aria-hidden="true">open_in_new</span>
            </a>
          </div>
        </div>

        @if (currentRepo()?.description) {
          <p class="repo-desc">{{ currentRepo()?.description }}</p>
        }

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Issues no repositório</span>
            <span class="stat-value">{{ issues().length }}</span>
            <span class="stat-sub">abertas no GitHub</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Triadas pela IA</span>
            <span class="stat-value">{{ triagedCount() }}</span>
            <span class="stat-sub">com proposta ou diagnóstico</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Aguardando Triagem</span>
            <span class="stat-value">{{ pendingCount() }}</span>
            <span class="stat-sub">prontas para análise</span>
          </div>
        </div>
      </section>

      <!-- Feedback alert -->
      @if (alertMessage(); as alert) {
        <div [class]="'notice ' + alert.type" role="alert">
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">{{ alert.icon }}</span>
          <span>{{ alert.text }}</span>
          <button type="button" class="close-alert" (click)="alertMessage.set(null)" aria-label="Fechar aviso">
            <span class="material-symbols-outlined icon-xs" aria-hidden="true">close</span>
          </button>
        </div>
      }

      <!-- Issues Section -->
      <section class="card issues-section">
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="chips">
            <button type="button" class="chip" [class.chip-on]="filter() === 'all'" (click)="filter.set('all')">
              Todas <span class="cnt">{{ issues().length }}</span>
            </button>
            <button type="button" class="chip" [class.chip-on]="filter() === 'triaged'" (click)="filter.set('triaged')">
              Triadas <span class="cnt">{{ triagedCount() }}</span>
            </button>
            <button type="button" class="chip" [class.chip-on]="filter() === 'pending'" (click)="filter.set('pending')">
              Aguardando <span class="cnt">{{ pendingCount() }}</span>
            </button>
          </div>

          <div class="search-box">
            <span class="material-symbols-outlined icon-sm search-icon" aria-hidden="true">search</span>
            <input
              class="input search-input"
              type="search"
              placeholder="Buscar por título ou #número..."
              [ngModel]="searchTerm()"
              (ngModelChange)="searchTerm.set($event)">
          </div>
        </div>

        <!-- Issues List -->
        @if (api.isLoadingGitHub()) {
          <div class="empty"><p>Carregando issues do repositório no GitHub…</p></div>
        } @else if (filteredIssues().length === 0) {
          <div class="empty">
            <span class="material-symbols-outlined icon-lg" aria-hidden="true">inbox</span>
            <div class="empty-title">Nenhuma issue encontrada</div>
            <p>
              @if (searchTerm()) {
                Nenhuma issue corresponde ao termo de busca pesquisado.
              } @else {
                Este repositório ainda não possui issues abertas no GitHub.
              }
            </p>
            <button type="button" class="btn btn-primary btn-sm" (click)="openCreateModal()">
              <span class="material-symbols-outlined icon-sm" aria-hidden="true">add</span>
              Criar primeira issue
            </button>
          </div>
        } @else {
          <div class="issues-list">
            @for (issue of filteredIssues(); track issue.id) {
              @let job = jobFor(issue.number);
              <article class="issue-item">
                <div class="issue-content">
                  <div class="issue-header-line">
                    <span class="mono issue-num">#{{ issue.number }}</span>
                    <h2 class="issue-title-text">{{ issue.title }}</h2>
                  </div>

                  <div class="issue-meta-line">
                    <span class="issue-author">
                      <span class="material-symbols-outlined icon-xs" aria-hidden="true">person</span>
                      &#64;{{ issue.author || 'autor' }}
                    </span>
                    <span>·</span>
                    <span class="mono">{{ issue.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                    @if (job) {
                      <span>·</span>
                      <span [class]="'badge badge-sm ' + job.catClass">
                        <span class="dot"></span>
                        {{ job.catLabel }}
                      </span>
                    } @else {
                      <span>·</span>
                      <span class="badge badge-sm b-none">Não triada</span>
                    }
                  </div>
                </div>

                <div class="issue-actions-group">
                  @if (job) {
                    <a class="btn btn-sm btn-secondary" [routerLink]="job.detailLink">
                      <span class="material-symbols-outlined icon-sm" aria-hidden="true">visibility</span>
                      Ver Diagnóstico
                    </a>
                  }

                  <button
                    type="button"
                    class="btn btn-sm btn-ai"
                    [disabled]="api.isTriagingIssue() === issue.number"
                    (click)="triageIssue(issue.number)">
                    <span class="material-symbols-outlined icon-sm" aria-hidden="true">smart_toy</span>
                    {{ api.isTriagingIssue() === issue.number ? 'Triando…' : job ? 'Re-triar' : 'Triar com IA' }}
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm btn-danger-ghost"
                    title="Excluir ou fechar issue no GitHub"
                    [disabled]="deletingIssueId() === issue.number"
                    (click)="deleteIssue(issue.number, issue.title)">
                    <span class="material-symbols-outlined icon-sm" aria-hidden="true">delete</span>
                    {{ deletingIssueId() === issue.number ? 'Excluindo…' : 'Excluir' }}
                  </button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <!-- Modal Criar Issue -->
      @if (showCreateModal()) {
        <div class="modal-backdrop" (click)="closeCreateModal()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div class="modal-title-group">
                <div class="eyebrow">Novo Evento</div>
                <h2 class="modal-title">Criar Issue no GitHub</h2>
                <span class="modal-subtitle">em {{ owner() }}/{{ repo() }}</span>
              </div>
              <button type="button" class="btn btn-sm btn-ghost btn-close-modal" (click)="closeCreateModal()">
                <span class="material-symbols-outlined icon-sm" aria-hidden="true">close</span>
              </button>
            </div>

            <form (ngSubmit)="submitNewIssue()" class="modal-body">
              <div class="field">
                <label for="issue-title" class="lbl">Título da Issue <span class="required">*</span></label>
                <input
                  id="issue-title"
                  class="input"
                  type="text"
                  placeholder="Ex: Erro 500 no endpoint de autenticação PostgreSQL"
                  required
                  [(ngModel)]="newIssueTitle"
                  name="issueTitle"
                  autofocus>
              </div>

              <div class="field">
                <label for="issue-body" class="lbl">Descrição detalhada (Markdown aceito)</label>
                <textarea
                  id="issue-body"
                  class="input textarea-desc"
                  rows="6"
                  placeholder="Descreva o problema com passos para reproduzir, comportamento esperado e mensagens de erro..."
                  [(ngModel)]="newIssueBody"
                  name="issueBody"></textarea>
                <span class="field-hint">Dica: Incluir passos de reprodução e logs técnicos ajuda os agentes de IA a realizarem o diagnóstico sem encaminhar para revisão humana.</span>
              </div>

              <div class="modal-actions">
                <button type="button" class="btn btn-ghost" (click)="closeCreateModal()" [disabled]="isSubmittingIssue()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="!newIssueTitle.trim() || isSubmittingIssue()">
                  <span class="material-symbols-outlined icon-sm" aria-hidden="true">add_circle</span>
                  {{ isSubmittingIssue() ? 'Criando no GitHub…' : 'Criar e Enviar para Triagem' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .top-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .back { padding-left: 6px; }

    /* Repo Hero */
    .repo-hero { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
    .hero-main { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .hero-title-group { display: flex; flex-direction: column; gap: 4px; }
    .repo-title { margin: 0; font-size: clamp(22px, 3.5vw, 30px); font-weight: 700; }
    .repo-title .owner { color: var(--text-muted); font-weight: 500; }
    .repo-title .repo-name { color: var(--text-strong); }
    .hero-actions { display: flex; align-items: center; gap: 10px; }
    .repo-desc { margin: 0; font-size: 14.5px; color: var(--text-secondary); line-height: 1.6; max-width: 820px; }

    /* Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px 18px;
      border-radius: 12px;
      background: var(--surface-muted);
      border: 1px solid var(--border);
    }
    .stat-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
    .stat-value { font-size: 28px; font-weight: 700; line-height: 1; color: var(--text-strong); }
    .stat-sub { font-size: 11.5px; color: var(--text-muted); }

    /* Issues Section */
    .issues-section { overflow: hidden; display: flex; flex-direction: column; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .chips { display: flex; gap: 8px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-secondary);
      font: 500 13px var(--font-sans);
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip:hover { color: var(--text); border-color: var(--border-hover); }
    .chip-on, .chip-on:hover { background: var(--text); color: #ffffff; border-color: var(--text); }
    .cnt { font: 500 11px var(--font-mono); opacity: 0.75; }
    .search-box { position: relative; flex: 0 1 320px; min-width: 240px; }
    .search-icon { position: absolute; left: 12px; top: 13px; color: var(--text-muted); }
    .search-input { padding-left: 38px; }

    /* Issues list */
    .issues-list { display: flex; flex-direction: column; }
    .issue-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--surface-muted);
      transition: background 0.12s;
    }
    .issue-item:last-child { border-bottom: 0; }
    .issue-item:hover { background: var(--bg); }
    .issue-content { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .issue-header-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .issue-num { font-size: 13.5px; color: var(--primary); flex-shrink: 0; font-weight: 600; }
    .issue-title-text { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-strong); word-break: break-word; }
    .issue-meta-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
    .issue-author { display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); font-weight: 500; }
    .issue-actions-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .btn-danger-ghost {
      background: transparent;
      border-color: transparent;
      color: var(--danger);
      box-shadow: none;
    }
    .btn-danger-ghost:hover {
      background: var(--danger-soft);
      border-color: var(--danger-border);
      color: var(--danger);
    }
    .btn-danger-ghost:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .badge-sm { height: 20px; font-size: 11px; padding: 0 8px; }

    /* Empty state */
    .empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 24px; text-align: center; }
    .empty-title { font-size: 16px; font-weight: 600; }
    .empty p { margin: 0; color: var(--text-secondary); font-size: 14px; max-width: 400px; }

    /* Notice alert */
    .notice { display: flex; align-items: center; gap: 10px; position: relative; }
    .close-alert { margin-left: auto; background: transparent; border: 0; cursor: pointer; color: inherit; padding: 4px; display: inline-flex; align-items: center; }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-card {
      background: var(--surface);
      border-radius: 16px;
      border: 1px solid var(--border-strong);
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
      width: 100%;
      max-width: 580px;
      overflow: hidden;
      animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalPop {
      0% { transform: scale(0.96) translateY(8px); opacity: 0; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }
    .modal-title-group { display: flex; flex-direction: column; gap: 3px; }
    .modal-title { margin: 0; font-size: 18px; font-weight: 700; }
    .modal-subtitle { font-size: 12.5px; font-family: var(--font-mono); color: var(--text-muted); }
    .modal-body { display: flex; flex-direction: column; gap: 18px; padding: 24px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .required { color: var(--danger); }
    .textarea-desc { min-height: 120px; }
    .field-hint { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
    .modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 8px; border-top: 1px solid var(--surface-muted); }

    /* Responsividade */
    @media (max-width: 768px) {
      .hero-main { flex-direction: column; align-items: flex-start; }
      .hero-actions { width: 100%; justify-content: space-between; }
      .toolbar { flex-direction: column; align-items: stretch; gap: 12px; padding: 14px 16px; }
      .chips { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
      .search-box { width: 100%; min-width: 100%; }
      .issue-item { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px 16px; }
      .issue-actions-group { width: 100%; justify-content: flex-start; }
    }

    @media (max-width: 480px) {
      .top-nav { flex-direction: column; align-items: stretch; gap: 10px; }
      .top-nav .btn { width: 100%; justify-content: center; }
      .stats-grid { grid-template-columns: 1fr; }
      .issue-actions-group { flex-direction: column; align-items: stretch; }
      .issue-actions-group .btn { width: 100%; justify-content: center; }
      .modal-card { max-height: 90vh; overflow-y: auto; }
      .modal-actions { flex-direction: column; align-items: stretch; }
      .modal-actions .btn { width: 100%; justify-content: center; }
    }
  `]
})
export class RepoIssuesComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly api = inject(TriageApiService);

  public readonly owner = signal('');
  public readonly repo = signal('');
  public readonly filter = signal<IssueFilter>('all');
  public readonly searchTerm = signal('');
  public readonly deletingIssueId = signal<number | null>(null);

  // Modal creation state
  public readonly showCreateModal = signal(false);
  public newIssueTitle = '';
  public newIssueBody = '';
  public readonly isSubmittingIssue = signal(false);
  public readonly alertMessage = signal<{ text: string; type: string; icon: string } | null>(null);

  public readonly currentRepo = computed(() => {
    const fullName = `${this.owner()}/${this.repo()}`.toLowerCase();
    return this.api.gitHubRepos().find(r => r.fullName.toLowerCase() === fullName) ?? null;
  });

  public readonly issues = computed(() => this.api.selectedRepoIssues());

  public readonly triagedCount = computed(() => {
    const repoName = `${this.owner()}/${this.repo()}`.toLowerCase();
    const issueNumbers = new Set(this.issues().map(i => i.number));
    return this.api.recentJobs().filter(
      j => j.repository.toLowerCase() === repoName && issueNumbers.has(j.issueNumber)
    ).length;
  });

  public readonly pendingCount = computed(() => {
    return Math.max(0, this.issues().length - this.triagedCount());
  });

  public readonly filteredIssues = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.filter();
    const repoName = `${this.owner()}/${this.repo()}`.toLowerCase();

    return this.issues().filter(issue => {
      const job = this.api.getJobForIssue(repoName, issue.number);
      const isTriaged = !!job;

      if (filter === 'triaged' && !isTriaged) return false;
      if (filter === 'pending' && isTriaged) return false;

      if (term) {
        const matchesNumber = issue.number.toString().includes(term);
        const matchesTitle = issue.title.toLowerCase().includes(term);
        const matchesAuthor = (issue.author || '').toLowerCase().includes(term);
        if (!matchesNumber && !matchesTitle && !matchesAuthor) return false;
      }

      return true;
    });
  });

  public readonly githubRepoUrl = computed(() => {
    return this.currentRepo()?.htmlUrl ?? `https://github.com/${this.owner()}/${this.repo()}`;
  });

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const owner = params.get('owner') || '';
      const repo = params.get('repo') || '';
      this.owner.set(owner);
      this.repo.set(repo);

      if (owner && repo) {
        this.api.selectRepository(`${owner}/${repo}`);
      }
    });

    this.refreshTimer = setInterval(() => {
      if (this.owner() && this.repo()) {
        this.api.loadRepositoryIssues(this.owner(), this.repo());
      }
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  public jobFor(issueNumber: number) {
    const job = this.api.getJobForIssue(`${this.owner()}/${this.repo()}`, issueNumber);
    return job ? toTriageView(job) : null;
  }

  public triageIssue(issueNumber: number): void {
    this.api.triggerIssueTriage(this.owner(), this.repo(), issueNumber).subscribe({
      next: () => {
        this.router.navigate(['/issues', this.owner(), this.repo(), issueNumber]);
      },
      error: () => {
        this.alertMessage.set({
          text: `Falha ao acionar triagem para a issue #${issueNumber}.`,
          type: 'notice-error',
          icon: 'error'
        });
      }
    });
  }

  public deleteIssue(issueNumber: number, title: string): void {
    if (!confirm(`Deseja realmente excluir/fechar a issue #${issueNumber} ("${title}") no GitHub?`)) {
      return;
    }

    this.deletingIssueId.set(issueNumber);
    this.api.deleteIssue(this.owner(), this.repo(), issueNumber).subscribe({
      next: (res) => {
        this.deletingIssueId.set(null);
        this.alertMessage.set({
          text: `Issue #${issueNumber} excluída/fechada no GitHub com sucesso.`,
          type: 'notice-warning',
          icon: 'delete'
        });
      },
      error: (err) => {
        this.deletingIssueId.set(null);
        this.alertMessage.set({
          text: `Erro ao excluir issue #${issueNumber}: ${err.message || 'Verifique as permissões do token.'}`,
          type: 'notice-error',
          icon: 'error'
        });
      }
    });
  }

  public openCreateModal(): void {
    this.newIssueTitle = '';
    this.newIssueBody = '';
    this.showCreateModal.set(true);
  }

  public closeCreateModal(): void {
    if (!this.isSubmittingIssue()) {
      this.showCreateModal.set(false);
    }
  }

  public submitNewIssue(): void {
    if (!this.newIssueTitle.trim()) return;

    this.isSubmittingIssue.set(true);
    this.api.createIssue(this.owner(), this.repo(), this.newIssueTitle.trim(), this.newIssueBody.trim()).subscribe({
      next: (created) => {
        this.isSubmittingIssue.set(false);
        this.showCreateModal.set(false);
        this.alertMessage.set({
          text: `Issue #${created.number} criada com sucesso no GitHub e enfileirada para triagem automática!`,
          type: 'notice-warning',
          icon: 'check_circle'
        });
      },
      error: (err) => {
        this.isSubmittingIssue.set(false);
        this.alertMessage.set({
          text: `Falha ao criar issue no GitHub: ${err.message || 'Erro inesperado.'}`,
          type: 'notice-error',
          icon: 'error'
        });
      }
    });
  }
}
