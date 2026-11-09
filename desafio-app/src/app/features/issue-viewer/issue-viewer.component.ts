import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TriageApiService } from '../../services/triage-api.service';
import { GitHubIssue, TriageResult } from '../../models/triage.model';
import {
  buildCommentPreview,
  buildPipeline,
  hasProposal,
  isCatalogRejection,
  missingInformation,
  proposalSteps,
  proposalSummary,
  specialistFor,
  toTriageView
} from '../../models/triage-view';
import { TriagePipelineComponent } from '../../shared/triage-pipeline.component';

@Component({
  selector: 'app-issue-viewer',
  standalone: true,
  imports: [DatePipe, RouterLink, TriagePipelineComponent],
  template: `
    <div class="detail">
      <div class="back-row">
        <a class="btn btn-sm btn-ghost back" routerLink="/dashboard">
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">arrow_back</span>
          Voltar ao painel
        </a>
        @if (result()) {
          <button type="button" class="btn btn-sm" [disabled]="!canRetrigger()" (click)="retrigger()">
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">refresh</span>
            {{ api.isTriagingIssue() === issueNumber() ? 'Enviando…' : 'Re-executar triagem' }}
          </button>
        }
      </div>

      @if (isLoading()) {
        <div class="card state-card"><p>Carregando diagnóstico…</p></div>
      } @else if (view(); as d) {
        <section class="card panel">
          <div class="tags">
            <span class="mono tag-repo">{{ d.job.repository }}</span>
            <span class="mono tag-number">{{ d.numberLabel }}</span>
            <span [class]="'badge ' + d.catClass">
              @if (d.classified) {
                <span class="dot"></span>
              }
              {{ d.catLabel }}
            </span>
            <span [class]="'st ' + d.statusClass">{{ d.statusLabel }}</span>
          </div>
          <h1 class="issue-heading">{{ d.job.title }}</h1>
          @if (issue(); as source) {
            <div class="issue-meta">
              <span class="author">
                <span class="material-symbols-outlined icon-sm" aria-hidden="true">person</span>
                &#64;{{ source.author || 'autor' }} abriu esta issue
              </span>
              <span class="mono meta-date">aberta em {{ source.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
            </div>
          }
          <div>
            <div class="section-label label-gap">Corpo original enviado</div>
            <pre class="code issue-body">{{ bodyText() }}</pre>
          </div>
        </section>

        <div class="columns">
          <div class="column column-left">
            <section class="card panel routing">
              <h2 class="card-title">
                <span class="material-symbols-outlined icon-md ai" aria-hidden="true">smart_toy</span>
                Roteamento da IA <span class="mono harness">harness</span>
              </h2>

              <app-triage-pipeline [steps]="pipeline()" />

              @if (proposed()) {
                <div class="specialist">
                  <div class="specialist-text">
                    <span class="specialist-label">Especialista acionado</span>
                    <span class="specialist-name">{{ specialist() }}</span>
                  </div>
                  <span class="mono specialist-cat">categoria {{ d.job.category }}</span>
                </div>
              }

              @if (catalogRejected()) {
                <div class="dashed-warning">Repositório sem cadastro no catálogo: nenhuma diretriz disponível, triagem automática interrompida.</div>
              }
            </section>

            <section class="card panel">
              <h2 class="card-title">
                <span class="material-symbols-outlined icon-md primary" aria-hidden="true">build</span>
                Proposta gerada
              </h2>

              @if (!d.done) {
                <div class="waiting">
                  <span class="material-symbols-outlined icon-sm spin" aria-hidden="true">progress_activity</span>
                  O especialista ainda está analisando esta issue…
                </div>
              } @else if (proposed()) {
                <div class="proposal">
                  <div>
                    <div class="section-label label-gap">Resumo estruturado</div>
                    <p class="summary">{{ summary() }}</p>
                  </div>
                  @if (steps().length > 0) {
                    <div>
                      <div class="section-label label-gap">Próximo passo recomendado</div>
                      <ol class="steps">
                        @for (step of steps(); track $index) {
                          <li>{{ step }}</li>
                        }
                      </ol>
                    </div>
                  }
                  @if (missingInfo(); as info) {
                    <div class="amber-note">
                      <span class="material-symbols-outlined icon-sm" aria-hidden="true">info</span>
                      <span><strong>Informações solicitadas ao autor:</strong> {{ info }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="amber-note">
                  <span class="material-symbols-outlined icon-sm" aria-hidden="true">info</span>
                  <span>{{ d.job.failureReason || 'Encaminhado para revisão humana sem proposta gerada.' }}</span>
                </div>
              }
            </section>
          </div>

          <div class="column column-right">
            <section class="card comment-card">
              <div class="comment-head">
                <h2 class="card-title">
                  <span class="material-symbols-outlined icon-md primary" aria-hidden="true">chat_bubble</span>
                  GitHub Comment
                </h2>
                @if (comment()) {
                  <div class="seg" role="group" aria-label="Modo de visualização">
                    <button type="button" class="seg-b" [class.seg-on]="commentView() === 'preview'" (click)="commentView.set('preview')">Preview</button>
                    <button type="button" class="seg-b" [class.seg-on]="commentView() === 'raw'" (click)="commentView.set('raw')">Markdown</button>
                  </div>
                }
              </div>

              @if (!d.done) {
                <div class="comment-empty">Nenhum comentário ainda. A publicação acontece ao fim da triagem.</div>
              } @else if (comment(); as c) {
                <div class="comment-body">
                  <div class="gh-box">
                    <div class="gh-box-head">
                      <span class="gh-avatar">
                        <span class="material-symbols-outlined icon-xs" aria-hidden="true">monitor_heart</span>
                      </span>
                      <span class="gh-author">autotriage-bot</span>
                      <span class="gh-tag">bot</span>
                      <span class="gh-verb">
                        @if (d.job.publishedAt) {
                          comentou em {{ d.job.publishedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
                        } @else {
                          não publicado
                        }
                      </span>
                    </div>

                    @if (commentView() === 'preview') {
                      <div class="gh-preview">
                        <div class="gh-heading">{{ c.heading }}</div>
                        @if (c.category) {
                          <p><strong>Categoria Identificada:</strong> <code>{{ c.category }}</code></p>
                        }
                        @for (section of c.sections; track section.title) {
                          <div class="gh-section">
                            <strong>{{ section.title }}</strong>
                            <p class="gh-text">{{ section.text }}</p>
                          </div>
                        }
                        <div class="gh-footer">{{ c.footer }}</div>
                      </div>
                    } @else {
                      <pre class="code gh-raw">{{ c.markdown }}</pre>
                    }
                  </div>

                  @if (d.job.publishedAt) {
                    <a class="ext" [href]="githubUrl()" target="_blank" rel="noopener noreferrer">
                      Ver na issue real
                      <span class="material-symbols-outlined icon-sm" aria-hidden="true">open_in_new</span>
                    </a>
                  }
                </div>
              } @else {
                <div class="comment-body">
                  <div class="notice notice-orange">Nenhum comentário foi publicado: a ação externa foi bloqueada e a issue aguarda revisão humana.</div>
                </div>
              }
            </section>

            <section class="card panel idem">
              <h2 class="card-title">
                <span class="material-symbols-outlined icon-md ai" aria-hidden="true">tag</span>
                Registro de idempotência
              </h2>
              <dl>
                @for (entry of idempotency(); track entry.key) {
                  <div class="idem-row">
                    <dt>{{ entry.key }}</dt>
                    <dd class="mono">{{ entry.value }}</dd>
                  </div>
                }
              </dl>
              <div class="idem-note">
                <span class="material-symbols-outlined icon-sm" aria-hidden="true">verified_user</span>
                Reentregas do mesmo evento são reconhecidas pela chave e descartadas antes de qualquer ação externa.
              </div>
            </section>
          </div>
        </div>
      } @else {
        <div class="card state-card">
          <span class="material-symbols-outlined icon-lg ai" aria-hidden="true">search</span>
          <div class="state-title">Nenhum registro de triagem</div>
          <p>A issue <code>{{ owner() }}/{{ repo() }}#{{ issueNumber() }}</code> ainda não foi triada.</p>
          <button type="button" class="btn btn-ai" [disabled]="api.isTriagingIssue() === issueNumber()" (click)="retrigger()">Iniciar triagem agora</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .detail { display: flex; flex-direction: column; gap: 20px; }
    .back-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .back { padding-left: 6px; }
    .panel { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
    .routing { gap: 18px; }
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .tag-repo { font-size: 13px; color: var(--text-muted); }
    .tag-number { font-size: 13px; color: var(--primary); }
    .issue-heading { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.015em; }
    .issue-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--text-secondary); }
    .author { display: inline-flex; align-items: center; gap: 6px; }
    .meta-date { color: var(--text-muted); }
    .label-gap { margin-bottom: 8px; }
    .issue-body { font-family: var(--font-sans); font-size: 14px; line-height: 1.6; color: var(--text-strong); }
    .columns { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
    .column { min-width: 0; display: flex; flex-direction: column; gap: 20px; }
    .column-left { flex: 1 1 520px; }
    .column-right { flex: 1 1 460px; }
    .ai { color: var(--ai); }
    .primary { color: var(--primary); }
    .harness { font-size: 12px; color: var(--text-muted); font-weight: 400; }
    .specialist { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 10px; background: var(--ai-soft); border: 1px solid var(--ai-border); }
    .specialist-text { display: flex; flex-direction: column; gap: 3px; }
    .specialist-label { font-size: 12px; color: var(--ai-hover); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .specialist-name { font-size: 16px; font-weight: 600; }
    .specialist-cat { font-size: 12.5px; color: var(--ai-hover); }
    .dashed-warning { font-size: 13.5px; color: var(--warning); padding: 12px 14px; border-radius: 10px; border: 1px dashed #fcd34d; background: var(--warning-soft); }
    .waiting { display: flex; align-items: center; gap: 10px; color: var(--ai-hover); font-size: 14px; padding: 18px; border-radius: 10px; border: 1px dashed #c4b5fd; background: var(--ai-soft); }
    .proposal { display: flex; flex-direction: column; gap: 16px; }
    .summary { margin: 0; font-size: 14.5px; line-height: 1.6; color: var(--text-strong); }
    .steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.5; color: var(--text-strong); }
    .amber-note { display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; background: var(--warning-soft); border: 1px solid var(--warning-border); font-size: 13px; line-height: 1.5; color: #78350f; }
    .amber-note .material-symbols-outlined { flex: none; margin-top: 2px; color: var(--warning); }

    .comment-card { overflow: hidden; }
    .comment-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .seg { display: inline-flex; padding: 3px; border-radius: 9px; background: var(--surface-muted); border: 1px solid var(--border); }
    .seg-b { min-height: 30px; padding: 0 12px; border-radius: 6px; border: 0; background: transparent; color: var(--text-secondary); font: 500 12.5px var(--font-sans); cursor: pointer; }
    .seg-b:hover { color: var(--text); }
    .seg-on { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1); }
    .comment-empty { padding: 32px 20px; text-align: center; color: var(--text-secondary); font-size: 14px; }
    .comment-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
    .gh-box { border: 1px solid #d0d7de; border-radius: 10px; overflow: hidden; background: var(--surface); }
    .gh-box-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; font-size: 13px; }
    .gh-avatar { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--ai)); display: inline-flex; align-items: center; justify-content: center; color: #ffffff; }
    .icon-xs { font-size: 0.75rem !important; }
    .gh-author { font-weight: 600; color: #1f2328; }
    .gh-tag { font-size: 11px; padding: 1px 6px; border: 1px solid #d0d7de; border-radius: 999px; color: #59636e; }
    .gh-verb { color: #59636e; }
    .gh-preview { padding: 16px 18px; color: #1f2328; font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; gap: 12px; }
    .gh-preview p { margin: 0; }
    .gh-preview code { font: 12.5px var(--font-mono); background: #eff1f3; padding: 2px 5px; border-radius: 4px; }
    .gh-heading { font-size: 18px; font-weight: 600; padding-bottom: 8px; border-bottom: 1px solid #d8dee4; }
    .gh-section { display: flex; flex-direction: column; gap: 6px; }
    .gh-text { white-space: pre-line; }
    .gh-footer { border-top: 1px solid #d8dee4; padding-top: 8px; font-size: 12.5px; font-style: italic; color: #59636e; }
    .gh-raw { border: 0; border-radius: 0; background: #f6f8fa; color: #1f2328; }
    .ext { display: inline-flex; align-items: center; gap: 6px; font: 500 13px var(--font-sans); }

    .idem { padding: 20px; gap: 14px; }
    dl { margin: 0; display: flex; flex-direction: column; }
    .idem-row { display: grid; grid-template-columns: minmax(0, 150px) minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid var(--surface-muted); }
    dt { font-size: 12.5px; color: var(--text-secondary); }
    dd { margin: 0; font-size: 12.5px; color: var(--text); word-break: break-all; }
    .idem-note { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
    .idem-note .material-symbols-outlined { flex: none; margin-top: 2px; color: var(--success); }

    .state-card { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 64px 24px; text-align: center; }
    .state-card p { margin: 0; color: var(--text-secondary); font-size: 14px; }
    .state-title { font-size: 16px; font-weight: 600; }

    /* Media queries para responsividade */
    @media (max-width: 1024px) {
      .columns { flex-direction: column; gap: 16px; }
      .column-left, .column-right { width: 100%; flex: 1 1 100%; min-width: 0; }
    }

    @media (max-width: 768px) {
      .panel { padding: 18px 16px; }
      .comment-body { padding: 14px 16px; }
      .comment-head { padding: 14px 16px; }
      .issue-heading { font-size: 20px; word-break: break-word; }
      .idem-row { grid-template-columns: 1fr; gap: 4px; padding: 10px 0; }
      .idem-row dt { font-weight: 600; }
    }

    @media (max-width: 480px) {
      .back-row { flex-direction: column; align-items: stretch; gap: 10px; }
      .back-row .btn { width: 100%; justify-content: center; }
      .specialist { flex-direction: column; align-items: flex-start; gap: 8px; }
      .comment-head { flex-direction: column; align-items: flex-start; gap: 10px; }
      .comment-head .seg { width: 100%; }
      .comment-head .seg-b { flex: 1; text-align: center; }
      .gh-box-head { font-size: 12px; gap: 6px; }
    }
  `]
})
export class IssueViewerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly datePipe = new DatePipe('en-US');
  public readonly api = inject(TriageApiService);

  public readonly owner = signal('');
  public readonly repo = signal('');
  public readonly issueNumber = signal(0);

  public readonly result = signal<TriageResult | null>(null);
  public readonly issue = signal<GitHubIssue | null>(null);
  public readonly isLoading = signal(true);
  public readonly commentView = signal<'preview' | 'raw'>('preview');

  public readonly view = computed(() => {
    const job = this.result();
    return job ? toTriageView(job) : null;
  });
  public readonly pipeline = computed(() => {
    const view = this.view();
    return view ? buildPipeline(view) : [];
  });
  public readonly proposed = computed(() => {
    const job = this.result();
    return !!job && hasProposal(job);
  });
  public readonly catalogRejected = computed(() => {
    const job = this.result();
    return !!job && isCatalogRejection(job);
  });
  public readonly specialist = computed(() => {
    const job = this.result();
    return job ? specialistFor(job) : '';
  });
  public readonly summary = computed(() => {
    const job = this.result();
    return job ? proposalSummary(job) : '';
  });
  public readonly steps = computed(() => {
    const job = this.result();
    return job ? proposalSteps(job) : [];
  });
  public readonly missingInfo = computed(() => {
    const job = this.result();
    return job ? missingInformation(job) : null;
  });
  public readonly comment = computed(() => {
    const job = this.result();
    return job && this.view()?.done && hasProposal(job) ? buildCommentPreview(job) : null;
  });
  public readonly bodyText = computed(() => {
    const source = this.issue();
    if (!source) {
      return 'Corpo indisponível: a API só expõe o texto de issues abertas no GitHub.';
    }
    return source.body?.trim() ? source.body : '(descrição vazia)';
  });
  public readonly githubUrl = computed(
    () => this.issue()?.htmlUrl ?? `https://github.com/${this.owner()}/${this.repo()}/issues/${this.issueNumber()}`
  );
  public readonly canRetrigger = computed(() => {
    const view = this.view();
    return (!view || view.done) && this.api.isTriagingIssue() !== this.issueNumber();
  });
  public readonly idempotency = computed(() => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const { job, done } = view;
    const confirmed = job.publishedAt
      ? this.datePipe.transform(job.publishedAt, 'dd/MM/yyyy HH:mm:ss') ?? job.publishedAt
      : done
        ? 'bloqueada · revisão humana'
        : 'pendente';
    return [
      { key: 'Event ID', value: job.eventId },
      { key: 'Chave de idempotência', value: `${job.repository}#${job.issueNumber}` },
      { key: 'Status do job', value: job.status },
      { key: 'Publicação confirmada', value: confirmed }
    ];
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.owner.set(params.get('owner') || '');
      this.repo.set(params.get('repo') || '');
      this.issueNumber.set(Number(params.get('number') || 0));
      if (this.owner() && this.repo() && this.issueNumber()) {
        this.loadIssue();
      }
    });

    this.pollTimer = setInterval(() => {
      const current = this.result();
      if (current && (current.status === 'Accepted' || current.status === 'Processing')) {
        this.reloadResult();
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  public retrigger(): void {
    this.api.triggerIssueTriage(this.owner(), this.repo(), this.issueNumber()).subscribe({
      next: (data) => this.result.set(data),
      error: () => {}
    });
  }

  private loadIssue(): void {
    this.isLoading.set(true);
    this.api.findOpenIssue(this.owner(), this.repo(), this.issueNumber()).subscribe((issue) => this.issue.set(issue));
    this.api.getTriageResult(this.owner(), this.repo(), this.issueNumber()).subscribe({
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

  private reloadResult(): void {
    this.api.getTriageResult(this.owner(), this.repo(), this.issueNumber()).subscribe({
      next: (data) => this.result.set(data),
      error: () => {}
    });
  }
}
