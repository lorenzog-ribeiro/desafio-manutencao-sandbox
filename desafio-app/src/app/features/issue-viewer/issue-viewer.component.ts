import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { TriageResult } from '../../models/triage.model';

@Component({
  selector: 'app-issue-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="viewer-container">
      <nav class="nav-breadcrumbs">
        <a routerLink="/dashboard">← Voltar ao Painel Geral</a>
      </nav>

      @if (isLoading()) {
        <div class="loading-box">
          <p class="pulse-text">Carregando diagnóstico do PostgreSQL...</p>
        </div>
      } @else if (result(); as item) {
        <div class="card triage-card">
          <header class="triage-header">
            <div>
              <div class="header-badges">
                <span class="repo-badge">{{ item.repository }}</span>
                <span class="badge" [ngClass]="getStatusBadgeClass(item.status)">
                  {{ getStatusLabel(item.status) }}
                </span>
                @if (item.category) {
                  <span class="badge badge-category">{{ item.category }}</span>
                }
              </div>
              <h1>Issue #{{ item.issueNumber }}: {{ item.title }}</h1>
            </div>
            <div class="header-actions">
              <a [href]="getGitHubIssueUrl()" target="_blank" class="btn btn-github">
                Ver no GitHub ↗
              </a>
              <button class="btn btn-secondary" (click)="loadIssue()">
                🔄 Atualizar
              </button>
            </div>
          </header>

          <!-- Banner de Status em Tempo Real -->
          @if (item.status === 'Accepted' || item.status === 'Processing') {
            <div class="realtime-banner processing">
              <span class="spinner">⏳</span>
              <div>
                <strong>Processamento em Andamento</strong>
                <p>O Worker está analisando esta issue com os prompts especialistas. Esta página será atualizada automaticamente assim que o comentário for publicado no GitHub.</p>
              </div>
            </div>
          } @else if (item.status === 'Published') {
            <div class="realtime-banner success">
              <span>✅</span>
              <div>
                <strong>Triagem Concluída com Sucesso</strong>
                <p>A proposta técnica gerada pela IA foi validada e comentada diretamente na issue no GitHub.</p>
              </div>
            </div>
          } @else if (item.status === 'HumanReviewRequired') {
            <div class="realtime-banner warning">
              <span>⚠️</span>
              <div>
                <strong>Atenção: Revisão Humana Solicitada</strong>
                <p>A issue não apresentou passos de reprodução conclusivos ou logs de erro. O bot postou uma notificação no GitHub solicitando evidências adicionais.</p>
              </div>
            </div>
          }

          <!-- Metadados -->
          <div class="meta-row">
            <div>
              <strong>Event ID:</strong> <code>{{ item.eventId }}</code>
            </div>
            @if (item.publishedAt) {
              <div>
                <strong>Publicado em:</strong> {{ item.publishedAt | date:'dd/MM/yyyy HH:mm:ss' }}
              </div>
            }
          </div>

          <!-- Motivo de Revisão Humana / Falha -->
          @if (item.failureReason) {
            <div class="alert alert-warning">
              <strong>Motivo do Encaminhamento:</strong>
              <p>{{ item.failureReason }}</p>
            </div>
          }

          <!-- Diagnóstico da IA -->
          @if (item.problemSummary) {
            <section class="section-box">
              <h3>📋 Resumo do Problema Identificado pela IA</h3>
              <p class="summary-text">{{ item.problemSummary }}</p>
            </section>
          }

          <!-- Próximos Passos -->
          @if (item.suggestedAction) {
            <section class="section-box suggested-action">
              <h3>🎯 Próximos Passos Sugeridos</h3>
              <p class="action-text">{{ item.suggestedAction }}</p>
            </section>
          }

          <!-- Ação de Re-triagem -->
          <div class="footer-actions">
            <button 
              class="btn btn-retriage" 
              (click)="reTriggerTriage()" 
              [disabled]="api.isTriagingIssue() === issueNumber">
              {{ api.isTriagingIssue() === issueNumber ? 'Enviando para Fila...' : '⚡ Re-executar Triagem com IA' }}
            </button>
            <a [href]="getGitHubIssueUrl()" target="_blank" class="github-link-secondary">
              Abrir Issue no GitHub ↗
            </a>
          </div>
        </div>
      } @else {
        <div class="not-found-box">
          <h2>Nenhum Registro de Triagem</h2>
          <p>A issue <code>{{ owner }}/{{ repo }}#{{ issueNumber }}</code> ainda não foi triada.</p>
          <div class="action-row">
            <button class="btn btn-action-triage" (click)="reTriggerTriage()">
              ⚡ Iniciar Triagem Agora
            </button>
            <a routerLink="/dashboard" class="btn btn-secondary">Voltar ao Painel</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .viewer-container {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .nav-breadcrumbs a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.9rem;
    }
    .nav-breadcrumbs a:hover { text-decoration: underline; }
    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 2rem;
    }
    .triage-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .repo-badge {
      font-size: 0.85rem;
      background: #f1f5f9;
      color: #475569;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-family: monospace;
    }
    .triage-header h1 {
      margin: 0;
      font-size: 1.45rem;
      color: #0f172a;
    }
    .header-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .realtime-banner {
      margin-top: 1.5rem;
      display: flex;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 6px;
      font-size: 0.9rem;
      align-items: flex-start;
    }
    .realtime-banner p { margin: 0.25rem 0 0; color: #475569; }
    .realtime-banner.processing {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .realtime-banner.success {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }
    .realtime-banner.warning {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      color: #92400e;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .badge-accepted { background: #e0f2fe; color: #0369a1; }
    .badge-processing { background: #fef3c7; color: #b45309; }
    .badge-published { background: #dcfce7; color: #15803d; }
    .badge-review { background: #fee2e2; color: #b91c1c; }
    .badge-category { background: #f3e8ff; color: #7e22ce; }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      padding: 1rem 0;
      font-size: 0.9rem;
      color: #475569;
      border-bottom: 1px solid #f1f5f9;
    }
    .section-box {
      margin-top: 1.5rem;
      background: #f8fafc;
      padding: 1.25rem;
      border-radius: 6px;
      border-left: 4px solid #3b82f6;
    }
    .section-box.suggested-action {
      border-left-color: #10b981;
    }
    .section-box h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      color: #1e293b;
    }
    .summary-text, .action-text {
      margin: 0;
      color: #334155;
      line-height: 1.55;
    }
    .alert-warning {
      margin-top: 1.5rem;
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 1rem;
      border-radius: 6px;
      color: #92400e;
    }
    .alert-warning p { margin: 0.25rem 0 0; }
    .footer-actions {
      margin-top: 2rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      font-size: 0.9rem;
    }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-github { background: #24292f; color: white; }
    .btn-github:hover { background: #1b1f23; }
    .btn-action-triage, .btn-retriage { background: #10b981; color: white; }
    .btn-action-triage:hover, .btn-retriage:hover { background: #059669; }
    .github-link-secondary { color: #64748b; font-size: 0.9rem; text-decoration: none; }
    .github-link-secondary:hover { color: #0f172a; text-decoration: underline; }
    .loading-box, .not-found-box {
      text-align: center;
      padding: 3rem;
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .action-row { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; }
  `]
})
export class IssueViewerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  public readonly api = inject(TriageApiService);

  public owner = '';
  public repo = '';
  public issueNumber = 0;

  public result = signal<TriageResult | null>(null);
  public isLoading = signal<boolean>(true);
  private pollTimer: any = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.owner = params.get('owner') || '';
      this.repo = params.get('repo') || '';
      this.issueNumber = Number(params.get('number') || 0);
      if (this.owner && this.repo && this.issueNumber) {
        this.loadIssue();
      }
    });

    // Se estiver aguardando processamento, faz polling a cada 2 segundos
    this.pollTimer = setInterval(() => {
      const current = this.result();
      if (current && (current.status === 'Accepted' || current.status === 'Processing')) {
        this.silentReload();
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  loadIssue(): void {
    this.isLoading.set(true);
    this.api.getTriageResult(this.owner, this.repo, this.issueNumber).subscribe({
      next: (data) => {
        this.result.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.result.set(null);
        this.isLoading.set(false);
      }
    });
  }

  silentReload(): void {
    this.api.getTriageResult(this.owner, this.repo, this.issueNumber).subscribe({
      next: (data) => this.result.set(data),
      error: () => {}
    });
  }

  reTriggerTriage(): void {
    this.api.triggerIssueTriage(this.owner, this.repo, this.issueNumber).subscribe({
      next: (data) => {
        this.result.set(data);
        this.silentReload();
      }
    });
  }

  getGitHubIssueUrl(): string {
    return `https://github.com/${this.owner}/${this.repo}/issues/${this.issueNumber}`;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'Accepted': return '⏳ Na Fila';
      case 'Processing': return '⚙️ Em Análise';
      case 'Published': return '✅ Publicado no GitHub';
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
}
