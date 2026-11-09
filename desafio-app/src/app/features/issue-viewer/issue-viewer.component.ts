import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
          <div class="original-body-container">
            <div class="issue-body-header">
              <div class="section-label">Corpo original enviado</div>
              <div class="seg" role="group" aria-label="Modo de visualização do corpo da issue">
                <button type="button" class="seg-b" [class.seg-on]="bodyView() === 'preview'" (click)="bodyView.set('preview')">Preview</button>
                <button type="button" class="seg-b" [class.seg-on]="bodyView() === 'raw'" (click)="bodyView.set('raw')">Markdown</button>
              </div>
            </div>

            <div class="gh-box">
              <div class="gh-box-head">
                <span class="gh-avatar gh-avatar-user">
                  <span class="material-symbols-outlined icon-xs" aria-hidden="true">person</span>
                </span>
                <span class="gh-author">&#64;{{ issue()?.author || 'autor' }}</span>
                <span class="gh-tag gh-tag-author">autor</span>
                <span class="gh-verb">
                  @if (issue()?.createdAt) {
                    abriu esta issue em {{ issue()?.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}
                  } @else {
                    descrição da issue no GitHub
                  }
                </span>
              </div>

              @if (bodyView() === 'preview') {
                <div class="gh-preview gh-markdown" [innerHTML]="formattedBodyHtml()"></div>
              } @else {
                <pre class="code gh-raw">{{ bodyText() }}</pre>
              }
            </div>
          </div>
        </section>

        <div class="cards-grid">
          <!-- Card 1: Roteamento da IA -->
          <section class="card panel card-routing">
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

          <!-- Card 2: GitHub Comment -->
          <section class="card comment-card card-comment">
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

          <!-- Card 3: Proposta gerada -->
          <section class="card panel card-proposal">
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

          <!-- Card 4: Registro de idempotência -->
          <section class="card panel idem card-idem">
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
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        "routing comment"
        "proposal idem";
      gap: 20px;
      align-items: stretch;
    }
    .card-routing {
      grid-area: routing;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-routing .specialist,
    .card-routing .dashed-warning {
      margin-top: auto;
    }
    .card-comment {
      grid-area: comment;
      display: flex;
      flex-direction: column;
    }
    .card-comment .comment-body {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-comment .gh-box {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-proposal {
      grid-area: proposal;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-proposal .proposal {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-idem {
      grid-area: idem;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card-idem .idem-note {
      margin-top: auto;
      padding-top: 10px;
    }
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

    .original-body-container { display: flex; flex-direction: column; }
    .issue-body-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .gh-avatar-user { background: linear-gradient(135deg, #0284c7, #2563eb); }
    .gh-tag-author { color: #0369a1; border-color: #bae6fd; background: #f0f9ff; }
    .gh-markdown { font-size: 14px; line-height: 1.6; color: #1f2328; }
    .gh-markdown .md-heading { margin: 16px 0 8px 0; font-size: 15px; font-weight: 600; color: #1f2328; border-bottom: 1px solid #eaeef2; padding-bottom: 4px; }
    .gh-markdown .md-heading:first-child { margin-top: 0; }
    .gh-markdown .md-p { margin: 0 0 10px 0; line-height: 1.6; }
    .gh-markdown .md-p:last-child { margin-bottom: 0; }
    .gh-markdown .md-inline-code { font: 12.5px var(--font-mono); background: #eff1f3; padding: 2px 6px; border-radius: 4px; color: #0f172a; }
    .gh-markdown .md-code-block { margin: 10px 0; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
    .gh-markdown .md-code-block code { font: 12.5px/1.55 var(--font-mono); color: #1f2328; white-space: pre-wrap; word-break: break-word; }
    .gh-markdown .md-ul, .gh-markdown .md-ol { margin: 6px 0 12px 0; padding-left: 20px; }
    .gh-markdown .md-li, .gh-markdown .md-oli { margin-bottom: 4px; line-height: 1.55; }
    .gh-markdown .md-quote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--border-strong); color: var(--text-secondary); background: var(--surface-muted); border-radius: 0 6px 6px 0; }

    /* Media queries para responsividade */
    @media (max-width: 1024px) {
      .cards-grid {
        grid-template-columns: 1fr;
        grid-template-areas:
          "routing"
          "proposal"
          "comment"
          "idem";
        gap: 16px;
      }
      .card-routing .specialist,
      .card-routing .dashed-warning,
      .card-idem .idem-note {
        margin-top: 0;
      }
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
      .issue-body-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .issue-body-header .seg { width: 100%; }
      .issue-body-header .seg-b { flex: 1; text-align: center; }
      .gh-box-head { font-size: 12px; gap: 6px; }
    }
  `]
})
export class IssueViewerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly datePipe = new DatePipe('en-US');
  private readonly sanitizer = inject(DomSanitizer);
  public readonly api = inject(TriageApiService);

  public readonly owner = signal('');
  public readonly repo = signal('');
  public readonly issueNumber = signal(0);

  public readonly result = signal<TriageResult | null>(null);
  public readonly issue = signal<GitHubIssue | null>(null);
  public readonly isLoading = signal(true);
  public readonly commentView = signal<'preview' | 'raw'>('preview');
  public readonly bodyView = signal<'preview' | 'raw'>('preview');

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
  public readonly formattedBodyHtml = computed(() => this.renderMarkdown(this.bodyText()));
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

  private renderMarkdown(md: string): SafeHtml {
    if (!md || !md.trim()) {
      return this.sanitizer.bypassSecurityTrustHtml('<em>(descrição vazia)</em>');
    }

    // Step 1: Escape HTML entities
    let text = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Step 2: Extract code blocks
    const codeBlocks: string[] = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const langAttr = lang ? ` data-lang="${lang}"` : '';
      codeBlocks.push(`<pre class="code md-code-block"${langAttr}><code>${code.trim()}</code></pre>`);
      return `__CODE_BLOCK_${idx}__`;
    });

    // Step 3: Headings
    text = text.replace(/^### (.*$)/gim, '<h4 class="md-heading">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 class="md-heading">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 class="md-heading">$1</h2>');

    // Step 4: Blockquotes
    text = text.replace(/^> (.*$)/gim, '<blockquote class="md-quote">$1</blockquote>');

    // Step 5: Inline formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // Step 6: Lists
    text = text.replace(/(?:^|\n)[*-] (.*)(?=\n[*-] |\n\n|$)/g, '\n<li class="md-li">$1</li>');
    text = text.replace(/((?:<li class="md-li">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>');

    text = text.replace(/(?:^|\n)\d+\. (.*)(?=\n\d+\. |\n\n|$)/g, '\n<li class="md-oli">$1</li>');
    text = text.replace(/((?:<li class="md-oli">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>');

    // Step 7: Paragraphs & line breaks
    const parts = text
      .split(/\n{2,}/)
      .map(part => {
        const trimmed = part.trim();
        if (!trimmed) return '';
        if (
          trimmed.startsWith('<h') ||
          trimmed.startsWith('<ul') ||
          trimmed.startsWith('<ol') ||
          trimmed.startsWith('<blockquote') ||
          trimmed.startsWith('__CODE_BLOCK_')
        ) {
          return trimmed;
        }
        return `<p class="md-p">${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .filter(Boolean)
      .join('\n');

    // Step 8: Re-insert code blocks
    let finalHtml = parts;
    codeBlocks.forEach((block, idx) => {
      finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, block);
    });

    return this.sanitizer.bypassSecurityTrustHtml(finalHtml);
  }
}
