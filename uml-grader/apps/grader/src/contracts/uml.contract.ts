export interface UmlAttribute {
  name: string;
  type?: string;
  visibility?: string;
  isStatic: boolean;
  notes: string[];
}

export interface UmlMethodParameter {
  name: string;
  type?: string;
}

export interface UmlMethod {
  name: string;
  returnType?: string;
  visibility?: string;
  parameters: UmlMethodParameter[];
  isStatic: boolean;
}

export interface UmlClass {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'unknown';
  attributes: UmlAttribute[];
  methods: UmlMethod[];
  rawText: string;
  bounds: UmlBounds;
}

export interface UmlRelationship {
  source: string;
  target: string;
  type: string;
  label?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  direction?: string;
  rawText: string;
  points: UmlPoint[];
}

export interface UmlBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UmlPoint {
  x: number;
  y: number;
}

export interface ParsedUxfDiagram {
  classes: UmlClass[];
  relationships: UmlRelationship[];
  notes: string[];
  metadata: {
    program?: string;
    version?: string;
    zoomLevel?: number;
    classCount: number;
    relationshipCount: number;
    unlinkedRelationshipCount: number;
  };
}

export interface ParseUxfRequest {
  uxf: string;
}
