import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiagramComparison } from '../contracts/comparison.contract';
import type {
  DiscrepancyItem,
  GradeResponse,
  RubricBreakdownItem,
} from '../contracts/grading.contract';

interface GradeWithOllamaInput {
  comparison: DiagramComparison;
  deterministicDiscrepancies: DiscrepancyItem[];
  maxScore: number;
}

interface OllamaGenerateResponse {
  response?: string;
  model?: string;
}

interface LlmGradePayload {
  score: number;
  maxScore: number;
  summary: string;
  rubricBreakdown: RubricBreakdownItem[];
  discrepancies: DiscrepancyItem[];
  confidence: number;
  manualReviewRecommended: boolean;
  notes: string[];
}

@Injectable()
export class OllamaGradingService {
  constructor(private readonly configService: ConfigService) {}

  async grade(input: GradeWithOllamaInput): Promise<GradeResponse> {
    const payload = await this.generateGrade(input);
    const score = this.clamp(this.round(payload.score), 0, input.maxScore);
    const confidence = this.clamp(payload.confidence, 0, 1);

    return {
      score,
      maxScore: input.maxScore,
      percentage: this.round((score / input.maxScore) * 100),
      summary: payload.summary.trim(),
      rubricBreakdown: this.normalizeRubric(
        payload.rubricBreakdown,
        input.maxScore,
      ),
      discrepancies: this.normalizeDiscrepancies(payload.discrepancies),
      flags: {
        lowConfidence: confidence < 0.65,
        extractionIssues:
          input.comparison.solution.metadata.unlinkedRelationshipCount > 0 ||
          input.comparison.submission.metadata.unlinkedRelationshipCount > 0,
        invalidJsonRecovered: false,
        manualReviewRecommended:
          payload.manualReviewRecommended || confidence < 0.65,
        notes: [
          `Ollama model: ${this.getModelName()}.`,
          `LLM confidence: ${this.round(confidence * 100)}%.`,
          ...payload.notes.map((item) => item.trim()).filter(Boolean),
        ],
      },
    };
  }

  private async generateGrade(
    input: GradeWithOllamaInput,
  ): Promise<LlmGradePayload> {
    let response: Response;
    try {
      response = await fetch(`${this.getBaseUrl()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getModelName(),
          prompt: this.buildPrompt(input),
          stream: false,
          format: this.getResponseSchema(input.maxScore),
          options: {
            temperature: 0.1,
            top_p: 0.9,
          },
        }),
      });
    } catch (error) {
      throw new Error(
        `Could not connect to Ollama at ${this.getBaseUrl()}: ${
          error instanceof Error ? error.message : 'fetch failed'
        }`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Ollama request failed with ${response.status}: ${text || response.statusText}`,
      );
    }

    const generated = (await response.json()) as OllamaGenerateResponse;
    if (!generated.response) {
      throw new Error('Ollama response did not contain generated JSON.');
    }

    return this.parseAndValidatePayload(generated.response, input.maxScore);
  }

