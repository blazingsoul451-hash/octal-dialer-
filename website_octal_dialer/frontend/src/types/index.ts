export interface Campaign {
  id: string;
  name: string;
  fileName: string;
  leadCount: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  campaignId: string;
  name: string;
  phone: string;
  status: 'PENDING' | 'CALLING' | 'COMPLETED';
  outcome?: string;
  duration?: number;
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  campaignName: string;
  outcome: string;
  duration: number;
  timestamp: string;
}

export interface ScraperFile {
  name: string;
  path: string;
  sizeBytes: number;
  lastModified: string;
}
