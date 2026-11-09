import { TriageResult } from './triage.model';

export type CategoryKey = 'bug' | 'improvement' | 'question' | 'review';
export type CategoryFilter = 'all' | CategoryKey;
export type GitHubActionState = 'published' | 'blocked' | 'pending';

export const CATEGORY_META: Record<CategoryKey, { label: string; badgeClass: string; specialist: string }> = {
  bug: { label: 'Bug', badgeClass: 'b-bug', specialist: 'Bug Specialist Agent' },
  improvement: { label: 'Melhoria', badgeClass: 'b-improvement', specialist: 'Improvement Specialist Agent' },
  question: { label: 'Dúvida', badgeClass: 'b-question', specialist: 'Question Specialist Agent' },
  review: { label: 'Revisão Humana', badgeClass: 'b-review', specialist: 'Human Review Gate' }
};

const BACKEND_CATEGORY: Record<string, CategoryKey> = {
  Bug: 'bug',
  Melhoria: 'improvement',
  Duvida: 'question'
};

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  Accepted: { label: 'ACCEPTED', className: 'st-accepted' },
  Processing: { label: 'PROCESSING', className: 'st-processing' },
  Published: { label: 'PUBLISHED', className: 'st-published' },
  HumanReviewRequired: { label: 'HUMAN_REVIEW', className: 'st-review' }
};

const REVIEW_MARKER = /^\s*\[REVISÃO MANUAL\]\s*/i;
const MISSING_INFO_MARKER = '**Informações Solicitadas ao Autor:**';

export interface TriageView {
  job: TriageResult;
  owner: string;
  repoName: string;
  numberLabel: string;
  detailLink: (string | number)[];
  key: CategoryKey | null;
  classified: boolean;
  done: boolean;
  isReview: boolean;
  catLabel: string;
  catClass: string;
  statusLabel: string;
  statusClass: string;
  github: GitHubActionState;
  githubLabel: string;
}

export interface PipelineStep {
  n: number;
  label: string;
  sub: string;
  done: boolean;
  active: boolean;
}

export interface GitHubCommentPreview {
  heading: string;
  category?: string;
  sections: { title: string; text: string }[];
  footer: string;
  markdown: string;
}

export function toTriageView(job: TriageResult): TriageView {
  const [owner, ...rest] = job.repository.split('/');
  const repoName = rest.join('/') || job.repository;
  const isReview = job.status === 'HumanReviewRequired';
  const done = isReview || job.status === 'Published';
  const key: CategoryKey | null = isReview ? 'review' : BACKEND_CATEGORY[job.category ?? ''] ?? null;
  const meta = key ? CATEGORY_META[key] : null;
  const status = STATUS_DISPLAY[job.status] ?? { label: job.status.toUpperCase(), className: 'st-accepted' };
  const github: GitHubActionState = job.publishedAt ? 'published' : done ? 'blocked' : 'pending';

  return {
    job,
    owner,
    repoName,
    numberLabel: `#${job.issueNumber}`,
    detailLink: ['/issues', owner, repoName, job.issueNumber],
    key,
    classified: key !== null,
    done,
    isReview,
    catLabel: meta?.label ?? 'Classificando…',
    catClass: meta?.badgeClass ?? 'b-none',
    statusLabel: status.label,
    statusClass: status.className,
    github,
    githubLabel:
      github === 'published'
        ? isReview
          ? 'Pedido de informações publicado'
          : 'Comentário publicado com sucesso'
        : github === 'blocked'
          ? 'Ação bloqueada'
          : 'Pendente'
  };
}

export function hasProposal(job: TriageResult): boolean {
  return !!job.problemSummary?.trim() || !!job.suggestedAction?.trim();
}

/** The catalog gate runs on the API and rejects the event before any proposal exists. */
export function isCatalogRejection(job: TriageResult): boolean {
  return !!job.failureReason?.includes('accepted project catalog');
}

export function specialistFor(job: TriageResult): string {
  const key = BACKEND_CATEGORY[job.category ?? ''];
  return key ? CATEGORY_META[key].specialist : CATEGORY_META.review.specialist;
}

