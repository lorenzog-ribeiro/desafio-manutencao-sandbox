import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { IssueViewerComponent } from './features/issue-viewer/issue-viewer.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'issues/:owner/:repo/:number', component: IssueViewerComponent },
  { path: '**', redirectTo: 'dashboard' }
];