  private parseAndValidatePayload(value: string, maxScore: number) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Ollama returned invalid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Ollama grade must be a JSON object.');
    }

    const payload = parsed as Partial<LlmGradePayload>;
    const score = payload.score;
    const confidence = payload.confidence;

    if (!Number.isFinite(score)) {
      throw new Error('Ollama grade is missing numeric score.');
    }
    if (score === undefined || score < 0 || score > maxScore) {
      throw new Error(`Ollama score must be between 0 and ${maxScore}.`);
    }
    if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
      throw new Error('Ollama grade is missing summary.');
    }
    if (!Array.isArray(payload.rubricBreakdown)) {
      throw new Error('Ollama grade is missing rubricBreakdown array.');
    }
    if (!Array.isArray(payload.discrepancies)) {
      throw new Error('Ollama grade is missing discrepancies array.');
    }
    if (!Number.isFinite(confidence)) {
      throw new Error('Ollama grade is missing numeric confidence.');
    }
    if (typeof payload.manualReviewRecommended !== 'boolean') {
      throw new Error(
        'Ollama grade is missing manualReviewRecommended boolean.',
      );
    }

    return {
      score,
      maxScore,
      summary: payload.summary,
      rubricBreakdown: payload.rubricBreakdown,
      discrepancies: payload.discrepancies,
      confidence: confidence ?? 0,
      manualReviewRecommended: payload.manualReviewRecommended,
      notes: Array.isArray(payload.notes) ? payload.notes : [],
    } satisfies LlmGradePayload;
  }

  private buildPrompt(input: GradeWithOllamaInput) {
    const compactContext = {
      task: 'Grade a student UML diagram against a teacher reference UML diagram. Award marks for semantic closeness, not exact drawing similarity.',
      maxScore: input.maxScore,
      rubric: [
        'Class coverage: 30%',
        'Attributes and methods: 20%',
        'Relationships, inheritance, association, dependency, multiplicity: 30%',
        'Semantic equivalence and acceptable alternate modelling: 10%',
        'UML correctness and clarity: 10%',
      ],
      teacherSynonymRule:
        'Treat matched synonym names as acceptable unless the concept is materially different.',
      deterministicSummary: input.comparison.summary,
      deterministicDiscrepancies: input.deterministicDiscrepancies,
      solution: this.compactDiagram(input.comparison.solution),
      submission: this.compactDiagram(input.comparison.submission),
      classMatches: input.comparison.classMatches,
      relationshipMatches: input.comparison.relationshipMatches,
      missingClasses: input.comparison.missingClasses,
      extraClasses: input.comparison.extraClasses,
      missingRelationships: input.comparison.missingRelationships,
      extraRelationships: input.comparison.extraRelationships,
      outputRules: [
        'Return only JSON matching the schema.',
        `score must be between 0 and ${input.maxScore}.`,
        'Use awardedMarks values that add up approximately to score.',
        'The discrepancies array must contain only actual problems. Return an empty discrepancies array when there are no problems.',
        'Be fair to semantically equivalent UML choices.',
        'Recommend manual review when evidence is ambiguous.',
      ],
    };

    return JSON.stringify(compactContext);
  }

  private compactDiagram(diagram: DiagramComparison['solution']) {
    return {
      metadata: diagram.metadata,
      classes: diagram.classes.map((item) => ({
        name: item.name,
        kind: item.kind,
        attributes: item.attributes.map((attribute) => ({
          name: attribute.name,
          type: attribute.type,
          notes: attribute.notes,
        })),
        methods: item.methods.map((method) => ({
          name: method.name,
          returnType: method.returnType,
          parameters: method.parameters,
        })),
      })),
      relationships: diagram.relationships.map((relationship) => ({
        source: relationship.source,
        target: relationship.target,
        type: relationship.type,
        label: relationship.label,
        sourceMultiplicity: relationship.sourceMultiplicity,
        targetMultiplicity: relationship.targetMultiplicity,
      })),
    };
  }

  private getResponseSchema(maxScore: number) {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'score',
        'maxScore',
        'summary',
        'rubricBreakdown',
        'discrepancies',
        'confidence',
        'manualReviewRecommended',
        'notes',
      ],
      properties: {
        score: { type: 'number', minimum: 0, maximum: maxScore },
        maxScore: { type: 'number' },
        summary: { type: 'string' },
        rubricBreakdown: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'criterionKey',
              'label',
              'maxMarks',
              'awardedMarks',
              'reason',
            ],
            properties: {
              criterionKey: { type: 'string' },
              label: { type: 'string' },
              maxMarks: { type: 'number' },
              awardedMarks: { type: 'number' },
              reason: { type: 'string' },
            },
          },
        },
        discrepancies: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['category', 'severity', 'message'],
            properties: {
              category: { type: 'string' },
              severity: { enum: ['minor', 'major', 'critical'] },
              message: { type: 'string' },
              expected: { type: 'string' },
              actual: { type: 'string' },
              entityRef: { type: 'string' },
            },
          },
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        manualReviewRecommended: { type: 'boolean' },
        notes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
  }

  private normalizeRubric(
    rubric: RubricBreakdownItem[],
    maxScore: number,
  ): RubricBreakdownItem[] {
    return rubric.map((item) => ({
      criterionKey: String(item.criterionKey || 'unknown'),
      label: String(item.label || item.criterionKey || 'Criterion'),
      maxMarks: this.clamp(this.round(Number(item.maxMarks) || 0), 0, maxScore),
      awardedMarks: this.clamp(
        this.round(Number(item.awardedMarks) || 0),
        0,
        maxScore,
      ),
      reason: item.reason ? String(item.reason) : undefined,
    }));
  }

  private normalizeDiscrepancies(
    discrepancies: DiscrepancyItem[],
  ): DiscrepancyItem[] {
    return discrepancies
      .filter((item) => item?.category && item?.message)
      .filter((item) => !this.isPositiveNonDiscrepancy(item))
      .map((item) => ({
        category: String(item.category),
        severity: this.normalizeSeverity(item.severity),
        message: String(item.message),
        expected: item.expected ? String(item.expected) : undefined,
        actual: item.actual ? String(item.actual) : undefined,
        entityRef: item.entityRef ? String(item.entityRef) : undefined,
      }));
  }

  private isPositiveNonDiscrepancy(item: DiscrepancyItem) {
    const text =
      `${item.category} ${item.message} ${item.expected ?? ''}`.toLowerCase();
    return (
      text.includes('no missing') ||
      text.includes('no extra') ||
      text.includes('no discrepancies') ||
      text.includes('match exactly') ||
      text.includes('all classes match') ||
      text.includes('all relationships')
    );
  }

  private normalizeSeverity(value: string): DiscrepancyItem['severity'] {
    if (value === 'minor' || value === 'major' || value === 'critical') {
      return value;
    }
    return 'major';
  }

  private getBaseUrl() {
    return (
      this.configService.get<string>('OLLAMA_BASE_URL') ??
      'http://127.0.0.1:11434'
    ).replace(/\/$/, '');
  }

  private getModelName() {
    return (
      this.configService.get<string>('OLLAMA_MODEL') ?? 'qwen2.5:3b-instruct'
    );
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number) {
    return Number(value.toFixed(2));
  }
}
