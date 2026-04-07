export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportConfig {
    id?: string;
    tenantId: string;
    name: string;
    creatorId: string;
    creatorEmail: string;
    metrics: string[]; // e.g., 'active_users', 'page_views', 'new_jobs'
    frequency: ReportFrequency;
    scheduleTime: string; // "HH:mm" format, 24h
    recipients: string[];
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
    lastRunAt?: number;
}

export interface GeneratedReport {
    id?: string;
    tenantId: string;
    configId: string;
    runAt: number; // timestamp of execution
    summary: string; // The generated summary text/html snippet
    data: any; // Frozen snapshot dict of the metrics (e.g., { active_users: 12, new_jobs: [...] })
}
