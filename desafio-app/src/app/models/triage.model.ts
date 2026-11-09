export type TriageStatus = 'Accepted' | 'Processing' | 'Published' | 'HumanReviewRequired';

export type IssueCategory = 'Bug' | 'Melhoria' | 'Duvida';

export interface IncomingIssueEvent {
  eventId: string;
  repository: string;
  issueNumber: number;
  title: string;
  description: string;
}

export interface EventAcceptedResponse {
  eventId: string;
  status: string;
  repository?: string;
  issueNumber?: number;
}

export interface TriageResult {
  eventId: string;
  repository: string;
  issueNumber: number;
  title: string;
  status: TriageStatus | string;
  category?: IssueCategory | string;
  problemSummary?: string;
  suggestedAction?: string;
  publishedAt?: string;
  failureReason?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  htmlUrl?: string;
  description?: string;
  openIssuesCount: number;
  isPrivate: boolean;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: string;
  htmlUrl?: string;
  author?: string;
  createdAt: string;
}