export function buildPipeline(view: TriageView): PipelineStep[] {
  const { job, done, isReview } = view;
  const rejected = isCatalogRejection(job);
  const failed = done && isReview && !hasProposal(job) && !rejected;

  let triageSub = job.status === 'Processing' ? 'harness escolhendo agente' : 'aguardando worker';
  if (done) {
    triageSub = rejected ? 'não executada' : failed ? 'falha no processamento' : specialistFor(job);
  }

  let publishLabel = 'Comentário publicado';
  let publishSub = 'aguardando';
  if (done) {
    if (!isReview) {
      publishSub = 'github · comentário na issue';
    } else if (job.publishedAt) {
      publishLabel = 'Revisão humana solicitada';
      publishSub = 'pedido de informações publicado';
    } else {
      publishLabel = 'Encaminhado para revisão humana';
      publishSub = 'ação externa bloqueada';
    }
  }

  // The catalog is checked before a job is persisted, so a visible job already passed the first two steps.
  const completed = done ? 4 : 2;
  const steps: [string, string][] = [
    ['Recebido · HTTP 202', 'evento persistido no PostgreSQL'],
    ['Catálogo consultado', rejected ? 'repositório desconhecido' : 'repositório aceito'],
    ['Triagem pelo especialista', triageSub],
    [publishLabel, publishSub]
  ];

  return steps.map(([label, sub], index) => ({
    n: index + 1,
    label,
    sub,
    done: index < completed,
    active: index === completed
  }));
}

export function proposalSummary(job: TriageResult): string {
  return (job.problemSummary ?? '').replace(REVIEW_MARKER, '').trim();
}

function suggestedActionParts(job: TriageResult): [string, string | null] {
  const [action, missing] = (job.suggestedAction ?? '').split(MISSING_INFO_MARKER);
  return [action.trim(), missing?.trim() || null];
}

/** Suggested actions arrive as one string, usually "1. ... 2. ..."; unnumbered text stays a single step. */
export function proposalSteps(job: TriageResult): string[] {
  const [action] = suggestedActionParts(job);
  if (!action) {
    return [];
  }
  return action
    .split(/(?:^|\s)(?=\d+\.\s)/)
    .map((step) => step.replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);
}

export function missingInformation(job: TriageResult): string | null {
  return suggestedActionParts(job)[1];
}

/** Mirrors FormatTriageComment and FormatHumanReviewComment in ProcessTriageJobUseCase. */
export function buildCommentPreview(job: TriageResult): GitHubCommentPreview {
  const summary = job.problemSummary ?? '';
  const action = job.suggestedAction ?? '';

  if (job.status === 'HumanReviewRequired') {
    const heading = '⚠️ Triagem Automática: Informações Adicionais Necessárias';
    const footer =
      'Esta issue foi encaminhada para Revisão Humana devido à ausência de evidências técnicas conclusivas ou passos de reprodução.';
    return {
      heading,
      sections: [
        { title: 'Diagnóstico Preliminar', text: summary },
        { title: 'Ação Solicitada ao Autor', text: action }
      ],
      footer,
      markdown: [
        `## ${heading}`,
        '',
        '- **Diagnóstico Preliminar:**',
        summary,
        '',
        '- **Ação Solicitada ao Autor:**',
        action,
        '',
        '---',
        '*Esta issue foi encaminhada para **Revisão Humana** devido à ausência de evidências técnicas conclusivas ou passos de reprodução.*'
      ].join('\n')
    };
  }

  const heading = '🤖 Triagem Automática de Manutenção';
  const footer = 'Triagem realizada de acordo com as diretrizes do repositório.';
  return {
    heading,
    category: job.category,
    sections: [
      { title: 'Resumo do Problema', text: summary },
      { title: 'Próximos Passos Recomendados', text: action }
    ],
    footer,
    markdown: [
      `## ${heading}`,
      '',
      `- **Categoria Identificada:** \`${job.category}\``,
      '- **Resumo do Problema:**',
      summary,
      '',
      '- **Próximos Passos Recomendados:**',
      action,
      '',
      '---',
      `*${footer}*`
    ].join('\n')
  };
}
