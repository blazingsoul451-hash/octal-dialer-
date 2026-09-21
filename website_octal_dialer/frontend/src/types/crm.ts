export interface CrmCompany {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  status: 'active' | 'inactive' | 'client' | 'lead' | 'partner' | 'archived';
  paymentStatus: 'paid' | 'pending' | 'overdue' | 'due_soon' | 'partially_paid' | 'disputed';
  assignedUserId?: string;
  assignedTeamId?: string;
  metadata?: Record<string, any>;
  contactCount?: number;
  leadCount?: number;
  openTaskCount?: number;
  assignedUserName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmContact {
  id: string;
  tenantId: string;
  crmCompanyId: string;
  companyName?: string;
  name: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  notes?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  createdAt: string;
  updatedAt: string;
}

export type CrmTaskType = 'call' | 'meeting' | 'online_meeting' | 'email' | 'whatsapp' | 'payment' | 'follow_up' | 'other';
export type CrmTaskStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';
export type CrmTaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CrmTask {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  taskType: CrmTaskType;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  dueAt: string;
  completedAt?: string;
  crmCompanyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  leadId?: string;
  leadName?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedTeamId?: string;
  outcome?: string;
  outcomeRemarks?: string;
  cancellationReason?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmNote {
  id: string;
  tenantId: string;
  entityType: 'company' | 'contact' | 'lead' | 'task';
  entityId: string;
  category: 'general' | 'call' | 'meeting' | 'requirement' | 'payment' | 'support' | 'task';
  body: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
}

export interface CrmOverviewMetrics {
  totalCompanies: number;
  activeCompanies: number;
  totalContacts: number;
  canonicalLeads: number;
  openTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  completedTasks: number;
  upcomingMeetings: number;
  paymentPending: number;
  paymentOverdue: number;
  range: string;
}

export interface CrmTimelineItem {
  id: string;
  itemType: 'note' | 'task' | 'call';
  title: string;
  description?: string;
  timestamp: string;
  userName?: string;
  status?: string;
  category?: string;
  taskType?: string;
  priority?: string;
}

export type CrmWorkStatus = 'TODO' | 'IN_PROGRESS' | 'PENDING' | 'SHORTLISTED' | 'COMPLETED' | 'REJECTED';
export type CrmWorkPriority = 'low' | 'normal' | 'high' | 'critical';

export interface CrmWorkItem {
  id: string;
  tenantId: string;
  crmCompanyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  leadId?: string;
  leadName?: string;
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  assignedTeamId?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  priority: CrmWorkPriority;
  status: CrmWorkStatus;
  dueAt?: string;
  completedAt?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPackage {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  includedUsers: number;
  maxCallsPerMonth: number;
  features: string[];
}

export interface PricingAddon {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  unit: string;
}

export interface CrmPricingRules {
  id: string;
  tenantId: string;
  currency: string;
  taxRate: number;
  agentMaxDiscountPct: number;
  teamLeadMaxDiscountPct: number;
  perUserPriceMonthly: number;
  perUserPriceAnnual: number;
  packages: PricingPackage[];
  addons: PricingAddon[];
  updatedAt: string;
}

export interface CrmQuoteItem {
  id: string;
  tenantId: string;
  quoteId: string;
  itemType: 'package' | 'seat' | 'addon';
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
}

export type CrmQuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface CrmQuote {
  id: string;
  tenantId: string;
  quoteNumber: string;
  crmCompanyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  leadId?: string;
  leadName?: string;
  packageId?: string;
  packageName?: string;
  userCount: number;
  billingCycle: 'monthly' | 'annual';
  currency: string;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: CrmQuoteStatus;
  notes?: string;
  validUntil?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  items?: CrmQuoteItem[];
}

export interface CrmAgentPerformance {
  userId: string;
  username: string;
  role: string;
  leadsAssigned: number;
  callsMade: number;
  callsAnswered: number;
  tasksCompleted: number;
  tasksOverdue: number;
  meetingsConducted: number;
  workCompleted: number;
  quotesCreated: number;
  quotesWon: number;
  quotedValue: number;
  wonValue: number;
  conversionRate: number;
}

export interface CrmPerformanceSummary {
  totalLeadsAssigned: number;
  totalCalls: number;
  totalAnsweredCalls: number;
  answerRate: number;
  totalTasksCompleted: number;
  totalTasksOverdue: number;
  totalMeetingsConducted: number;
  totalWorkCompleted: number;
  totalQuotesCreated: number;
  totalQuotesWon: number;
  totalQuotedValue: number;
  totalWonValue: number;
  conversionRate: number;
}

export interface CrmPerformanceData {
  role: string;
  isOwner: boolean;
  isTeamLead: boolean;
  period: string;
  summary: CrmPerformanceSummary;
  agentBreakdown: CrmAgentPerformance[];
}

export interface CrmSearchResult {
  type: 'company' | 'contact' | 'lead' | 'task' | 'meeting' | 'work' | 'quote';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  entityId: string;
}

