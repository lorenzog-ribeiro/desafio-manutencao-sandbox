import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { GitHubRepo, GitHubIssue, TriageResult } from '../../models/triage.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-container">
      <!-- Barra de Status do Sistema -->
      <div class="system-status-bar">
        <div class="status-item">
          <span class="status-dot green"></span>
          <span class="status-label">Backend .NET 10:</span>
          <strong>localhost:5012</strong>
        </div>
        <div class="status-item">
          <span class="status-dot green"></span>
          <span class="status-label">PostgreSQL:</span>
          <strong>triage_db</strong>
        </div>
        <div class="status-item">
          <span class="status-dot green"></span>
          <span class="status-label">GitHub:</span>
          <strong>Autenticado (PAT)</strong>
        </div>
        <div class="status-item">
          <span class="status-dot green"></span>
          <span class="status-label">AI Harness:</span>
          <strong>Router + Especialistas</strong>
        </div>
      </div>

      <!-- Cabeçalho -->
      <header class="page-header">
        <div>
          <h2>Painel Operacional de Triagem com IA</h2>
          <p class="subtitle">Monitoramento em tempo real de issues do GitHub, fila do PostgreSQL e agentes especialistas</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="refresh()" [disabled]="api.isLoading() || api.isLoadingGitHub()">
            🔄 Atualizar Dados
          </button>
          <button class="btn btn-github" (click)="toggleWebhookInfo()">
            ⚙️ Webhook GitHub
          </button>
        </div>
      </header>

      <!-- Instruções do Webhook -->
      @if (showWebhookGuide()) {
        <div class="webhook-banner">
          <div class="webhook-header">
            <h3>⚙️ Webhook do GitHub para Triagem 100% Automática</h3>
            <button class="btn-close" (click)="toggleWebhookInfo()">✕</button>
          </div>
          <p>Para triagem autônoma sempre que uma nova issue for aberta na sua conta, configure no GitHub em <strong>Settings → Webhooks → Add webhook</strong>:</p>
          <div class="webhook-config-box">
            <div><strong>Payload URL:</strong> <code>https://&lt;seu-dominio-ou-tunnel-publico&gt;/webhooks/github</code></div>
            <div><strong>Content type:</strong> <code>application/json</code></div>
            <div><strong>Events:</strong> Selecione <em>"Let me select individual events"</em> e marque <strong>Issues</strong>.</div>
          </div>
        </div>
      }

      <!-- Mensagens de Erro -->
      @if (api.error()) {
        <div class="alert alert-danger">
          ⚠️ {{ api.error() }}
        </div>
      }

      <!-- Indicadores de Métricas Reais do PostgreSQL -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">Total de Jobs Registrados</span>
          <span class="metric-value">{{ api.recentJobs().length }}</span>
        </div>
        <div class="metric-card status-accepted">
          <span class="metric-label">Aceitos / Na Fila</span>
          <span class="metric-value">{{ countByStatus('Accepted') }}</span>
        </div>
        <div class="metric-card status-processing">
          <span class="metric-label">Em Processamento</span>
          <span class="metric-value">{{ countByStatus('Processing') }}</span>
        </div>
        <div class="metric-card status-published">
          <span class="metric-label">Publicados no GitHub</span>
          <span class="metric-value">{{ countByStatus('Published') }}</span>
        </div>
        <div class="metric-card status-review">
          <span class="metric-label">Revisão Humana</span>
          <span class="metric-value">{{ countByStatus('HumanReviewRequired') }}</span>
        </div>
      </div>

      <!-- Seção: Repositórios Reais do GitHub -->
      <section class="github-section">
        <div class="section-title-row">
          <div>
            <h3>📦 Repositórios da Conta GitHub</h3>
            <p>Carregados dinamicamente via Octokit. Selecione um repositório para inspecionar e disparar a IA.</p>
          </div>
          <button class="btn btn-secondary btn-sm" (click)="loadRepos()" [disabled]="api.isLoadingGitHub()">
            {{ api.isLoadingGitHub() ? 'Sincronizando...' : '🔄 Sincronizar Repositórios' }}
          </button>
        </div>

        @if (api.gitHubRepos().length > 0) {
          <div class="repos-grid">
            @for (repo of api.gitHubRepos(); track repo.id) {
              <div 
                class="repo-card" 
                [class.selected]="api.selectedRepo() === repo.fullName"
                (click)="selectRepository(repo)">
                <div class="repo-card-header">
                  <strong>{{ repo.name }}</strong>
                  <span class="badge badge-issues">{{ repo.openIssuesCount }} issues</span>
                </div>
                <p class="repo-full-name"><code>{{ repo.fullName }}</code></p>
                <div class="repo-card-footer">
                  <span class="privacy-badge">{{ repo.isPrivate ? '🔒 Privado' : '🌐 Público' }}</span>
                  <span class="action-text">
                    {{ api.selectedRepo() === repo.fullName ? '● Selecionado' : 'Selecionar →' }}
                  </span>
                </div>
              </div>
            }
          </div>
        } @else if (api.isLoadingGitHub()) {
          <div class="empty-state">
            <p>Consultando repositórios na API do GitHub...</p>
          </div>
        }

        <!-- Issues do Repositório Selecionado -->
        @if (api.selectedRepo(); as currentRepo) {
          <div class="issues-panel">
            <div class="issues-header">
              <div>
                <h4>Issues em <code>{{ currentRepo }}</code></h4>
                <p class="sub-header">Veja abaixo o status de triagem no PostgreSQL e comente com a IA em 1 clique</p>
              </div>
              <span class="issues-count">{{ api.selectedRepoIssues().length }} issues abertas</span>
            </div>

            @if (api.isLoadingGitHub()) {
              <p class="loading-text">Carregando issues do GitHub...</p>
            } @else if (api.selectedRepoIssues().length === 0) {
              <div class="empty-issues">
                <p>Nenhuma issue aberta encontrada em <code>{{ currentRepo }}</code>.</p>
              </div>
            } @else {
              <div class="issues-list">
                @for (issue of api.selectedRepoIssues(); track issue.id) {
                  @let job = getJob(currentRepo, issue.number);
                  <div class="issue-item" [class.item-triaged]="!!job">
                    <div class="issue-info">
                      <div class="issue-title-row">
                        <span class="issue-number">#{{ issue.number }}</span>
                        <a [href]="issue.htmlUrl" target="_blank" class="issue-link" title="Abrir no GitHub">
                          {{ issue.title }} ↗
                        </a>
                        @if (job) {
                          <span class="badge" [ngClass]="getStatusBadgeClass(job.status)">
                            {{ getStatusLabel(job.status) }}
                          </span>
                          @if (job.category) {
                            <span class="badge badge-category">{{ job.category }}</span>
                          }
                        } @else {
                          <span class="badge badge-untriaged">Não Triada</span>
                        }
                      </div>

                      <p class="issue-body-preview">{{ getPreview(issue.body) }}</p>

                      @if (job && job.problemSummary) {
                        <div class="job-preview-box">
                          <strong>Diagnóstico da IA:</strong> {{ job.problemSummary }}
                        </div>
                      }

                      <span class="issue-meta">
                        Aberta por <strong>{{ issue.author || 'autor' }}</strong> em {{ issue.createdAt | date:'dd/MM/yyyy HH:mm' }}
                      </span>
                    </div>

                    <div class="issue-actions">
                      @if (job) {
                        <a [routerLink]="['/issues', getOwner(currentRepo), getRepo(currentRepo), issue.number]" class="btn btn-secondary btn-sm">
                          🔍 Ver Análise Completa
                        </a>
                        <button 
                          class="btn btn-outline-triage btn-sm" 
                          (click)="triageIssue(issue.number)" 
                          [disabled]="api.isTriagingIssue() === issue.number">
                          {{ api.isTriagingIssue() === issue.number ? '⏳ Enviando...' : '⚡ Re-triar' }}
                        </button>
                      } @else {
                        <button 
                          class="btn btn-action-triage" 
                          (click)="triageIssue(issue.number)" 
                          [disabled]="api.isTriagingIssue() === issue.number">
                          {{ api.isTriagingIssue() === issue.number ? '⏳ Enviando...' : '⚡ Triar com IA' }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </section>

      <!-- Tabela Histórico Geral de Triagens (PostgreSQL) -->
      <div class="table-container">
        <div class="table-header">
          <h3>Histórico de Triagens no PostgreSQL</h3>
          <p>Registro imutável de todas as issues processadas pelo Worker e publicadas no GitHub</p>
        </div>

        @if (api.recentJobs().length === 0) {
          <div class="empty-state">
            <p>Nenhuma triagem registrada no banco de dados ainda.</p>
          </div>
        } @else {
          <table class="triage-table">
            <thead>
              <tr>
                <th>Repositório</th>
                <th>Issue</th>
                <th>Título</th>
                <th>Status</th>
                <th>Categoria</th>
                <th>Publicado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (job of api.recentJobs(); track job.eventId) {
                <tr>
                  <td><code>{{ job.repository }}</code></td>
                  <td><strong>#{{ job.issueNumber }}</strong></td>
                  <td class="td-title">{{ job.title }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusBadgeClass(job.status)">
                      {{ getStatusLabel(job.status) }}
                    </span>
                  </td>
                  <td>{{ job.category || '—' }}</td>
                  <td>{{ job.publishedAt ? (job.publishedAt | date:'dd/MM/yyyy HH:mm:ss') : '—' }}</td>
                  <td>
                    <a [routerLink]="['/issues', getOwner(job.repository), getRepo(job.repository), job.issueNumber]" class="btn-link">
                      Ver Análise →
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .system-status-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      background: white;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      font-size: 0.85rem;
    }
    .status-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.green { background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.2); }
    .status-label { color: #64748b; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .page-header h2 { margin: 0; color: #1e293b; font-size: 1.5rem; }
    .subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.95rem; }
    .header-actions { display: flex; gap: 0.75rem; align-items: center; }
    .btn {
      padding: 0.55rem 1.1rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      font-size: 0.9rem;
      transition: background 0.15s ease;
    }
    .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
    .btn-secondary { background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background-color: #e2e8f0; }
    .btn-github { background-color: #24292f; color: white; }
    .btn-github:hover { background-color: #1b1f23; }
    .btn-action-triage { background: #10b981; color: white; }
    .btn-action-triage:hover { background: #059669; }
    .btn-outline-triage { background: white; color: #0284c7; border: 1px solid #bae6fd; }
    .btn-outline-triage:hover { background: #f0f9ff; }
    .webhook-banner {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 1.25rem;
    }
    .webhook-header { display: flex; justify-content: space-between; align-items: center; }
    .webhook-header h3 { margin: 0; color: #1e40af; font-size: 1.1rem; }
    .btn-close { background: transparent; border: none; font-size: 1.2rem; cursor: pointer; color: #64748b; }
    .webhook-config-box {
      margin-top: 0.75rem;
      background: white;
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid #dbeafe;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.9rem;
    }
    .alert-danger {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 1rem;
    }
    .metric-card {
      background: white;
      padding: 1.25rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
    }
    .metric-label { font-size: 0.85rem; color: #64748b; font-weight: 500; }
    .metric-value { font-size: 1.85rem; font-weight: 700; color: #0f172a; margin-top: 0.5rem; }
    .github-section {
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 1.5rem;
    }
    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .section-title-row h3 { margin: 0; color: #0f172a; }
    .section-title-row p { margin: 0.2rem 0 0; color: #64748b; font-size: 0.85rem; }
    .repos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .repo-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 1rem;
      cursor: pointer;
      background: #fafafa;
      transition: all 0.15s ease;
    }
    .repo-card:hover { border-color: #3b82f6; }
    .repo-card.selected { border-color: #2563eb; background: #f0f7ff; box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }
    .repo-card-header { display: flex; justify-content: space-between; align-items: center; }
    .badge-issues { background: #e2e8f0; color: #334155; font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px; }
    .repo-full-name { font-size: 0.8rem; color: #64748b; margin: 0.35rem 0; }
    .repo-card-footer { display: flex; justify-content: space-between; font-size: 0.8rem; margin-top: 0.5rem; }
    .privacy-badge { color: #64748b; }
    .action-text { color: #2563eb; font-weight: 600; }
    .issues-panel {
      margin-top: 1.5rem;
      border-top: 1px solid #f1f5f9;
      padding-top: 1.5rem;
    }
    .issues-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .issues-header h4 { margin: 0; color: #1e293b; font-size: 1.15rem; }
    .sub-header { margin: 0.2rem 0 0; font-size: 0.85rem; color: #64748b; }
    .issues-count { font-size: 0.85rem; color: #64748b; }
    .issues-list { display: flex; flex-direction: column; gap: 0.85rem; }
    .issue-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
      gap: 1rem;
    }
    .issue-item.item-triaged { border-left: 4px solid #10b981; }
    .issue-info { flex: 1; }
    .issue-title-row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .issue-number { font-weight: 700; color: #475569; font-size: 0.95rem; }
    .issue-link { color: #0f172a; text-decoration: none; font-weight: 600; }
    .issue-link:hover { color: #2563eb; text-decoration: underline; }
    .issue-body-preview { margin: 0.35rem 0; font-size: 0.85rem; color: #64748b; line-height: 1.4; }
    .job-preview-box {
      margin: 0.4rem 0;
      background: #f8fafc;
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #334155;
      border-left: 3px solid #3b82f6;
    }
    .issue-meta { font-size: 0.75rem; color: #94a3b8; }
    .issue-actions { display: flex; gap: 0.5rem; align-items: center; }
    .table-container {
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow-x: auto;
    }
    .table-header { padding: 1.25rem 1.25rem 0.5rem; }
    .table-header h3 { margin: 0; color: #0f172a; font-size: 1.15rem; }
    .table-header p { margin: 0.2rem 0 0; color: #64748b; font-size: 0.85rem; }
    .triage-table { width: 100%; border-collapse: collapse; text-align: left; }
    .triage-table th { background-color: #f8fafc; padding: 0.75rem 1rem; font-size: 0.85rem; color: #475569; border-bottom: 1px solid #e2e8f0; }
    .triage-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
    .td-title { font-weight: 500; color: #1e293b; max-width: 320px; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-accepted { background: #e0f2fe; color: #0369a1; }
    .badge-processing { background: #fef3c7; color: #b45309; }
    .badge-published { background: #dcfce7; color: #15803d; }
    .badge-review { background: #fee2e2; color: #b91c1c; }
    .badge-category { background: #f3e8ff; color: #7e22ce; }
    .badge-untriaged { background: #f1f5f9; color: #64748b; }
    .btn-link { color: #2563eb; text-decoration: none; font-weight: 600; font-size: 0.85rem; }
    .btn-link:hover { text-decoration: underline; }
    .empty-state { padding: 2rem; text-align: center; color: #64748b; }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  public readonly api = inject(TriageApiService);
  private readonly router = inject(Router);

  public showWebhookGuide = signal<boolean>(false);
  private pollingTimer: any = null;

  ngOnInit(): void {
    this.refresh();
    // Auto-polling a cada 5 segundos para refletir em tempo real novos jobs e conclusões do Worker
    this.pollingTimer = setInterval(() => {
      this.api.loadRecentJobs().subscribe();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
  }

  refresh(): void {
    this.api.loadRecentJobs().subscribe();
    this.api.loadGitHubRepositories();
  }

  loadRepos(): void {
    this.api.loadGitHubRepositories();
  }

  selectRepository(repo: GitHubRepo): void {
    this.api.selectRepository(repo.fullName);
  }

  triageIssue(issueNumber: number): void {
    const selected = this.api.selectedRepo();
    if (!selected) return;
    const [owner, name] = selected.split('/');

    this.api.triggerIssueTriage(owner, name, issueNumber).subscribe({
      next: () => {
        this.router.navigate(['/issues', owner, name, issueNumber]);
      }
    });
  }

  getJob(repository: string, issueNumber: number): TriageResult | undefined {
    return this.api.getJobForIssue(repository, issueNumber);
  }

  toggleWebhookInfo(): void {
    this.showWebhookGuide.set(!this.showWebhookGuide());
  }

  getPreview(body?: string): string {
    if (!body) return 'Sem descrição no corpo da issue.';
    return body.length > 120 ? body.substring(0, 120) + '...' : body;
  }

  countByStatus(status: string): number {
    return this.api.recentJobs().filter(j => j.status === status).length;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'Accepted': return '⏳ Na Fila';
      case 'Processing': return '⚙️ Analisando';
      case 'Published': return '✅ Publicado';
      case 'HumanReviewRequired': return '⚠️ Revisão Humana';
      default: return status;
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Accepted': return 'badge-accepted';
      case 'Processing': return 'badge-processing';
      case 'Published': return 'badge-published';
      case 'HumanReviewRequired': return 'badge-review';
      default: return '';
    }
  }

  getOwner(repo: string): string {
    return repo.split('/')[0] || '';
  }

  getRepo(repo: string): string {
    return repo.split('/')[1] || '';
  }
}
