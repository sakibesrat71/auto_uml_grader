import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiagramComparisonService } from './comparison/diagram-comparison.service';
import {
  CompareDiagramsRequest,
  DiagramComparison,
} from './contracts/comparison.contract';
import {
  DiscrepancyItem,
  GradeRequest,
  GradeResponse,
  GraderHealthResponse,
} from './contracts/grading.contract';
import { OllamaGradingService } from './ollama/ollama-grading.service';
import { ParseUxfRequest } from './contracts/uml.contract';
import { UxfParserService } from './uxf/uxf-parser.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly uxfParserService: UxfParserService,
    private readonly diagramComparisonService: DiagramComparisonService,
    private readonly ollamaGradingService: OllamaGradingService,
  ) {}

  health(): GraderHealthResponse {
    return {
      status: 'ok',
      service: 'uml-grader',
      ollamaBaseUrl:
        this.configService.get<string>('OLLAMA_BASE_URL') ??
        'http://127.0.0.1:11434',
      ollamaModel:
        this.configService.get<string>('OLLAMA_MODEL') ?? 'qwen2.5:3b-instruct',
    };
  }

  async grade(request: GradeRequest): Promise<GradeResponse> {
    this.validateGradeRequest(request);
    const solution = this.uxfParserService.parse(request.solutionUxf);
    const submission = this.uxfParserService.parse(request.submissionUxf);
    const comparison = this.diagramComparisonService.compare(
      solution,
      submission,
      request.synonymsMap,
    );
    const discrepancies = this.buildDeterministicDiscrepancies(comparison);
    if (this.isExactDeterministicMatch(comparison, discrepancies)) {
      return this.buildExactMatchGrade(comparison, request.maxScore);
    }

    const useOllama =
      this.configService.get<string>('GRADER_USE_OLLAMA') !== 'false';

    if (useOllama) {
      try {
        return await this.ollamaGradingService.grade({
          comparison,
          deterministicDiscrepancies: discrepancies,
          maxScore: request.maxScore,
        });
      } catch (error) {
        return this.buildFallbackGrade(
          comparison,
          discrepancies,
          request.maxScore,
          error instanceof Error ? error.message : 'Unknown Ollama error.',
        );
      }
    }

    return this.buildFallbackGrade(
      comparison,
      discrepancies,
      request.maxScore,
      'Ollama grading disabled by GRADER_USE_OLLAMA=false.',
    );
  }

  private buildFallbackGrade(
    comparison: DiagramComparison,
    discrepancies: DiscrepancyItem[],
    maxScore: number,
    fallbackReason: string,
  ): GradeResponse {
    const score = this.estimateDeterministicScore(comparison, maxScore);
    return {
      score,
      maxScore,
      percentage: this.toPercentage(score, maxScore),
      summary: `Deterministic fallback grade used. Matched ${comparison.summary.matchedClassCount}/${comparison.summary.solutionClassCount} solution classes and ${comparison.summary.matchedRelationshipCount}/${comparison.summary.solutionRelationshipCount} solution relationships.`,
      rubricBreakdown: this.buildFallbackRubric(comparison, maxScore),
      discrepancies,
      flags: {
        lowConfidence: true,
        extractionIssues:
          comparison.solution.metadata.unlinkedRelationshipCount > 0 ||
          comparison.submission.metadata.unlinkedRelationshipCount > 0,
        invalidJsonRecovered: false,
        manualReviewRecommended: true,
        notes: [
          `Ollama grading unavailable: ${fallbackReason}`,
          `Missing classes: ${comparison.summary.missingClassCount}.`,
          `Extra classes: ${comparison.summary.extraClassCount}.`,
          `Missing relationships: ${comparison.summary.missingRelationshipCount}.`,
          `Extra relationships: ${comparison.summary.extraRelationshipCount}.`,
        ],
      },
    };
  }

  private buildExactMatchGrade(
    comparison: DiagramComparison,
    maxScore: number,
  ): GradeResponse {
    const rubricBreakdown = this.buildFallbackRubric(comparison, maxScore);

    return {
      score: maxScore,
      maxScore,
      percentage: 100,
      summary:
        'Exact deterministic match. The submission matches the reference classes, members, and relationships.',
      rubricBreakdown,
      discrepancies: [],
      flags: {
        lowConfidence: false,
        extractionIssues: false,
        invalidJsonRecovered: false,
        manualReviewRecommended: false,
        notes: ['Exact deterministic match; Ollama grading was not required.'],
      },
    };
  }

  private isExactDeterministicMatch(
    comparison: DiagramComparison,
    discrepancies: DiscrepancyItem[],
  ) {
    return (
      discrepancies.length === 0 &&
      comparison.summary.solutionClassCount ===
        comparison.summary.submissionClassCount &&
      comparison.summary.solutionRelationshipCount ===
        comparison.summary.submissionRelationshipCount &&
      comparison.summary.matchedClassCount ===
        comparison.summary.solutionClassCount &&
      comparison.summary.matchedRelationshipCount ===
        comparison.summary.solutionRelationshipCount &&
      comparison.solution.metadata.unlinkedRelationshipCount === 0 &&
      comparison.submission.metadata.unlinkedRelationshipCount === 0
    );
  }

  private buildFallbackRubric(
    comparison: DiagramComparison,
    maxScore: number,
  ): GradeResponse['rubricBreakdown'] {
    const classMax = maxScore * 0.3;
    const memberMax = maxScore * 0.2;
    const relationshipMax = maxScore * 0.3;
    const semanticMax = maxScore * 0.1;
    const clarityMax = maxScore * 0.1;
    const classScore =
      classMax *
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
    const memberScore = memberMax * this.ratio(matchedMembers, expectedMembers);
    const relationshipScore =
      relationshipMax *
      this.ratio(
        comparison.summary.matchedRelationshipCount,
        comparison.summary.solutionRelationshipCount,
      );
    const semanticPenalty =
      comparison.summary.extraClassCount +
      comparison.summary.extraRelationshipCount;
    const semanticScore = semanticMax * (semanticPenalty > 0 ? 0.6 : 1);
    const clarityScore =
      clarityMax *
      (comparison.submission.metadata.unlinkedRelationshipCount > 0 ? 0.5 : 1);

    return [
      {
        criterionKey: 'class_coverage',
        label: 'Class coverage',
        maxMarks: this.roundScore(classMax),
        awardedMarks: this.roundScore(classScore),
        reason: `${comparison.summary.matchedClassCount}/${comparison.summary.solutionClassCount} expected classes matched.`,
      },
      {
        criterionKey: 'attributes_methods',
        label: 'Attributes and methods',
        maxMarks: this.roundScore(memberMax),
        awardedMarks: this.roundScore(memberScore),
        reason: `${matchedMembers}/${expectedMembers} expected attributes or methods matched.`,
      },
      {
        criterionKey: 'relationships',
        label: 'Relationships',
        maxMarks: this.roundScore(relationshipMax),
        awardedMarks: this.roundScore(relationshipScore),
        reason: `${comparison.summary.matchedRelationshipCount}/${comparison.summary.solutionRelationshipCount} expected relationships matched.`,
      },
      {
        criterionKey: 'semantic_equivalence',
        label: 'Semantic equivalence',
        maxMarks: this.roundScore(semanticMax),
        awardedMarks: this.roundScore(semanticScore),
        reason:
          semanticPenalty > 0
            ? 'Extra classes or relationships require semantic judgement.'
            : 'No extra classes or relationships detected.',
      },
      {
        criterionKey: 'uml_clarity',
        label: 'UML correctness and clarity',
        maxMarks: this.roundScore(clarityMax),
        awardedMarks: this.roundScore(clarityScore),
        reason:
          comparison.submission.metadata.unlinkedRelationshipCount > 0
            ? 'Some submission relationships could not be linked to classes.'
            : 'Submission relationships were linkable to classes.',
      },
    ];
  }

  private estimateDeterministicScore(
    comparison: DiagramComparison,
    maxScore: number,
  ) {
    const rubric = this.buildFallbackRubric(comparison, maxScore);
    return this.roundScore(
      rubric.reduce((sum, item) => sum + item.awardedMarks, 0),
    );
  }

  private ratio(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, numerator / denominator));
  }

  private toPercentage(score: number, maxScore: number) {
    return maxScore > 0 ? this.roundScore((score / maxScore) * 100) : 0;
  }

  private roundScore(value: number) {
    return Number(value.toFixed(2));
  }

  parseUxf(request: ParseUxfRequest) {
    if (typeof request?.uxf !== 'string' || !request.uxf.trim()) {
      throw new BadRequestException('uxf is required.');
    }

    return this.uxfParserService.parse(request.uxf);
  }

  compare(request: CompareDiagramsRequest) {
    this.validateCompareRequest(request);
    const solution = this.uxfParserService.parse(request.solutionUxf);
    const submission = this.uxfParserService.parse(request.submissionUxf);

    return this.diagramComparisonService.compare(
      solution,
      submission,
      request.synonymsMap,
    );
  }

  private buildDeterministicDiscrepancies(
    comparison: DiagramComparison,
  ): DiscrepancyItem[] {
    return [
      ...comparison.missingClasses.map((item) => ({
        category: 'missing_class',
        severity: 'major' as const,
        message: `Missing expected class ${item.name}.`,
        expected: item.name,
        entityRef: item.name,
      })),
      ...comparison.extraClasses.map((item) => ({
        category: 'extra_class',
        severity: 'minor' as const,
        message: `Submission includes extra class ${item.name}.`,
        actual: item.name,
        entityRef: item.name,
      })),
      ...comparison.classMatches.flatMap((item) => [
        ...item.missingAttributes.map((attribute) => ({
          category: 'missing_attribute',
          severity: 'minor' as const,
          message: `Class ${item.submissionClass} is missing expected attribute ${attribute}.`,
          expected: attribute,
          entityRef: item.solutionClass,
        })),
        ...item.extraAttributes.map((attribute) => ({
          category: 'extra_attribute',
          severity: 'minor' as const,
          message: `Class ${item.submissionClass} includes extra attribute ${attribute}.`,
          actual: attribute,
          entityRef: item.submissionClass,
        })),
        ...item.missingMethods.map((method) => ({
          category: 'missing_method',
          severity: 'minor' as const,
          message: `Class ${item.submissionClass} is missing expected method ${method}.`,
          expected: method,
          entityRef: item.solutionClass,
        })),
        ...item.extraMethods.map((method) => ({
          category: 'extra_method',
          severity: 'minor' as const,
          message: `Class ${item.submissionClass} includes extra method ${method}.`,
          actual: method,
          entityRef: item.submissionClass,
        })),
      ]),
      ...comparison.missingRelationships.map((item) => ({
        category: 'missing_relationship',
        severity: 'major' as const,
        message: `Missing ${item.relationship.type} relationship from ${item.relationship.source} to ${item.relationship.target}.`,
        expected: `${item.relationship.source} -> ${item.relationship.target}`,
        entityRef: `${item.relationship.source}:${item.relationship.target}`,
      })),
      ...comparison.extraRelationships.map((item) => ({
        category: 'extra_relationship',
        severity: 'minor' as const,
        message: `Submission includes extra ${item.relationship.type} relationship from ${item.relationship.source} to ${item.relationship.target}.`,
        actual: `${item.relationship.source} -> ${item.relationship.target}`,
        entityRef: `${item.relationship.source}:${item.relationship.target}`,
      })),
      ...comparison.relationshipMatches
        .filter((item) => item.matchType === 'type-mismatch')
        .map((item) => ({
          category: 'relationship_type_mismatch',
          severity: 'major' as const,
          message: `Relationship from ${item.solutionRelationship.source} to ${item.solutionRelationship.target} has a different type.`,
          expected: item.solutionRelationship.type,
          actual: item.submissionRelationship.type,
          entityRef: `${item.solutionRelationship.source}:${item.solutionRelationship.target}`,
        })),
    ];
  }

  private validateCompareRequest(request: CompareDiagramsRequest) {
    if (!request || typeof request !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (
      typeof request.solutionUxf !== 'string' ||
      !request.solutionUxf.trim()
    ) {
      throw new BadRequestException('solutionUxf is required.');
    }

    if (
      typeof request.submissionUxf !== 'string' ||
      !request.submissionUxf.trim()
    ) {
      throw new BadRequestException('submissionUxf is required.');
    }
  }

  private validateGradeRequest(request: GradeRequest) {
    if (!request || typeof request !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (!request.assignmentId?.trim()) {
      throw new BadRequestException('assignmentId is required.');
    }

    if (
      typeof request.solutionUxf !== 'string' ||
      !request.solutionUxf.trim()
    ) {
      throw new BadRequestException('solutionUxf is required.');
    }

    if (
      typeof request.submissionUxf !== 'string' ||
      !request.submissionUxf.trim()
    ) {
      throw new BadRequestException('submissionUxf is required.');
    }

    if (!Number.isFinite(request.maxScore) || request.maxScore <= 0) {
      throw new BadRequestException('maxScore must be a positive number.');
    }
  }
}
