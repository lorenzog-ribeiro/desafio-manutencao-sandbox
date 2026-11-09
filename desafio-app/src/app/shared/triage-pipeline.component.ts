import { Component, input } from '@angular/core';
import { PipelineStep } from '../models/triage-view';

@Component({
  selector: 'app-triage-pipeline',
  standalone: true,
  template: `
    @for (step of steps(); track step.n) {
      <div class="pipe" [class.pipe-done]="step.done" [class.pipe-active]="step.active">
        <span class="pc">
          @if (step.done) {
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">check</span>
          } @else {
            {{ step.n }}
          }
        </span>
        <div class="pipe-text">
          <span class="pl">{{ step.label }}</span>
          <span class="ps">{{ step.sub }}</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 12px; }
    .pipe { display: flex; align-items: center; gap: 12px; }
    .pipe-text { display: flex; flex-direction: column; gap: 2px; }
    .pc {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid var(--border-strong);
      color: var(--text-muted);
      font: 600 11px var(--font-mono);
      flex: none;
      background: var(--surface);
    }
    .pl { font: 500 13.5px var(--font-sans); color: var(--text-muted); }
    .ps { font: 400 12px var(--font-mono); color: var(--text-muted); }
    .pipe-done .pc { background: var(--primary); border-color: var(--primary); color: #ffffff; }
    .pipe-done .pl { color: var(--text); }
    .pipe-active .pc { border-color: var(--ai); color: var(--ai-hover); animation: vpulse 1.5s infinite; }
    .pipe-active .pl { color: var(--ai-hover); }
    @keyframes vpulse {
      0% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.35); }
      70% { box-shadow: 0 0 0 8px rgba(124, 58, 237, 0); }
      100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .pipe-active .pc { animation: none; }
    }
  `]
})
export class TriagePipelineComponent {
  public readonly steps = input.required<PipelineStep[]>();
}
