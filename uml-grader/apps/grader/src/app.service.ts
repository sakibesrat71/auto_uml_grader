import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GradeRequest,
  GradeResponse,
  GraderHealthResponse,
} from './contracts/grading.contract';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  health(): GraderHealthResponse {
    return {
      status: 'ok',
      service: 'uml-grader',
      ollamaBaseUrl:
        this.configService.get<string>('OLLAMA_BASE_URL') ??
        'http://localhost:11434',
      ollamaModel:
        this.configService.get<string>('OLLAMA_MODEL') ?? 'llama3.2:3b',
    };
  }

  grade(request: GradeRequest): GradeResponse {
    this.validateGradeRequest(request);

    return {
      score: 0,
      maxScore: request.maxScore,
      percentage: 0,
      summary:
        'Grader service skeleton is running. UXF parsing and Ollama scoring are not implemented yet.',
      rubricBreakdown: [],
      discrepancies: [],
      flags: {
        lowConfidence: true,
        extractionIssues: false,
        invalidJsonRecovered: false,
        manualReviewRecommended: true,
        notes: ['Placeholder response from apps/grader.'],
      },
    };
  }

  private validateGradeRequest(request: GradeRequest) {
    if (!request || typeof request !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (!request.assignmentId?.trim()) {
      throw new BadRequestException('assignmentId is required.');
    }

    if (!request.solutionUxf?.trim()) {
      throw new BadRequestException('solutionUxf is required.');
    }

    if (!request.submissionUxf?.trim()) {
      throw new BadRequestException('submissionUxf is required.');
    }

    if (!Number.isFinite(request.maxScore) || request.maxScore <= 0) {
      throw new BadRequestException('maxScore must be a positive number.');
    }
  }
}
