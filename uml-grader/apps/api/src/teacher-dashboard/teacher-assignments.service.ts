import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Assignment,
  AssignmentDocument,
  Grade,
  GradeDocument,
  Solution,
  SolutionDocument,
  Submission,
  SubmissionDocument,
  User,
  UserDocument,
} from '../schemas/entities.schema';

interface RequestUser {
  id: string;
  role: string;
  email: string;
  fullName: string;
}

interface CreateAssignmentInput {
  title: string;
  description?: string;
  totalMarks: number;
  dueAt?: string | null;
  synonymsMap?: Record<string, string[]>;
  solutionCount?: number;
  isPublished?: boolean;
}

interface UploadSolutionInput {
  label: string;
  extractionStatus?: string;
}

interface ReplaceSolutionInput {
  label?: string;
  extractionStatus?: string;
}

interface OverrideSubmissionGradeInput {
  finalScore: number;
  comment?: string;
}

interface UploadedSolutionFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type TeacherSubmissionStatus =
  | 'submitted'
  | 'processing'
  | 'graded'
  | 'failed';

type ActivityItem = {
  type: string;
  occurredAt: Date;
  message: string;
};

@Injectable()
export class TeacherAssignmentsService {
  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Solution.name)
    private readonly solutionModel: Model<SolutionDocument>,
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createAssignment(
    user: RequestUser | undefined,
    input: CreateAssignmentInput,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    this.validateCreateAssignmentInput(input);

    const assignment = await this.assignmentModel.create({
      teacherId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      totalMarks: input.totalMarks,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      synonymsMap: this.normalizeSynonymsMap(input.synonymsMap),
      solutionCount: input.solutionCount ?? 0,
      isPublished: input.isPublished ?? false,
    });

    return this.mapAssignmentResponse(assignment);
  }

  async getAssignmentDetail(
    user: RequestUser | undefined,
    assignmentId: string,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only view your own assignments.',
      );
    }

    const [solutions, submissions] = await Promise.all([
      this.solutionModel
        .find({ assignmentId: assignment._id })
        .sort({ createdAt: 1 })
        .lean(),
      this.submissionModel
        .find({ assignmentId: assignment._id })
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    const studentIds = Array.from(
      new Set(submissions.map((item) => item.studentId.toString())),
    );
    const gradeIds = Array.from(
      new Set(
        submissions
          .map((item) => item.latestGradeId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [studentMap, gradeMap] = await Promise.all([
      this.getStudentMap(studentIds),
      this.getGradeMap(gradeIds),
    ]);

    const solutionSlotMap = new Map<string, string>();
    const solutionLabelMap = new Map<string, string>();
    for (const [index, solution] of solutions.entries()) {
      const slot = this.getSolutionSlotLabel(index);
      solutionSlotMap.set(solution._id.toString(), slot);
      solutionLabelMap.set(
        solution._id.toString(),
        `${slot} - ${solution.label}`,
      );
    }

    const submissionRows = submissions.map((submission) => {
      const grade = submission.latestGradeId
        ? gradeMap.get(submission.latestGradeId.toString())
        : undefined;
      return this.mapSubmissionRow(
        assignment,
        submission,
        grade,
        studentMap,
        solutionSlotMap,
        solutionLabelMap,
      );
    });

    const gradedRows = submissionRows.filter((item) => item.autoMark !== null);
    const lateCount = submissionRows.filter((item) => item.isLate).length;
    const averageMark = gradedRows.length
      ? gradedRows.reduce((sum, item) => sum + (item.autoMark ?? 0), 0) /
        gradedRows.length
      : null;
    const scoredMarks = gradedRows
      .map((item) => item.autoMark)
      .filter((value): value is number => value !== null);
    const synonymEntries = Array.from(assignment.synonymsMap?.entries() ?? []);
    const equivalentNamesCount = synonymEntries.reduce(
      (sum, [, aliases]) => sum + aliases.length,
      0,
    );
    const analytics = this.buildAnalytics(submissionRows, gradedRows);
    const referenceSolutions = solutions.map((solution, index) =>
      this.mapReferenceSolution(solution, index, synonymEntries.length > 0),
    );
    const activity = this.buildActivity(
      assignment,
      referenceSolutions,
      submissionRows,
      gradeMap,
    );

    return {
      assignment: {
        assignmentId: assignment._id.toString(),
        title: assignment.title,
        description: assignment.description ?? '',
        totalMarks: assignment.totalMarks,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
        status: this.getAssignmentStatus(
          assignment.isPublished,
          assignment.dueAt,
        ),
        isPublished: assignment.isPublished,
      },
      summary: {
        totalSubmissions: submissionRows.length,
        studentsGraded: gradedRows.length,
        pendingGrading: submissionRows.filter(
          (item) => item.status !== 'graded',
        ).length,
        averageMark:
          averageMark !== null ? Number(averageMark.toFixed(2)) : null,
        highestMark: scoredMarks.length ? Math.max(...scoredMarks) : null,
        lowestMark: scoredMarks.length ? Math.min(...scoredMarks) : null,
        lateSubmissionsCount: lateCount,
        referenceSolutionsUploaded: referenceSolutions.length,
      },
      referenceSolutions: {
        activeCount: referenceSolutions.length,
        hasSynonymMapConfigured: synonymEntries.length > 0,
        lastExtractionAt: this.getLatestExtractionTime(referenceSolutions),
        items: referenceSolutions,
      },
      synonymsConfig: {
        isConfigured: synonymEntries.length > 0,
        preview: synonymEntries.map(([key, aliases]) => ({
          term: key,
          aliases,
        })),
        matchingRulesSummary: [
          'Exact class and member name matches are preferred first.',
          synonymEntries.length > 0
            ? 'Configured synonym aliases are used during name matching.'
            : 'No synonym aliases are configured for this assignment.',
          'Relationship, attribute, and method discrepancies feed teacher review.',
        ],
        allowedEquivalentNamesCount: equivalentNamesCount,
      },
      submissions: submissionRows,
      analytics,
      actions: {
        canEditAssignment: true,
        canCloseAssignment:
          this.getAssignmentStatus(assignment.isPublished, assignment.dueAt) !==
          'Closed',
        canDeleteAssignment: true,
        canExportMarksCsv: submissionRows.length > 0,
        canPublishMarks: gradedRows.length > 0,
      },
      activity,
    };
  }

  async uploadSolution(
    user: RequestUser | undefined,
    assignmentId: string,
    input: UploadSolutionInput,
    file: UploadedSolutionFile,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    if (!file) {
      throw new BadRequestException('A solution file is required.');
    }
    if (!input.label?.trim()) {
      throw new BadRequestException('label is required.');
    }

    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only upload solutions to your own assignments.',
      );
    }

    const mimeType = this.normalizeAndValidateSolutionMimeType(file);
    const solution = await this.solutionModel.create({
      assignmentId: assignment._id,
      label: input.label.trim(),
      originalFileName: file.originalname,
      mimeType,
      fileSizeBytes: file.size,
      imageUrl: this.fileBufferToDataUrl(file.buffer, mimeType),
      imageStorageKey: `inline:${assignment._id.toString()}:${Date.now()}:${file.originalname}`,
      extractionStatus: input.extractionStatus?.trim() || 'pending',
      uploadedBy: teacherId,
    });

    assignment.solutionCount = await this.solutionModel.countDocuments({
      assignmentId: assignment._id,
    });
    await assignment.save();

    return this.mapSolutionResponse(solution, assignment._id.toString());
  }

  async replaceSolution(
    user: RequestUser | undefined,
    assignmentId: string,
    solutionId: string,
    input: ReplaceSolutionInput,
    file: UploadedSolutionFile,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    if (!file) {
      throw new BadRequestException('A replacement solution file is required.');
    }

    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only modify solutions for your own assignments.',
      );
    }

    const solution = await this.solutionModel.findOne({
      _id: this.toObjectId(solutionId, 'solutionId'),
      assignmentId: assignment._id,
    });
    if (!solution) {
      throw new NotFoundException('Solution not found.');
    }

    const mimeType = this.normalizeAndValidateSolutionMimeType(file);
    solution.label = input.label?.trim() || solution.label;
    solution.originalFileName = file.originalname;
    solution.mimeType = mimeType;
    solution.fileSizeBytes = file.size;
    solution.imageUrl = this.fileBufferToDataUrl(file.buffer, mimeType);
    solution.imageStorageKey = `inline:${assignment._id.toString()}:${Date.now()}:${file.originalname}`;
    solution.extractionStatus = input.extractionStatus?.trim() || 'pending';
    solution.extractedUmlJson = undefined;
    solution.extractionError = undefined;
    await solution.save();

    return this.mapSolutionResponse(solution, assignment._id.toString());
  }

  async deleteSolution(
    user: RequestUser | undefined,
    assignmentId: string,
    solutionId: string,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only modify solutions for your own assignments.',
      );
    }

    const solution = await this.solutionModel.findOneAndDelete({
      _id: this.toObjectId(solutionId, 'solutionId'),
      assignmentId: assignment._id,
    });
    if (!solution) {
      throw new NotFoundException('Solution not found.');
    }

    assignment.solutionCount = await this.solutionModel.countDocuments({
      assignmentId: assignment._id,
    });
    await assignment.save();

    return {
      message: 'Solution deleted successfully.',
      solutionId: solution._id.toString(),
      assignmentId: assignment._id.toString(),
      solutionCount: assignment.solutionCount,
    };
  }

  async closeAssignment(
    user: RequestUser | undefined,
    assignmentId: string,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only update your own assignments.',
      );
    }

    assignment.isPublished = true;
    assignment.dueAt = new Date();
    await assignment.save();

    return {
      ...this.mapAssignmentResponse(assignment),
      status: 'Closed',
    };
  }

  async deleteAssignment(
    user: RequestUser | undefined,
    assignmentId: string,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    const assignmentObjectId = this.toObjectId(assignmentId, 'assignmentId');
    const assignment = await this.assignmentModel.findById(assignmentObjectId);

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only delete your own assignments.',
      );
    }

    await Promise.all([
      this.gradeModel.deleteMany({ assignmentId: assignmentObjectId }),
      this.submissionModel.deleteMany({ assignmentId: assignmentObjectId }),
      this.solutionModel.deleteMany({ assignmentId: assignmentObjectId }),
      this.assignmentModel.deleteOne({ _id: assignmentObjectId }),
    ]);

    return {
      message: 'Assignment deleted successfully.',
      assignmentId,
    };
  }

  async overrideSubmissionGrade(
    user: RequestUser | undefined,
    assignmentId: string,
    submissionId: string,
    input: OverrideSubmissionGradeInput,
  ) {
    const teacherId = this.getTeacherObjectId(user);
    if (!Number.isFinite(input.finalScore)) {
      throw new BadRequestException('finalScore must be a number.');
    }

    const assignment = await this.assignmentModel.findById(
      this.toObjectId(assignmentId, 'assignmentId'),
    );
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      throw new ForbiddenException(
        'You can only override grades for your own assignments.',
      );
    }

    const submission = await this.submissionModel.findOne({
      _id: this.toObjectId(submissionId, 'submissionId'),
      assignmentId: assignment._id,
    });
    if (!submission) {
      throw new NotFoundException('Submission not found.');
    }
    if (!submission.latestGradeId) {
      throw new BadRequestException(
        'This submission does not have a grade to override yet.',
      );
    }

    const grade = await this.gradeModel.findById(submission.latestGradeId);
    if (!grade) {
      throw new NotFoundException('Grade not found.');
    }

    const maxScore = grade.maxScore ?? assignment.totalMarks;
    if (input.finalScore < 0 || input.finalScore > maxScore) {
      throw new BadRequestException(
        `finalScore must be between 0 and ${maxScore}.`,
      );
    }

    grade.teacherOverride = {
      isOverridden: true,
      overriddenBy: user?.fullName || user?.email || user?.id || '',
      overriddenAt: new Date(),
      originalScore: grade.teacherOverride?.originalScore ?? grade.score,
      finalScore: input.finalScore,
      comment: input.comment?.trim() || undefined,
    };
    await grade.save();

    return {
      message: 'Teacher override saved.',
      submissionId: submission._id.toString(),
      assignmentId: assignment._id.toString(),
      finalScore: input.finalScore,
      maxScore,
      percentage:
        maxScore > 0
          ? Number(((input.finalScore / maxScore) * 100).toFixed(2))
          : 0,
      comment: grade.teacherOverride.comment ?? null,
      overriddenAt: grade.teacherOverride.overriddenAt?.toISOString() ?? null,
      overriddenBy: grade.teacherOverride.overriddenBy ?? null,
    };
  }

  private mapAssignmentResponse(assignment: AssignmentDocument) {
    return {
      assignmentId: assignment._id.toString(),
      teacherId: assignment.teacherId.toString(),
      title: assignment.title,
      description: assignment.description ?? null,
      totalMarks: assignment.totalMarks,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      synonymsMap: Object.fromEntries(assignment.synonymsMap ?? []),
      solutionCount: assignment.solutionCount,
      isPublished: assignment.isPublished,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  private mapSolutionResponse(
    solution: SolutionDocument,
    assignmentId: string,
  ) {
    return {
      solutionId: solution._id.toString(),
      assignmentId,
      label: solution.label,
      originalFileName: solution.originalFileName,
      mimeType: solution.mimeType,
      fileSizeBytes: solution.fileSizeBytes,
      extractionStatus: solution.extractionStatus,
      uploadedBy: solution.uploadedBy.toString(),
      uploadedAt: solution.createdAt.toISOString(),
    };
  }

  private mapReferenceSolution(
    solution: SolutionDocument,
    index: number,
    hasSynonymMapConfigured: boolean,
  ) {
    const extractionStatus = this.mapExtractionStatus(
      solution.extractionStatus,
      Boolean(solution.extractedUmlJson),
      Boolean(solution.extractionError),
    );

    return {
      solutionId: solution._id.toString(),
      slot: this.getSolutionSlotLabel(index),
      label: solution.label,
      originalFileName: solution.originalFileName,
      mimeType: solution.mimeType,
      fileSizeBytes: solution.fileSizeBytes,
      previewUrl: solution.imageUrl,
      extractionStatus,
      extractionStatusLabel:
        extractionStatus.charAt(0).toUpperCase() + extractionStatus.slice(1),
      extractedStructure: solution.extractedUmlJson ?? null,
      extractionError: solution.extractionError ?? null,
      lastExtractionAt:
        solution.extractedUmlJson?.extractionMeta?.extractedAt?.toISOString() ??
        null,
      updatedAt: solution.updatedAt.toISOString(),
      uploadedAt: solution.createdAt.toISOString(),
      hasSynonymMapConfigured,
    };
  }

  private mapSubmissionRow(
    assignment: AssignmentDocument,
    submission: SubmissionDocument,
    grade: GradeDocument | undefined,
    studentMap: Map<string, string>,
    solutionSlotMap: Map<string, string>,
    solutionLabelMap: Map<string, string>,
  ) {
    const effectiveScore = this.getEffectiveScore(grade);
    const maxScore = grade?.maxScore ?? assignment.totalMarks;
    const matchedSolution = this.getMatchedSolutionSummary(
      grade,
      solutionSlotMap,
      solutionLabelMap,
    );
    const status = this.mapSubmissionStatus(submission.status, Boolean(grade));
    const submittedAt = submission.submittedAt ?? submission.createdAt;
    const isLate = assignment.dueAt
      ? submittedAt.getTime() > assignment.dueAt.getTime()
      : false;
    const needsReview = this.isNeedsReview(submission, grade);
    const discrepancyGroups = this.groupDiscrepancies(grade);
    const confidenceScore = this.getConfidenceScore(submission, grade);
    const synonymMatches = this.getSynonymMatches(grade);

    return {
      submissionId: submission._id.toString(),
      studentName:
        studentMap.get(submission.studentId.toString()) ?? 'Unknown Student',
      studentId: submission.studentId.toString(),
      submittedAt: submittedAt.toISOString(),
      status,
      autoMark: effectiveScore,
      maxScore,
      percentage:
        effectiveScore !== null && maxScore > 0
          ? Number(((effectiveScore / maxScore) * 100).toFixed(2))
          : null,
      bestMatchedSolution: matchedSolution,
      confidenceScore,
      isLate,
      needsReview,
      flags: this.extractFlags(grade),
      detail: {
        imageUrl: submission.imageUrl,
        originalFileName: submission.originalFileName,
        mimeType: submission.mimeType,
        fileSizeBytes: submission.fileSizeBytes,
        extractionError: submission.extractionError ?? null,
        autoGeneratedMark: effectiveScore,
        maxScore,
        bestMatchedReferenceSolution: matchedSolution,
        markingCriteria: grade?.rubricBreakdown ?? [],
        missingClasses: discrepancyGroups.missingClasses,
        extraClasses: discrepancyGroups.extraClasses,
        relationshipMismatches: discrepancyGroups.relationshipMismatches,
        attributeMethodMismatches: discrepancyGroups.attributeMethodMismatches,
        namingMismatches: discrepancyGroups.namingMismatches,
        synonymMatchesDetected: synonymMatches,
        teacherFinalMark: effectiveScore,
        teacherComment: grade?.teacherOverride?.comment ?? '',
        override: grade?.teacherOverride
          ? {
              isOverridden: Boolean(grade.teacherOverride.isOverridden),
              overriddenBy: grade.teacherOverride.overriddenBy ?? null,
              overriddenAt:
                grade.teacherOverride.overriddenAt?.toISOString() ?? null,
              originalScore: grade.teacherOverride.originalScore ?? null,
              finalScore: grade.teacherOverride.finalScore ?? null,
            }
          : null,
      },
    };
  }

  private buildAnalytics(
    submissionRows: Array<ReturnType<typeof this.mapSubmissionRow>>,
    gradedRows: Array<ReturnType<typeof this.mapSubmissionRow>>,
  ) {
    const bucketDefinitions = [
      { key: '0-24', min: 0, max: 24 },
      { key: '25-49', min: 25, max: 49 },
      { key: '50-64', min: 50, max: 64 },
      { key: '65-74', min: 65, max: 74 },
      { key: '75-84', min: 75, max: 84 },
      { key: '85-100', min: 85, max: 100 },
    ];

    const distribution = bucketDefinitions.map((bucket) => ({
      range: bucket.key,
      count: gradedRows.filter((item) => {
        const percentage = item.percentage ?? -1;
        return percentage >= bucket.min && percentage <= bucket.max;
      }).length,
    }));

    const solutionMatchCounts = new Map<string, number>();
    const mistakeCounts = new Map<string, number>();
    const classMissCounts = new Map<string, number>();
    const relationshipErrorCounts = new Map<string, number>();

    for (const row of submissionRows) {
      const solutionKey = row.bestMatchedSolution?.slot ?? 'Unmatched';
      solutionMatchCounts.set(
        solutionKey,
        (solutionMatchCounts.get(solutionKey) ?? 0) + 1,
      );

      for (const issue of row.detail.missingClasses) {
        const key = issue.entityRef || issue.expected || issue.message;
        classMissCounts.set(key, (classMissCounts.get(key) ?? 0) + 1);
        mistakeCounts.set(
          issue.message,
          (mistakeCounts.get(issue.message) ?? 0) + 1,
        );
      }

      for (const issue of row.detail.relationshipMismatches) {
        const key = issue.entityRef || issue.message;
        relationshipErrorCounts.set(
          key,
          (relationshipErrorCounts.get(key) ?? 0) + 1,
        );
        mistakeCounts.set(
          issue.message,
          (mistakeCounts.get(issue.message) ?? 0) + 1,
        );
      }

      for (const issue of [
        ...row.detail.extraClasses,
        ...row.detail.attributeMethodMismatches,
        ...row.detail.namingMismatches,
      ]) {
        mistakeCounts.set(
          issue.message,
          (mistakeCounts.get(issue.message) ?? 0) + 1,
        );
      }
    }

    return {
      markDistribution: distribution,
      matchedSolutions: Array.from(solutionMatchCounts.entries())
        .map(([slot, count]) => ({ slot, count }))
        .sort((left, right) => right.count - left.count),
      commonMistakes: Array.from(mistakeCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      mostFrequentlyMissedClass: this.pickTopEntry(classMissCounts),
      mostCommonRelationshipError: this.pickTopEntry(relationshipErrorCounts),
      submissionsNeedingManualReview: submissionRows.filter(
        (item) => item.needsReview,
      ).length,
    };
  }

  private buildActivity(
    assignment: AssignmentDocument,
    referenceSolutions: Array<ReturnType<typeof this.mapReferenceSolution>>,
    submissionRows: Array<ReturnType<typeof this.mapSubmissionRow>>,
    gradeMap: Map<string, GradeDocument>,
  ) {
    const activity: ActivityItem[] = [
      {
        type: 'assignment-created',
        occurredAt: assignment.createdAt,
        message: 'Assignment created',
      },
    ];

    if (assignment.updatedAt.getTime() !== assignment.createdAt.getTime()) {
      activity.push({
        type: 'assignment-updated',
        occurredAt: assignment.updatedAt,
        message: 'Assignment configuration updated',
      });
    }

    if (
      this.getAssignmentStatus(assignment.isPublished, assignment.dueAt) ===
      'Closed'
    ) {
      activity.push({
        type: 'assignment-closed',
        occurredAt: assignment.dueAt ?? assignment.updatedAt,
        message: 'Assignment closed',
      });
    }

    for (const solution of referenceSolutions) {
      activity.push({
        type: 'solution-uploaded',
        occurredAt: new Date(solution.uploadedAt),
        message: `${solution.slot} uploaded: ${solution.label}`,
      });
      if (solution.lastExtractionAt) {
        activity.push({
          type: 'solution-extracted',
          occurredAt: new Date(solution.lastExtractionAt),
          message: `${solution.slot} extraction ${solution.extractionStatusLabel.toLowerCase()}`,
        });
      }
    }

    for (const row of submissionRows) {
      activity.push({
        type: 'submission-uploaded',
        occurredAt: new Date(row.submittedAt),
        message: `${row.studentName} submitted work`,
      });

      const grade = Array.from(gradeMap.values()).find(
        (item) => item.submissionId.toString() === row.submissionId,
      );
      if (grade) {
        activity.push({
          type: 'submission-graded',
          occurredAt: grade.updatedAt ?? grade.createdAt,
          message: `${row.studentName} graded at ${this.getEffectiveScore(grade) ?? grade.score}/${grade.maxScore}`,
        });
        if (grade.teacherOverride?.isOverridden) {
          activity.push({
            type: 'mark-overridden',
            occurredAt:
              grade.teacherOverride.overriddenAt ??
              grade.updatedAt ??
              grade.createdAt,
            message: `Mark overridden for ${row.studentName}`,
          });
        }
      }
    }

    return activity
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 20)
      .map((item) => ({
        type: item.type,
        occurredAt: item.occurredAt.toISOString(),
        message: item.message,
      }));
  }

  private getLatestExtractionTime(
    referenceSolutions: Array<ReturnType<typeof this.mapReferenceSolution>>,
  ) {
    const timestamps = referenceSolutions
      .map((item) => item.lastExtractionAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    if (timestamps.length === 0) {
      return null;
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }

  private groupDiscrepancies(grade?: GradeDocument) {
    const discrepancies = grade?.discrepancies ?? [];
    const missingClasses = discrepancies.filter((item) =>
      this.matchesDiscrepancy(item.category, item.message, ['missing class']),
    );
    const extraClasses = discrepancies.filter((item) =>
      this.matchesDiscrepancy(item.category, item.message, ['extra class']),
    );
    const relationshipMismatches = discrepancies.filter((item) =>
      this.matchesDiscrepancy(item.category, item.message, ['relationship']),
    );
    const attributeMethodMismatches = discrepancies.filter((item) =>
      this.matchesDiscrepancy(item.category, item.message, [
        'attribute',
        'method',
      ]),
    );
    const namingMismatches = discrepancies.filter((item) =>
      this.matchesDiscrepancy(item.category, item.message, ['name', 'synonym']),
    );

    return {
      missingClasses,
      extraClasses,
      relationshipMismatches,
      attributeMethodMismatches,
      namingMismatches,
    };
  }

  private getSynonymMatches(grade?: GradeDocument) {
    return (grade?.discrepancies ?? []).filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('synonym'),
    );
  }

  private matchesDiscrepancy(
    category: string,
    message: string,
    keywords: string[],
  ) {
    const haystack = `${category} ${message}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private getMatchedSolutionSummary(
    grade: GradeDocument | undefined,
    solutionSlotMap: Map<string, string>,
    solutionLabelMap: Map<string, string>,
  ) {
    if (!grade?.chosenSolutionId && !grade?.chosenSolutionLabel) {
      return null;
    }

    if (grade.chosenSolutionId) {
      const solutionId = grade.chosenSolutionId.toString();
      return {
        slot:
          solutionSlotMap.get(solutionId) ??
          grade.chosenSolutionLabel ??
          'Matched',
        label:
          solutionLabelMap.get(solutionId) ??
          grade.chosenSolutionLabel ??
          'Matched solution',
      };
    }

    return {
      slot: grade.chosenSolutionLabel ?? 'Matched',
      label: grade.chosenSolutionLabel ?? 'Matched solution',
    };
  }

  private getConfidenceScore(
    submission: SubmissionDocument,
    grade?: GradeDocument,
  ) {
    const extractionConfidence =
      submission.extractedUmlJson?.extractionMeta?.confidence;
    if (typeof extractionConfidence === 'number') {
      return Number((extractionConfidence * 100).toFixed(1));
    }

    if (grade?.flags?.lowConfidence) {
      return 40;
    }

    return null;
  }

  private getEffectiveScore(grade?: GradeDocument) {
    if (!grade) {
      return null;
    }
    if (
      grade.teacherOverride?.isOverridden &&
      typeof grade.teacherOverride.finalScore === 'number'
    ) {
      return grade.teacherOverride.finalScore;
    }
    return grade.score;
  }

  private isNeedsReview(
    submission: SubmissionDocument,
    grade?: GradeDocument,
  ) {
    if (submission.extractionError) {
      return true;
    }
    return Boolean(
      grade?.flags?.lowConfidence ||
        grade?.flags?.extractionIssues ||
        grade?.flags?.manualReviewRecommended,
    );
  }

  private extractFlags(grade?: GradeDocument) {
    if (!grade) {
      return [];
    }

    const flags: string[] = [];
    if (grade.flags?.lowConfidence) {
      flags.push('Low confidence');
    }
    if (grade.flags?.extractionIssues) {
      flags.push('Extraction issues');
    }
    if (grade.flags?.manualReviewRecommended) {
      flags.push('Manual review recommended');
    }
    if (grade.flags?.invalidJsonRecovered) {
      flags.push('Recovered invalid JSON');
    }
    if (grade.teacherOverride?.isOverridden) {
      flags.push('Teacher override');
    }
    return [...flags, ...(grade.flags?.notes ?? [])];
  }

  private mapSubmissionStatus(
    rawStatus?: string,
    hasGrade?: boolean,
  ): TeacherSubmissionStatus {
    if (hasGrade || rawStatus === 'graded') {
      return 'graded';
    }
    if (['processing', 'queued'].includes(rawStatus ?? '')) {
      return 'processing';
    }
    if (['failed', 'parse_failed', 'unreadable'].includes(rawStatus ?? '')) {
      return 'failed';
    }
    return 'submitted';
  }

  private mapExtractionStatus(
    rawStatus?: string,
    hasExtractedUml?: boolean,
    hasExtractionError?: boolean,
  ) {
    if (hasExtractedUml) {
      return 'ready';
    }
    if (hasExtractionError || ['failed', 'error'].includes(rawStatus ?? '')) {
      return 'failed';
    }
    return 'processing';
  }

  private pickTopEntry(source: Map<string, number>) {
    const sorted = Array.from(source.entries()).sort(
      (left, right) => right[1] - left[1],
    );
    if (sorted.length === 0) {
      return null;
    }
    return {
      label: sorted[0][0],
      count: sorted[0][1],
    };
  }

  private getSolutionSlotLabel(index: number) {
    return `Solution ${String.fromCharCode(65 + index)}`;
  }

  private getAssignmentStatus(isPublished: boolean, dueAt?: Date | null) {
    if (!isPublished) {
      return 'Draft';
    }
    if (dueAt && dueAt.getTime() < Date.now()) {
      return 'Closed';
    }
    return 'Open';
  }

  private async getStudentMap(studentIds: string[]) {
    if (studentIds.length === 0) {
      return new Map<string, string>();
    }
    const students = await this.userModel
      .find({ _id: { $in: studentIds } })
      .select({ _id: 1, fullName: 1 })
      .lean();
    return new Map(
      students.map((student) => [student._id.toString(), student.fullName]),
    );
  }

  private async getGradeMap(gradeIds: string[]) {
    if (gradeIds.length === 0) {
      return new Map<string, GradeDocument>();
    }
    const grades = await this.gradeModel
      .find({ _id: { $in: gradeIds } })
      .lean();
    return new Map(grades.map((grade) => [grade._id.toString(), grade]));
  }

  private validateCreateAssignmentInput(input: CreateAssignmentInput) {
    if (!input.title?.trim()) {
      throw new BadRequestException('title is required.');
    }

    if (!Number.isFinite(input.totalMarks) || input.totalMarks < 0) {
      throw new BadRequestException('totalMarks must be a number >= 0.');
    }

    if (
      input.solutionCount !== undefined &&
      (!Number.isInteger(input.solutionCount) || input.solutionCount < 0)
    ) {
      throw new BadRequestException('solutionCount must be an integer >= 0.');
    }

    if (input.dueAt && Number.isNaN(new Date(input.dueAt).getTime())) {
      throw new BadRequestException('dueAt must be a valid ISO date string.');
    }

    if (input.synonymsMap) {
      for (const [key, value] of Object.entries(input.synonymsMap)) {
        if (!key.trim()) {
          throw new BadRequestException(
            'synonymsMap keys must be non-empty strings.',
          );
        }

        if (!Array.isArray(value) || value.some((item) => !item?.trim())) {
          throw new BadRequestException(
            'synonymsMap values must be arrays of non-empty strings.',
          );
        }
      }
    }
  }

  private normalizeSynonymsMap(input?: Record<string, string[]>) {
    if (!input) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key.trim(),
        value.map((item) => item.trim()),
      ]),
    );
  }

  private normalizeAndValidateSolutionMimeType(file: UploadedSolutionFile) {
    const mimeType = file.mimetype?.toLowerCase();
    const fileName = file.originalname?.toLowerCase() ?? '';

    const allowedMimeTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/xml',
      'text/xml',
    ]);

    if (allowedMimeTypes.has(mimeType)) {
      return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    }

    if (fileName.endsWith('.xml')) {
      return 'application/xml';
    }

    throw new BadRequestException(
      'Solution files must be PNG, JPEG, or XML.',
    );
  }

  private fileBufferToDataUrl(buffer: Buffer, mimeType: string) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private getTeacherObjectId(user?: RequestUser) {
    if (!user?.id) {
      throw new UnauthorizedException('User is not authenticated.');
    }
    if (user.role !== 'teacher') {
      throw new ForbiddenException('Teacher role is required.');
    }
    return new Types.ObjectId(user.id);
  }

  private toObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }
    return new Types.ObjectId(value);
  }
}
