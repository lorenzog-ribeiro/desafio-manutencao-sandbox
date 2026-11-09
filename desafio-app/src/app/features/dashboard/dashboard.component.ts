import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { CategoryFilter, CategoryKey, toTriageView } from '../../models/triage-view';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="dash-head">
        <div class="page-head">
          <div class="eyebrow">Visão principal</div>
          <h1 class="page-title">Fila de Triagem</h1>
          <p class="page-lede">Eventos de issues recebidos do GitHub, classificados pelos agentes especialistas.</p>
        </div>
        <div class="dash-actions">
          <button type="button" class="btn btn-secondary" (click)="refresh()" [disabled]="api.isLoading()">
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">sync</span>
            Atualizar
          </button>
          <a class="btn btn-primary" routerLink="/catalog">
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">menu_book</span>
            Ver Catálogo
          </a>
        </div>
      </div>

      @if (api.error(); as error) {
        <div class="notice notice-error" role="alert">{{ error }}</div>
      }

      <div class="metrics">
        @for (metric of metrics(); track metric.key) {
          <button
            type="button"
            class="metric"
            [class.metric-on]="filter() === metric.key"
            [attr.aria-label]="'Filtrar por ' + metric.label + ': ' + metric.value"
            (click)="filter.set(metric.key)">
            <span class="metric-label"><span class="md" [class]="'md md-' + metric.key"></span>{{ metric.label }}</span>
            <span class="metric-value">{{ metric.value }}</span>
            <span class="mono metric-hint">{{ metric.hint }}</span>
          </button>
        }
      </div>

      <section class="card queue">
        <div class="toolbar">
          <div class="chips">
            @for (chip of chips(); track chip.key) {
              <button type="button" class="chip" [class.chip-on]="filter() === chip.key" (click)="filter.set(chip.key)">
                {{ chip.label }} <span class="cnt">{{ chip.count }}</span>
              </button>
            }
          </div>
          <div class="search">
            <label for="search" class="visually-hidden">Buscar eventos</label>
            <span class="material-symbols-outlined icon-sm search-icon" aria-hidden="true">search</span>
            <input
              id="search"
              class="input"
              type="search"
              placeholder="Buscar repositório, #issue ou título"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)">
          </div>
        </div>

        <div class="table-scroll">
          <div class="table">
            <div class="row-head">
              <div>Repositório</div><div>Issue</div><div>Categoria</div><div>Estado</div><div>Ação no GitHub</div><div class="align-right">Ação</div>
            </div>

            @for (row of rows(); track row.job.eventId) {
              <div class="row" [class.row-fresh]="api.freshEventIds().has(row.job.eventId)">
                <div class="cell-min">
                  <div class="mono cell-owner">{{ row.owner }}/</div>
                  <div class="mono cell-repo">{{ row.repoName }}</div>
                </div>
                <div class="cell-min cell-issue">
                  <div class="issue-line">
                    <span class="mono issue-number">{{ row.numberLabel }}</span>
                    <span class="issue-title">{{ row.job.title }}</span>
                  </div>
                  <span class="mono cell-sub">
                    @if (row.job.publishedAt) {
                      publicado em {{ row.job.publishedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
                    } @else {
                      {{ row.job.eventId }}
                    }
                  </span>
                </div>
                <div>
                  <span class="badge" [class]="'badge ' + row.catClass">
                    @if (row.classified) {
                      <span class="dot"></span>
                    } @else {
                      <span class="material-symbols-outlined icon-xs spin" aria-hidden="true">progress_activity</span>
                    }
                    {{ row.catLabel }}
                  </span>
                </div>
                <div><span [class]="'st ' + row.statusClass">{{ row.statusLabel }}</span></div>
                <div>
                  <span class="gh" [class]="'gh gh-' + row.github">
                    @switch (row.github) {
                      @case ('published') {
                        <span class="material-symbols-outlined icon-sm" aria-hidden="true">check</span>
                      }
                      @case ('blocked') {
                        <span class="material-symbols-outlined icon-sm" aria-hidden="true">block</span>
                      }
                      @default {
                        <span class="material-symbols-outlined icon-sm spin" aria-hidden="true">progress_activity</span>
                      }
                    }
                    {{ row.githubLabel }}
                  </span>
                </div>
                <div class="align-right">
                  <a class="btn btn-sm" [routerLink]="row.detailLink">Inspecionar detalhes</a>
                </div>
              </div>
            }
          </div>
        </div>

        @if (!api.jobsLoaded() && !api.error()) {
          <div class="empty"><p>Carregando eventos…</p></div>
        } @else if (rows().length === 0) {
          <div class="empty">
            <svg width="120" height="88" viewBox="0 0 120 88" fill="none" aria-hidden="true">
              <rect x="14" y="18" width="92" height="58" rx="10" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="4 4"></rect>
              <rect x="26" y="30" width="44" height="6" rx="3" fill="#E2E8F0"></rect>
              <rect x="26" y="44" width="68" height="6" rx="3" fill="#F1F5F9"></rect>
              <rect x="26" y="58" width="32" height="6" rx="3" fill="#F1F5F9"></rect>
              <circle cx="88" cy="22" r="14" fill="#FFFFFF" stroke="#7C3AED" stroke-width="1.5"></circle>
              <path d="m83 17 10 10M93 17 83 27" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
            <div class="empty-title">Nenhum evento corresponde ao filtro</div>
            <p>Ajuste a categoria ou a busca, ou dispare um evento de teste para ver a triagem acontecer em tempo real.</p>
            <div class="empty-actions">
              <button type="button" class="btn btn-sm" (click)="clearFilters()">Limpar filtros</button>
            </div>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .dash-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
    .dash-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
    .metric {
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--text);
      cursor: pointer;
      font-family: var(--font-sans);
      box-shadow: var(--shadow-xs);
      transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    }
    .metric:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.07); }
    .metric-on, .metric-on:hover { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary) inset; }
    .metric-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); font-weight: 500; }
    .metric-value { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
    .metric-hint { font-size: 11.5px; color: var(--text-muted); }
    .md { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .md-all { background: #4f46e5; }
    .md-bug { background: #ef4444; }
    .md-improvement { background: #3b82f6; }
    .md-question { background: #8b5cf6; }
    .md-review { background: #f59e0b; }

    .queue { overflow: hidden; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
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
    .search { position: relative; flex: 0 1 300px; min-width: 220px; }
    .search-icon { position: absolute; left: 12px; top: 13px; color: var(--text-muted); }
    .search .input { padding-left: 38px; }

    .table-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .table { min-width: 980px; }
    .row, .row-head { display: grid; grid-template-columns: 1.6fr 2.4fr 1.15fr 1.15fr 1.7fr 1fr; gap: 16px; }
    .row-head {
      padding: 12px 20px;
      font: 600 11.5px var(--font-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      background: var(--bg);
      border-top: 1px solid var(--border);
    }
    .row { align-items: center; padding: 14px 20px; border-top: 1px solid var(--surface-muted); transition: background 0.12s; }
    .row:hover { background: var(--bg); }
    .row-fresh { animation: flash 2.2s ease-out; }
    @keyframes flash { 0% { background: #ede9fe; } 100% { background: transparent; } }
    .align-right { text-align: right; }
    .cell-min { min-width: 0; }
    .cell-owner, .cell-sub { font-size: 11.5px; color: var(--text-muted); }
    .cell-repo { font-size: 13px; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cell-issue { display: flex; flex-direction: column; gap: 3px; }
    .cell-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .issue-line { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
    .issue-number { font-size: 13px; color: var(--primary); flex: none; }
    .issue-title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon-xs { font-size: 0.75rem !important; }
    .gh { display: inline-flex; align-items: center; gap: 6px; font: 500 12.5px var(--font-sans); }
    .gh-published { color: var(--success); }
    .gh-blocked { color: var(--warning); }
    .gh-pending { color: var(--text-muted); }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 56px 24px; text-align: center; border-top: 1px solid var(--surface-muted); }
    .empty p { margin: 0; max-width: 380px; color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
    .empty-title { font-size: 16px; font-weight: 600; }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

    /* Media queries para responsividade mobile / tablet / desktop */
    @media (max-width: 900px) {
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .metric:first-child { grid-column: span 2; }
    }

    @media (max-width: 768px) {
      .dash-head { flex-direction: column; align-items: stretch; gap: 14px; }
      .dash-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 100%; }
      .dash-actions .btn { width: 100%; justify-content: center; }
      .toolbar { flex-direction: column; align-items: stretch; gap: 12px; padding: 14px 16px; }
      .chips { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; padding-bottom: 4px; gap: 6px; }
      .chip { flex-shrink: 0; }
      .search { width: 100%; min-width: 100%; flex: 1 1 100%; }
      .row, .row-head { padding: 12px 16px; }
    }

    @media (max-width: 480px) {
      .metrics { grid-template-columns: 1fr; }
      .metric:first-child { grid-column: auto; }
      .dash-actions { grid-template-columns: 1fr; }
      .metric { padding: 14px; }
      .metric-value { font-size: 26px; }
    }
  `]
})
export class DashboardComponent {
  public readonly api = inject(TriageApiService);

  public readonly filter = signal<CategoryFilter>('all');
  public readonly search = signal('');

  private readonly views = computed(() => this.api.recentJobs().map(toTriageView));

  private readonly counts = computed(() => {
    const count = (key: CategoryKey) => this.views().filter((view) => view.key === key).length;
    return { bug: count('bug'), improvement: count('improvement'), question: count('question'), review: count('review') };
  });

  public readonly metrics = computed(() => {
    const counts = this.counts();
    const published = this.views().filter((view) => view.github === 'published').length;
    return [
      { key: 'all' as const, label: 'Issues triadas', value: this.views().length, hint: `${published} comentários publicados` },
      { key: 'bug' as const, label: 'Bugs', value: counts.bug, hint: 'Bug Specialist Agent' },
      { key: 'improvement' as const, label: 'Melhorias', value: counts.improvement, hint: 'Improvement Specialist' },
      { key: 'question' as const, label: 'Dúvidas', value: counts.question, hint: 'Question Specialist' },
      { key: 'review' as const, label: 'Revisão Humana', value: counts.review, hint: 'aguardando mantenedor' }
    ];
  });

  public readonly chips = computed(() => {
    const counts = this.counts();
    return [
      { key: 'all' as const, label: 'Todas', count: this.views().length },
      { key: 'bug' as const, label: 'Bugs', count: counts.bug },
      { key: 'improvement' as const, label: 'Melhorias', count: counts.improvement },
      { key: 'question' as const, label: 'Dúvidas', count: counts.question },
      { key: 'review' as const, label: 'Revisão Humana', count: counts.review }
    ];
  });

  public readonly rows = computed(() => {
    const filter = this.filter();
    const query = this.search().trim().toLowerCase();
    return this.views().filter((view) => {
      const matchesCategory = filter === 'all' || view.key === filter;
      const haystack = `${view.job.repository} #${view.job.issueNumber} ${view.job.title}`.toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    });
  });

  public clearFilters(): void {
    this.filter.set('all');
    this.search.set('');
  }

  public refresh(): void {
    this.api.loadRecentJobs().subscribe();
  }
}
