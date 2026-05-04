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

interface ScoreGuidance {
  anchorScore: number;
  minScore: number;
  maxScore: number;
}

@Injectable()
export class OllamaGradingService {
  constructor(private readonly configService: ConfigService) {}

  async grade(input: GradeWithOllamaInput): Promise<GradeResponse> {
    const payload = await this.generateGrade(input);
    const scoreGuidance = this.buildScoreGuidance(
      input.comparison,
      input.maxScore,
    );
    const rawScore = this.clamp(this.round(payload.score), 0, input.maxScore);
    const score = this.clamp(
      rawScore,
      scoreGuidance.minScore,
      scoreGuidance.maxScore,
    );
    const confidence = this.clamp(payload.confidence, 0, 1);
    const adjustmentNote =
      score !== rawScore
        ? [
            `LLM score adjusted from ${rawScore}/${input.maxScore} to ${score}/${input.maxScore} using deterministic evidence guardrails.`,
          ]
        : [];

    return {
      score,
      maxScore: input.maxScore,
      percentage: this.round((score / input.maxScore) * 100),
      summary: payload.summary.trim(),
      rubricBreakdown: this.normalizeRubric(
        payload.rubricBreakdown,
        input.maxScore,
        score,
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
          `Deterministic score anchor: ${scoreGuidance.anchorScore}/${input.maxScore}.`,
          ...adjustmentNote,
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
        'Treat matched synonym names as acceptable unless the concept is materially different. If classMatches contains a synonym pair, that pair is not a missing class or an extra class.',
      deterministicSummary: input.comparison.summary,
      scoringGuardrails: this.buildScoreGuidance(
        input.comparison,
        input.maxScore,
      ),
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
        `Use exactly these rubric maxMarks when maxScore is ${input.maxScore}: Class coverage ${this.round(input.maxScore * 0.3)}, Attributes and methods ${this.round(input.maxScore * 0.2)}, Relationships ${this.round(input.maxScore * 0.3)}, Semantic equivalence ${this.round(input.maxScore * 0.1)}, UML correctness and clarity ${this.round(input.maxScore * 0.1)}.`,
        'Use awardedMarks values that add up approximately to score and never exceed each criterion maxMarks.',
        'Stay inside scoringGuardrails unless the diagram has a severe semantic issue not captured by deterministicDiscrepancies. Explain that issue in discrepancies if you go outside the guardrail.',
        'The discrepancies array must contain only actual problems. Return an empty discrepancies array when there are no problems.',
        'Do not penalize class coverage for a solution class and submission class already listed together in classMatches, including synonym matches such as Customer and Client.',
        'Do not mention a matched synonym pair as missing, extra, or unclear unless another concrete issue remains on that matched class.',
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
    targetScore: number,
  ): RubricBreakdownItem[] {
    const criteria = [
      {
        criterionKey: 'class_coverage',
        label: 'Class coverage',
        maxMarks: maxScore * 0.3,
        tokens: ['class'],
      },
      {
        criterionKey: 'attributes_methods',
        label: 'Attributes and methods',
        maxMarks: maxScore * 0.2,
        tokens: ['attribute', 'method'],
      },
      {
        criterionKey: 'relationships',
        label: 'Relationships',
        maxMarks: maxScore * 0.3,
        tokens: ['relationship'],
      },
      {
        criterionKey: 'semantic_equivalence',
        label: 'Semantic equivalence',
        maxMarks: maxScore * 0.1,
        tokens: ['semantic'],
      },
      {
        criterionKey: 'uml_clarity',
        label: 'UML correctness and clarity',
        maxMarks: maxScore * 0.1,
        tokens: ['clarity', 'correctness'],
      },
    ];

    const normalized = criteria.map((criterion) => {
      const source = this.findRubricItem(rubric, criterion.tokens);
      const sourceMax = Number(source?.maxMarks);
      const sourceAwarded = Number(source?.awardedMarks);
      const awardedFromRatio =
        Number.isFinite(sourceMax) &&
        sourceMax > 0 &&
        sourceMax !== criterion.maxMarks
          ? (sourceAwarded / sourceMax) * criterion.maxMarks
          : sourceAwarded;

      return {
        criterionKey: criterion.criterionKey,
        label: criterion.label,
        maxMarks: this.round(criterion.maxMarks),
        awardedMarks: this.clamp(
          this.round(Number.isFinite(awardedFromRatio) ? awardedFromRatio : 0),
          0,
          criterion.maxMarks,
        ),
        reason: source?.reason ? String(source.reason) : undefined,
      };
    });

    return this.scaleRubricToScore(normalized, targetScore);
  }

  private findRubricItem(rubric: RubricBreakdownItem[], tokens: string[]) {
    return rubric.find((item) => {
      const text =
        `${item.criterionKey ?? ''} ${item.label ?? ''}`.toLowerCase();
      return tokens.some((token) => text.includes(token));
    });
  }

  private scaleRubricToScore(
    rubric: RubricBreakdownItem[],
    targetScore: number,
  ) {
    const currentTotal = rubric.reduce(
      (sum, item) => sum + item.awardedMarks,
      0,
    );
    if (currentTotal <= 0) {
      return rubric;
    }

    const scaled = rubric.map((item) => ({
      ...item,
      awardedMarks: this.clamp(
        this.round(item.awardedMarks * (targetScore / currentTotal)),
        0,
        item.maxMarks,
      ),
    }));
    const scaledTotal = scaled.reduce(
      (sum, item) => sum + item.awardedMarks,
      0,
    );
    const delta = this.round(targetScore - scaledTotal);
    const adjustable = scaled
      .slice()
      .reverse()
      .find(
        (item) =>
          item.awardedMarks + delta >= 0 &&
          item.awardedMarks + delta <= item.maxMarks,
      );

    if (adjustable) {
      adjustable.awardedMarks = this.round(adjustable.awardedMarks + delta);
    }

    return scaled;
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

  private buildScoreGuidance(
    comparison: DiagramComparison,
    maxScore: number,
  ): ScoreGuidance {
    const classScore =
      maxScore *
      0.3 *
      this.ratio(
        comparison.summary.matchedClassCount,
        comparison.summary.solutionClassCount,
      );
    const expectedMembers =
      comparison.summary.attributeMatchCount +
      comparison.summary.missingAttributeCount +
      comparison.summary.methodMatchCount +
      comparison.summary.missingMethodCount;
    const matchedMembers =
      comparison.summary.attributeMatchCount +
      comparison.summary.methodMatchCount;
    const memberScore =
      maxScore * 0.2 * this.ratio(matchedMembers, expectedMembers);
    const relationshipScore =
      maxScore * 0.3 * this.relationshipQualityRatio(comparison);
    const semanticScore =
      maxScore *
      0.1 *
      (comparison.summary.extraClassCount > 0 ||
      comparison.summary.extraRelationshipCount > 0
        ? 0.6
        : 1);
    const clarityScore =
      maxScore *
      0.1 *
      (comparison.submission.metadata.unlinkedRelationshipCount > 0
        ? 0.5
        : this.hasRelationshipTypeMismatch(comparison)
          ? 0.75
          : 1);
    const anchorScore = this.round(
      classScore +
        memberScore +
        relationshipScore +
        semanticScore +
        clarityScore,
    );

    return {
      anchorScore,
      minScore: this.clamp(
        this.round(anchorScore - maxScore * 0.1),
        0,
        maxScore,
      ),
      maxScore: this.clamp(
        this.round(anchorScore + maxScore * 0.1),
        0,
        maxScore,
      ),
    };
  }

  private relationshipQualityRatio(comparison: DiagramComparison) {
    const solutionCount = comparison.summary.solutionRelationshipCount;
    if (solutionCount <= 0) {
      return 1;
    }

    const exactMatches = comparison.relationshipMatches.filter(
      (item) => item.matchType === 'exact',
    ).length;
    const typeMismatchMatches = comparison.relationshipMatches.filter(
      (item) => item.matchType === 'type-mismatch',
    ).length;

    return this.clamp(
      (exactMatches + typeMismatchMatches * 0.4) / solutionCount,
      0,
      1,
    );
  }

  private hasRelationshipTypeMismatch(comparison: DiagramComparison) {
    return comparison.relationshipMatches.some(
      (item) => item.matchType === 'type-mismatch',
    );
  }

  private ratio(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 1;
    }
    return this.clamp(numerator / denominator, 0, 1);
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
