import type {AnalyticsAudience, AnalyticsEventName} from '../../src/analytics/contract';
export interface AnalyticsChoice {
  id: string; familyId: string; deviceId: string; audience: AnalyticsAudience;
  adultProfileId?: string; adultSessionId?: string; noticeVersion: string; requestedAt: number; expiresAt: number;
  verifiedAt?: number; verificationReceiptHash?: string; revokedAt?: number;
}
export interface AnalyticsBinding {
  jobId: string; familyId: string; deviceId: string; audience: AnalyticsAudience;
  choiceId: string; adultSessionId?: string; adultProfileId?: string;
  distinctId: string; creationId: string; acceptedAt: number;
}
export interface AnalyticsPayload {
  uuid: string; event: AnalyticsEventName; timestamp: string;
  properties: Record<string, string | number | boolean | null>;
}
export interface AnalyticsPending {
  id: string; familyId: string; deviceId: string; audience: AnalyticsAudience;
  choiceId: string; adultSessionId?: string; adultProfileId?: string;
  createdAt: number; expiresAt: number; payload: AnalyticsPayload;
  leaseId?: string; leaseUntil?: number;
}
export interface AnalyticsState {
  choices: AnalyticsChoice[];
  bindings: AnalyticsBinding[];
  pending: AnalyticsPending[];
  receipts: {id: string; at: number; familyId: string; deviceId: string}[];
}
export type AnalyticsEnvironment = 'development' | 'test' | 'staging' | 'production';
export type AnalyticsConfig = {enabled: false} | {
  enabled: true; captureOrigin: 'https://us.i.posthog.com' | 'https://eu.i.posthog.com';
  projectToken: string; pseudonymKey: string; environment: AnalyticsEnvironment; release: string;
};
