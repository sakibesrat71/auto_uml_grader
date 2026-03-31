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
  Submission,
  SubmissionDocument,
} from '../schemas/entities.schema';

interface RequestUser {
  id: string;
  role: string;
  email: string;
  fullName: string;
}

interface CreateSubmissionInput {
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  imageDataUrl: string;
}

type StudentSubmissionStatus =
  | 'none'
  | 'submitted'
  | 'processing'
  | 'graded'
  | 'failed';

export interface AssignmentWithLatest {
  assignmentId: string;
  title: string;
  totalMarks: number;
  dueAt: string | null;
  dueLabel: string;
  dueRelativeLabel: string;
  isClosed: boolean;
  isOverdue: boolean;
  canSubmit: boolean;
  needsAction: boolean;
  canResubmit: boolean;
  submission: {
    submissionId: string | null;
    status: StudentSubmissionStatus;
    submittedAt: string | null;
  };
  grade: {
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    flags: string[];
    updatedAt: string | null;
  } | null;
}

@Injectable()
export class StudentService {
  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
  ) {}

  async getDashboardSummary(user?: RequestUser) {
    const studentId = this.getStudentObjectId(user);
    const assignmentViews = await this.getAssignmentViews(studentId);
    const now = Date.now();

    const nextDue = assignmentViews.find(
      (item) => item.dueAt && new Date(item.dueAt).getTime() >= now,
    );

    const alerts = assignmentViews
      .flatMap((item) => this.buildAlertsForAssignment(item))
      .slice(0, 5);

    return {
      assignmentCount: assignmentViews.length,
      submittedCount: assignmentViews.filter(
        (item) => item.submission.status !== 'none',
      ).length,
      gradedCount: assignmentViews.filter(
        (item) => item.submission.status === 'graded',
      ).length,
      needsActionCount: assignmentViews.filter((item) => item.needsAction)
        .length,
      nextDueAssignment: nextDue
        ? {
            assignmentId: nextDue.assignmentId,
            title: nextDue.title,
            dueAt: nextDue.dueAt,
            dueLabel: nextDue.dueLabel,
            dueRelativeLabel: nextDue.dueRelativeLabel,
            status: nextDue.submission.status,
            submissionId: nextDue.submission.submissionId,
            grade: nextDue.grade,
          }
        : null,
      alerts,
    };
  }

  async getAssignments(user?: RequestUser) {
    const studentId = this.getStudentObjectId(user);
    return this.getAssignmentViews(studentId);
  }

  async getRecentGrades(user?: RequestUser, limit = 5) {
    const studentId = this.getStudentObjectId(user);
    const cappedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 10)
      : 5;

    const grades = await this.gradeModel
      .find({ studentId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(cappedLimit)
      .lean();

    if (grades.length === 0) {
      return [];
    }

    const assignmentIds = Array.from(
      new Set(grades.map((item) => item.assignmentId.toString())),
    );
    const submissionIds = Array.from(
      new Set(grades.map((item) => item.submissionId.toString())),
    );

    const [assignmentMap, submissionMap] = await Promise.all([
      this.getAssignmentMap(assignmentIds),
      this.getSubmissionMap(submissionIds),
    ]);

    return grades.map((grade) => ({
      gradeId: grade._id.toString(),
      assignmentId: grade.assignmentId.toString(),
      submissionId: grade.submissionId.toString(),
      title:
        assignmentMap.get(grade.assignmentId.toString())?.title ?? 'Assignment',
      score: grade.score,
      maxScore: grade.maxScore,
      percentage: grade.percentage,
      updatedAt: (grade.updatedAt ?? grade.createdAt).toISOString(),
      flags: this.extractFlags(grade),
      submittedAt:
        submissionMap
          .get(grade.submissionId.toString())
          ?.submittedAt?.toISOString() ?? null,
    }));
  }

  async getAssignmentDetail(user: RequestUser | undefined, assignmentId: string) {
    const studentId = this.getStudentObjectId(user);
    const assignment = await this.assignmentModel.findOne({
      _id: this.toObjectId(assignmentId, 'assignmentId'),
      isPublished: true,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    const submissions = await this.submissionModel
      .find({ assignmentId: assignment._id, studentId })
      .sort({ createdAt: -1, submittedAt: -1 })
      .lean();
    const latestSubmission = submissions[0] ?? null;
    const gradeIds = Array.from(
      new Set(
        submissions
          .map((item) => item.latestGradeId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const gradeMap = await this.getGradeMap(gradeIds);
    const grade = latestSubmission?.latestGradeId
      ? gradeMap.get(latestSubmission.latestGradeId.toString()) ?? null
      : null;

    const mappedStatus = this.mapSubmissionStatus(
      latestSubmission?.status,
      Boolean(grade),
    );
    const isClosed = this.isAssignmentClosed(assignment.dueAt);
    const canSubmitNow =
      !isClosed && (mappedStatus === 'none' || mappedStatus === 'failed');
    const attemptRows = submissions.map((submission, index) => {
      const submissionGrade = submission.latestGradeId
        ? gradeMap.get(submission.latestGradeId.toString())
        : undefined;
      const automaticScore = submissionGrade ? submissionGrade.score : null;
      const finalScore =
        submissionGrade?.teacherOverride?.isOverridden &&
        typeof submissionGrade.teacherOverride.finalScore === 'number'
          ? submissionGrade.teacherOverride.finalScore
          : automaticScore;

      return {
        attemptNumber: submissions.length - index,
        submissionId: submission._id.toString(),
        submittedAt: (
          submission.submittedAt ?? submission.createdAt
        ).toISOString(),
        status: this.mapSubmissionStatus(
          submission.status,
          Boolean(submissionGrade),
        ),
        autoMark: automaticScore,
        finalMark: finalScore,
        feedbackAvailable: Boolean(
          submissionGrade?.discrepancies?.length ||
            submissionGrade?.rubricBreakdown?.length ||
            submissionGrade?.teacherOverride?.comment,
        ),
      };
    });
    const latestAutomaticMark = grade ? grade.score : null;
    const bestMark = attemptRows
      .map((item) => item.finalMark)
      .filter((value): value is number => typeof value === 'number');

    return {
      assignmentId: assignment._id.toString(),
      title: assignment.title,
      courseName: 'UML Grading',
      description: assignment.description ?? '',
      instructions: [
        'Submit a UML diagram image for automated grading against the reference solutions.',
        'Make sure classes, attributes, methods, and relationships match the expected task.',
      ],
      requiredDiagramType: 'UML class diagram',
      submissionFormatRules: ['PNG and JPEG only', 'One image per submission'],
      namingGuidance:
        'Use clear and consistent class, method, and attribute names to match the expected structure.',
      markingNote:
        'Your diagram will be automatically compared with reference UML solutions.',
      totalMarks: assignment.totalMarks,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      dueLabel: this.formatDueLabel(assignment.dueAt),
      dueRelativeLabel: this.formatRelativeDueLabel(assignment.dueAt),
      isClosed,
      isOverdue: isClosed,
      timeRemainingLabel: this.formatRelativeDueLabel(assignment.dueAt),
      attemptRule:
        'Single attempt unless grading fails and you are prompted to resubmit.',
      submission: latestSubmission
        ? {
            submissionId: latestSubmission._id.toString(),
            status: mappedStatus,
            submittedAt: (
              latestSubmission.submittedAt ?? latestSubmission.createdAt
            ).toISOString(),
            imageUrl: latestSubmission.imageUrl,
            originalFileName: latestSubmission.originalFileName,
            mimeType: latestSubmission.mimeType,
            fileSizeBytes: latestSubmission.fileSizeBytes,
            extractionError: latestSubmission.extractionError ?? null,
          }
        : null,
      grade: grade
        ? {
            gradeId: grade._id.toString(),
            score: grade.score,
            maxScore: grade.maxScore,
            percentage: grade.percentage,
            breakdown: grade.rubricBreakdown ?? [],
            discrepancies: grade.discrepancies ?? [],
            flags: this.extractFlags(grade),
            updatedAt: (grade.updatedAt ?? grade.createdAt).toISOString(),
            teacherFinalScore:
              grade.teacherOverride?.isOverridden &&
              typeof grade.teacherOverride.finalScore === 'number'
                ? grade.teacherOverride.finalScore
                : null,
            teacherComment: grade.teacherOverride?.comment ?? null,
            chosenSolutionLabel: grade.chosenSolutionLabel ?? null,
            confidenceScore:
              typeof latestSubmission?.extractedUmlJson?.extractionMeta
                ?.confidence === 'number'
                ? Number(
                    (
                      latestSubmission.extractedUmlJson.extractionMeta
                        .confidence * 100
                    ).toFixed(1),
                  )
                : null,
          }
        : null,
      canSubmit: canSubmitNow,
      canResubmit: mappedStatus === 'failed',
      attemptsUsed: submissions.length,
      attemptsRemaining: canSubmitNow ? 1 : 0,
      attemptsHistory: attemptRows,
      summary: {
        currentStatus: this.formatStatusLabel(mappedStatus),
        lastSubmissionTime: latestSubmission
          ? (latestSubmission.submittedAt ?? latestSubmission.createdAt).toISOString()
          : null,
        bestMark: bestMark.length ? Math.max(...bestMark) : null,
        latestMark: latestAutomaticMark,
        finalMark:
          grade?.teacherOverride?.isOverridden &&
          typeof grade.teacherOverride.finalScore === 'number'
            ? grade.teacherOverride.finalScore
            : latestAutomaticMark,
        finalMarkShown: Boolean(grade),
        lateStatus: isClosed ? 'Closed / overdue' : 'On time',
      },
      latestResult: {
        gradingStatus:
          grade?.flags?.manualReviewRecommended || grade?.flags?.lowConfidence
            ? 'Needs review'
            : this.formatStatusLabel(mappedStatus),
        automatedMark: latestAutomaticMark,
        finalTeacherMark:
          grade?.teacherOverride?.isOverridden &&
          typeof grade.teacherOverride.finalScore === 'number'
            ? grade.teacherOverride.finalScore
            : null,
        bestMatchedSolutionLabel: grade?.chosenSolutionLabel ?? 'Not available',
        shortFeedbackSummary: this.buildShortFeedbackSummary(grade),
        confidenceScore:
          typeof latestSubmission?.extractedUmlJson?.extractionMeta
            ?.confidence === 'number'
            ? Number(
                (
                  latestSubmission.extractedUmlJson.extractionMeta.confidence *
                  100
                ).toFixed(1),
              )
            : null,
      },
      feedback: this.buildStudentFeedback(grade),
    };
  }

  async createSubmission(
    user: RequestUser | undefined,
    assignmentId: string,
    input: CreateSubmissionInput,
  ) {
    const studentId = this.getStudentObjectId(user);
    const assignment = await this.assignmentModel.findOne({
      _id: this.toObjectId(assignmentId, 'assignmentId'),
      isPublished: true,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    this.validateSubmissionInput(input);

    const latestSubmission = await this.submissionModel
      .findOne({ assignmentId: assignment._id, studentId })
      .sort({ createdAt: -1, submittedAt: -1 })
      .lean();

    const latestStatus = this.mapSubmissionStatus(
      latestSubmission?.status,
      Boolean(latestSubmission?.latestGradeId),
    );

    if (this.isAssignmentClosed(assignment.dueAt)) {
      throw new ForbiddenException(
        'This assignment is closed and can no longer accept submissions.',
      );
    }

    if (latestStatus !== 'none' && latestStatus !== 'failed') {
      throw new ForbiddenException(
        'Resubmission is only available when grading has failed.',
      );
    }

    const now = new Date();
    const created = await this.submissionModel.create({
      assignmentId: assignment._id,
      studentId,
      originalFileName: input.originalFileName.trim(),
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      imageUrl: input.imageDataUrl,
      imageStorageKey: `inline:${assignment._id.toString()}:${studentId.toString()}:${now.getTime()}`,
      status: 'submitted',
      submittedAt: now,
    });

    return {
      message: 'Submission uploaded successfully.',
      submissionId: created._id.toString(),
      status: 'submitted',
      submittedAt: (created.submittedAt ?? created.createdAt).toISOString(),
    };
  }

  async getSubmissionDetail(user: RequestUser | undefined, submissionId: string) {
    const studentId = this.getStudentObjectId(user);
    const submission = await this.submissionModel
      .findOne({
        _id: this.toObjectId(submissionId, 'submissionId'),
        studentId,
      })
      .lean();

    if (!submission) {
      throw new NotFoundException('Submission not found.');
    }

    const [assignment, grade] = await Promise.all([
      this.assignmentModel.findById(submission.assignmentId).lean(),
      submission.latestGradeId
        ? this.gradeModel.findById(submission.latestGradeId).lean()
        : Promise.resolve(null),
    ]);

    const mappedStatus = this.mapSubmissionStatus(
      submission.status,
      Boolean(grade),
    );

    return {
      submissionId: submission._id.toString(),
      assignment: assignment
        ? {
            assignmentId: assignment._id.toString(),
            title: assignment.title,
            totalMarks: assignment.totalMarks,
            dueAt: assignment.dueAt?.toISOString() ?? null,
            dueLabel: this.formatDueLabel(assignment.dueAt),
          }
        : null,
      status: mappedStatus,
      submittedAt: (
        submission.submittedAt ?? submission.createdAt
      ).toISOString(),
      createdAt: submission.createdAt.toISOString(),
      imageUrl: submission.imageUrl,
      originalFileName: submission.originalFileName,
      mimeType: submission.mimeType,
      fileSizeBytes: submission.fileSizeBytes,
      extractionError: submission.extractionError ?? null,
      grade: grade
        ? {
            gradeId: grade._id.toString(),
            score: grade.score,
            maxScore: grade.maxScore,
            percentage: grade.percentage,
            breakdown: grade.rubricBreakdown ?? [],
            discrepancies: grade.discrepancies ?? [],
            flags: this.extractFlags(grade),
            updatedAt: (grade.updatedAt ?? grade.createdAt).toISOString(),
          }
        : null,
    };
  }

  private async getAssignmentViews(
    studentId: Types.ObjectId,
  ): Promise<AssignmentWithLatest[]> {
    const assignments = await this.assignmentModel
      .find({ isPublished: true })
      .sort({ dueAt: 1, createdAt: -1 })
      .lean();

    if (assignments.length === 0) {
      return [];
    }

    const submissions = await this.submissionModel
      .find({
        studentId,
        assignmentId: { $in: assignments.map((item) => item._id) },
      })
      .sort({ createdAt: -1, submittedAt: -1 })
      .lean();

    const latestSubmissionByAssignment = new Map<string, SubmissionDocument>();
    for (const submission of submissions) {
      const key = submission.assignmentId.toString();
      if (!latestSubmissionByAssignment.has(key)) {
        latestSubmissionByAssignment.set(key, submission);
      }
    }

    const gradeIds = Array.from(
      new Set(
        Array.from(latestSubmissionByAssignment.values())
          .map((item) => item.latestGradeId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const gradeMap = await this.getGradeMap(gradeIds);

    const rows = assignments.map((assignment) =>
      this.buildAssignmentView(
        assignment,
        latestSubmissionByAssignment.get(assignment._id.toString()),
        gradeMap,
      ),
    );

    return rows.sort((left, right) => this.compareAssignmentViews(left, right));
  }

  private buildAssignmentView(
    assignment: AssignmentDocument,
    submission: SubmissionDocument | undefined,
    gradeMap: Map<string, GradeDocument>,
  ): AssignmentWithLatest {
    const grade = submission?.latestGradeId
      ? gradeMap.get(submission.latestGradeId.toString())
      : undefined;
    const status = this.mapSubmissionStatus(submission?.status, Boolean(grade));
    const flags = grade ? this.extractFlags(grade) : [];
    const needsAction = this.isNeedsAction(assignment.dueAt, status);

    return {
      assignmentId: assignment._id.toString(),
      title: assignment.title,
      totalMarks: assignment.totalMarks,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      dueLabel: this.formatDueLabel(assignment.dueAt),
      dueRelativeLabel: this.formatRelativeDueLabel(assignment.dueAt),
      isClosed: this.isAssignmentClosed(assignment.dueAt),
      isOverdue: this.isAssignmentClosed(assignment.dueAt),
      canSubmit:
        !this.isAssignmentClosed(assignment.dueAt) &&
        (status === 'none' || status === 'failed'),
      needsAction,
      canResubmit: status === 'failed',
      submission: {
        submissionId: submission?._id.toString() ?? null,
        status,
        submittedAt: submission
          ? (submission.submittedAt ?? submission.createdAt).toISOString()
          : null,
      },
      grade: grade
        ? {
            score: grade.score,
            maxScore: grade.maxScore,
            percentage: grade.percentage,
            flags,
            updatedAt: (grade.updatedAt ?? grade.createdAt).toISOString(),
          }
        : null,
    };
  }

  private compareAssignmentViews(
    left: AssignmentWithLatest,
    right: AssignmentWithLatest,
  ): number {
    if (left.needsAction !== right.needsAction) {
      return left.needsAction ? -1 : 1;
    }

    const leftDue = left.dueAt
      ? new Date(left.dueAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt
      ? new Date(right.dueAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return left.title.localeCompare(right.title);
  }

  private buildAlertsForAssignment(item: AssignmentWithLatest) {
    const alerts: {
      id: string;
      type: 'error' | 'warning' | 'info';
      message: string;
      assignmentId: string;
      submissionId: string | null;
    }[] = [];

    if (item.submission.status === 'failed') {
      alerts.push({
        id: `${item.assignmentId}-failed`,
        type: 'error',
        message: 'Your submission failed grading. Please resubmit.',
        assignmentId: item.assignmentId,
        submissionId: item.submission.submissionId,
      });
    }

    if (item.grade?.flags.includes('Low confidence grade')) {
      alerts.push({
        id: `${item.assignmentId}-low-confidence`,
        type: 'warning',
        message: 'Low confidence grade. Teacher review is pending.',
        assignmentId: item.assignmentId,
        submissionId: item.submission.submissionId,
      });
    }

    if (
      item.submission.status === 'none' &&
      item.dueAt &&
      this.hoursUntil(new Date(item.dueAt)) <= 24 &&
      this.hoursUntil(new Date(item.dueAt)) >= 0
    ) {
      alerts.push({
        id: `${item.assignmentId}-due-soon`,
        type: 'info',
        message: 'Due within 24 hours and not submitted.',
        assignmentId: item.assignmentId,
        submissionId: null,
      });
    }

    return alerts;
  }

  private isNeedsAction(
    dueAt: Date | undefined | null,
    status: StudentSubmissionStatus,
  ) {
    if (status === 'failed') {
      return true;
    }
    if (status !== 'none' || !dueAt) {
      return false;
    }
    const hours = this.hoursUntil(dueAt);
    return hours >= 0 && hours <= 72;
  }

  private isAssignmentClosed(dueAt: Date | undefined | null) {
    if (!dueAt) {
      return false;
    }
    return dueAt.getTime() < Date.now();
  }

  private mapSubmissionStatus(
    rawStatus?: string,
    hasGrade?: boolean,
  ): StudentSubmissionStatus {
    if (!rawStatus) {
      return 'none';
    }
    if (hasGrade || rawStatus === 'graded') {
      return 'graded';
    }
    if (['processing', 'queued'].includes(rawStatus)) {
      return 'processing';
    }
    if (['failed', 'parse_failed', 'unreadable'].includes(rawStatus)) {
      return 'failed';
    }
    return 'submitted';
  }

  private extractFlags(grade: GradeDocument): string[] {
    const flags: string[] = [];
    if (grade.flags?.lowConfidence) {
      flags.push('Low confidence grade');
    }
    if (grade.flags?.extractionIssues) {
      flags.push('Extraction issues');
    }
    if (grade.flags?.manualReviewRecommended) {
      flags.push('Teacher review pending');
    }
    if (grade.flags?.invalidJsonRecovered) {
      flags.push('Recovered invalid JSON');
    }
    return [...flags, ...(grade.flags?.notes ?? [])];
  }

  private buildShortFeedbackSummary(grade?: GradeDocument | null) {
    if (!grade) {
      return 'Grading has not been completed yet.';
    }

    const discrepancies = grade.discrepancies ?? [];
    if (discrepancies.length === 0) {
      return 'Your latest diagram closely matches the expected reference structure.';
    }

    const missingCount = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('missing'),
    ).length;
    const relationshipCount = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('relationship'),
    ).length;
    const namingCount = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('name'),
    ).length;

    return [
      missingCount ? `Missing ${missingCount} expected classes or members.` : null,
      relationshipCount
        ? `${relationshipCount} relationship differences were detected.`
        : null,
      namingCount ? `${namingCount} naming mismatches were found.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
  }

  private buildStudentFeedback(grade?: GradeDocument | null) {
    const discrepancies = grade?.discrepancies ?? [];
    const missingComponents = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('missing'),
    );
    const incorrectRelationships = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('relationship'),
    );
    const namingIssues = discrepancies.filter((item) =>
      `${item.category} ${item.message}`.toLowerCase().includes('name'),
    );

    return {
      teacherFeedback: grade?.teacherOverride?.comment ?? null,
      autoGeneratedFeedbackSummary: this.buildShortFeedbackSummary(grade),
      strengthsDetected:
        (grade?.rubricBreakdown ?? [])
          .filter((item) => item.awardedMarks >= item.maxMarks && item.maxMarks > 0)
          .map((item) => `${item.label} matched the expected structure`)
          .slice(0, 3),
      missingComponents: missingComponents.map((item) => item.message),
      incorrectRelationships: incorrectRelationships.map((item) => item.message),
      namingIssues: namingIssues.map((item) => item.message),
      suggestions: [
        missingComponents.length
          ? `Missing ${missingComponents.length} expected classes or members.`
          : 'Most expected classes and members were detected.',
        incorrectRelationships.length
          ? 'Some class relationships do not match the expected structure.'
          : 'Relationships are mostly aligned with the expected structure.',
        namingIssues.length
          ? 'Several names differ from the expected diagram.'
          : 'Naming is mostly aligned with the expected diagram.',
      ],
    };
  }

  private formatStatusLabel(status: StudentSubmissionStatus) {
    switch (status) {
      case 'none':
        return 'Not submitted';
      case 'submitted':
        return 'Submitted';
      case 'processing':
        return 'Processing';
      case 'graded':
        return 'Graded';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  }

  private formatDueLabel(dueAt?: Date | null) {
    return dueAt ? dueAt.toISOString() : 'No due date';
  }

  private formatRelativeDueLabel(dueAt?: Date | null) {
    if (!dueAt) {
      return 'No due date';
    }

    const diffMs = dueAt.getTime() - Date.now();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours < 0) {
      const overdueHours = Math.abs(diffHours);
      if (overdueHours < 24) {
        return `Overdue by ${overdueHours}h`;
      }
      return `Overdue by ${Math.round(overdueHours / 24)}d`;
    }

    if (diffHours < 24) {
      return `Due in ${diffHours}h`;
    }

    return `Due in ${Math.round(diffHours / 24)}d`;
  }

  private hoursUntil(date: Date) {
    return (date.getTime() - Date.now()) / (1000 * 60 * 60);
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

  private async getAssignmentMap(assignmentIds: string[]) {
    if (assignmentIds.length === 0) {
      return new Map<string, AssignmentDocument>();
    }

    const assignments = await this.assignmentModel
      .find({ _id: { $in: assignmentIds } })
      .lean();
    return new Map(
      assignments.map((assignment) => [assignment._id.toString(), assignment]),
    );
  }

  private async getSubmissionMap(submissionIds: string[]) {
    if (submissionIds.length === 0) {
      return new Map<string, SubmissionDocument>();
    }

    const submissions = await this.submissionModel
      .find({ _id: { $in: submissionIds } })
      .lean();
    return new Map(
      submissions.map((submission) => [submission._id.toString(), submission]),
    );
  }

  private validateSubmissionInput(input: CreateSubmissionInput) {
    if (!input.originalFileName?.trim()) {
      throw new BadRequestException('originalFileName is required.');
    }

    if (!['image/png', 'image/jpeg'].includes(input.mimeType)) {
      throw new BadRequestException('Only PNG and JPEG files are supported.');
    }

    if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
      throw new BadRequestException('fileSizeBytes must be a positive number.');
    }

    if (
      !input.imageDataUrl?.startsWith(`data:${input.mimeType};base64,`) ||
      input.imageDataUrl.length < 64
    ) {
      throw new BadRequestException(
        'imageDataUrl must be a valid base64 data URL.',
      );
    }
  }

  private getStudentObjectId(user?: RequestUser) {
    if (!user?.id) {
      throw new UnauthorizedException('User is not authenticated.');
    }
    if (user.role !== 'student') {
      throw new ForbiddenException('Student role is required.');
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
