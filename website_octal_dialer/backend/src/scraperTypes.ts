export type ScraperJobStatus =
  | 'queued'
  | 'running'
  | 'paused_challenge'
  | 'completed'
  | 'completed_partial'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface ScraperJobOptions {
  keyword: string;
  location?: string;
  maxLeads?: number;
  requirePhone?: boolean;
  requireEmail?: boolean;
  enrichWebsite?: boolean;
  tenantId: string;
  username: string;
}

export interface EnrichedContactInfo {
  emails: string[];
  socialLinks: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
  };
  sources: {
    url: string;
    method: 'mailto' | 'body_regex' | 'heuristic';
    extractedAt: string;
  }[];
}

export interface ScrapedLead {
  listingId: string; // Canonical unique place ID or URL token
  businessName: string;
  phone: string;
  rawPhone?: string;
  phoneSource?: string;
  category: string;
  address: string;
  searchLocation: string;
  website: string;
  email?: string;
  socialLinks?: EnrichedContactInfo['socialLinks'];
  rating?: string;
  reviewsCount?: string;
  hours?: string;
  mapsUrl: string;
  discoveredAt: string;
  enrichmentStatus?: 'none' | 'enriched' | 'failed' | 'blocked' | 'skipped';
}

export interface ScraperJobCounters {
  discovered: number;
  extracted: number;
  enriched: number;
  skippedPhone: number;
  skippedEmail: number;
  failed: number;
}

export interface ScraperJobRecord {
  jobId: string;
  tenantId: string;
  requestedBy: string;
  options: ScraperJobOptions;
  status: ScraperJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  counters: ScraperJobCounters;
  maxLimit: number;
  outputFile?: string;
  checkpointFile?: string;
  logs: string[];
  errorCode?: string;
  errorMessage?: string;
  executionId: number;
}

export interface WorkerStartMessage {
  type: 'START';
  jobId: string;
  executionId: number;
  options: ScraperJobOptions;
  checkpointPath: string;
  outputPath: string;
}

export interface WorkerStopMessage {
  type: 'STOP';
  jobId: string;
  executionId: number;
}

export type WorkerParentMessage = WorkerStartMessage | WorkerStopMessage;

export interface WorkerProgressEvent {
  type: 'PROGRESS';
  jobId: string;
  executionId: number;
  lead: ScrapedLead;
  counters: ScraperJobCounters;
  log?: string;
}

export interface WorkerLogEvent {
  type: 'LOG';
  jobId: string;
  executionId: number;
  message: string;
}

export interface WorkerChallengeEvent {
  type: 'CHALLENGE';
  jobId: string;
  executionId: number;
  reason: string;
  counters: ScraperJobCounters;
}

export interface WorkerDoneEvent {
  type: 'DONE';
  jobId: string;
  executionId: number;
  status: 'completed' | 'completed_partial' | 'stopped';
  counters: ScraperJobCounters;
  outputFile: string;
}

export interface WorkerErrorEvent {
  type: 'ERROR';
  jobId: string;
  executionId: number;
  error: string;
  counters: ScraperJobCounters;
}

export type WorkerChildMessage =
  | WorkerProgressEvent
  | WorkerLogEvent
  | WorkerChallengeEvent
  | WorkerDoneEvent
  | WorkerErrorEvent;
