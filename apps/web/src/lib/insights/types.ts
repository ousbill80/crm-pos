export type Severity = 'critical' | 'warning' | 'ok' | 'info' | 'neutral';

export interface Insight {
  title: string;
  interpretation: string;
  recommendation?: string;
  severity: Severity;
}
