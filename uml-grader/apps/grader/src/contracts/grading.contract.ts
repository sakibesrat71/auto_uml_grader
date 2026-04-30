export interface GradeRequest {
  assignmentId: string;
  submissionId?: string;
  solutionId?: string;
  solutionUxf: string;
  submissionUxf: string;
  synonymsMap?: Record<string, string[]>;
  maxScore: number;
}

export interface RubricBreakdownItem {
  criterionKey: string;
  label: string;
  maxMarks: number;
  awardedMarks: number;
  reason?: string;
}

export interface DiscrepancyItem {
  category: string;
  severity: 'minor' | 'major' | 'critical';
  message: string;
  expected?: string;
  actual?: string;
  entityRef?: string;
}

export interface GradeFlags {
  lowConfidence: boolean;
  extractionIssues: boolean;
  invalidJsonRecovered: boolean;
  manualReviewRecommended: boolean;
  notes: string[];
}

export interface GradeResponse {
  score: number;
  maxScore: number;
  percentage: number;
  summary: string;
  rubricBreakdown: RubricBreakdownItem[];
  discrepancies: DiscrepancyItem[];
  flags: GradeFlags;
}

export interface GraderHealthResponse {
  status: 'ok';
  service: 'uml-grader';
  ollamaBaseUrl: string;
  ollamaModel: string;
}
