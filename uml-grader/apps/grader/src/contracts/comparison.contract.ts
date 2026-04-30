import type { ParsedUxfDiagram } from './uml.contract';

export interface CompareDiagramsRequest {
  solutionUxf: string;
  submissionUxf: string;
  synonymsMap?: Record<string, string[]>;
}

export interface DiagramComparison {
  solution: ParsedUxfDiagram;
  submission: ParsedUxfDiagram;
  classMatches: ClassMatch[];
  missingClasses: MissingClass[];
  extraClasses: ExtraClass[];
  relationshipMatches: RelationshipMatch[];
  missingRelationships: RelationshipIssue[];
  extraRelationships: RelationshipIssue[];
  summary: ComparisonSummary;
}

export interface ClassMatch {
  solutionClass: string;
  submissionClass: string;
  matchType: 'exact' | 'normalized' | 'synonym';
  missingAttributes: string[];
  extraAttributes: string[];
  matchedAttributes: string[];
  missingMethods: string[];
  extraMethods: string[];
  matchedMethods: string[];
}

export interface MissingClass {
  name: string;
  attributes: string[];
  methods: string[];
}

export interface ExtraClass {
  name: string;
  attributes: string[];
  methods: string[];
}

export interface RelationshipMatch {
  solutionRelationship: RelationshipSummary;
  submissionRelationship: RelationshipSummary;
  matchType: 'exact' | 'endpoint-match' | 'type-mismatch';
}

export interface RelationshipIssue {
  relationship: RelationshipSummary;
  reason: string;
}

export interface RelationshipSummary {
  source: string;
  target: string;
  type: string;
  label?: string;
}

export interface ComparisonSummary {
  solutionClassCount: number;
  submissionClassCount: number;
  matchedClassCount: number;
  missingClassCount: number;
  extraClassCount: number;
  solutionRelationshipCount: number;
  submissionRelationshipCount: number;
  matchedRelationshipCount: number;
  missingRelationshipCount: number;
  extraRelationshipCount: number;
  attributeMatchCount: number;
  missingAttributeCount: number;
  extraAttributeCount: number;
  methodMatchCount: number;
  missingMethodCount: number;
  extraMethodCount: number;
}
