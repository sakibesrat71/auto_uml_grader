import {
  ForbiddenException,
  Injectable,
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
  User,
  UserDocument,
} from '../schemas/entities.schema';

interface RequestUser {
  id: string;
  role: string;
  email: string;
  fullName: string;
}

type NeedsReviewReason =
  | 'low confidence'
  | 'failed extraction'
  | 'manual review recommended'
  | 'parse failed'
  | 'review required';

@Injectable()
export class TeacherDashboardService {
  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getQuickStats(user?: RequestUser) {
    const teacherId = this.getTeacherObjectId(user);
    const assignmentIds = await this.getTeacherAssignmentIds(teacherId);
    if (assignmentIds.length === 0) {
      return {
        totalAssignments: 0,
        totalSubmissions: 0,
        needsReview: 0,
        ungradedOrProcessing: 0,
      };
    }

    const [
      totalAssignments,
      totalSubmissions,
      flaggedSubmissionIds,
      processingCount,
    ] = await Promise.all([
      this.assignmentModel.countDocuments({ teacherId }),
      this.submissionModel.countDocuments({
        assignmentId: { $in: assignmentIds },
      }),
      this.getFlaggedSubmissionIdSet(assignmentIds),
      this.submissionModel.countDocuments({
        assignmentId: { $in: assignmentIds },
        status: { $in: ['queued', 'processing'] },
      }),
    ]);

    return {
      totalAssignments,
      totalSubmissions,
      needsReview: flaggedSubmissionIds.size,
      ungradedOrProcessing: processingCount,
    };
  }

  async getAssignmentsTable(user?: RequestUser) {
    const teacherId = this.getTeacherObjectId(user);
    const assignments = await this.assignmentModel
      .find({ teacherId })
      .sort({ createdAt: -1 })
      .lean();

    if (assignments.length === 0) {
      return [];
    }

    const rows = await Promise.all(
      assignments.map(async (assignment) => {
        const assignmentId = assignment._id;
        const [submissionsTotal, gradedCount, flaggedSubmissionIds] =
          await Promise.all([
            this.submissionModel.countDocuments({ assignmentId }),
            this.submissionModel.countDocuments({
              assignmentId,
              latestGradeId: { $exists: true, $ne: null },
            }),
            this.getFlaggedSubmissionIdSet([assignmentId]),
          ]);

        return {
          assignmentId: assignment._id,
          title: assignment.title,
          dueDate: assignment.dueAt ?? null,
          dueDateLabel: assignment.dueAt
            ? assignment.dueAt.toISOString()
            : 'No due date',
          solutionsUploaded: `${assignment.solutionCount ?? 0}/4`,
          submissionsTotal,
          gradedCount,
          needsReviewCount: flaggedSubmissionIds.size,
          status: this.getAssignmentStatus(
            assignment.isPublished,
            assignment.dueAt,
          ),
          actions: ['View', 'Edit', 'Upload solutions', 'Release grades'],
        };
      }),
    );

    return rows;
  }

  getActionShortcuts() {
    return [
      { label: 'Create Assignment', key: 'create-assignment' },
      { label: 'Upload Solutions', key: 'upload-solutions' },
      { label: 'View Needs Review', key: 'view-needs-review' },
      { label: 'Export CSV', key: 'export-csv' },
    ];
  }

  async getNeedsReviewQueue(user?: RequestUser, limit = 10) {
    const teacherId = this.getTeacherObjectId(user);
    const assignmentIds = await this.getTeacherAssignmentIds(teacherId);
    if (assignmentIds.length === 0) {
      return [];
    }

    const cappedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 10)
      : 10;

    const flaggedIds = await this.getFlaggedSubmissionIdSet(assignmentIds);
    if (flaggedIds.size === 0) {
      return [];
    }

    const ids = Array.from(flaggedIds).map((id) => new Types.ObjectId(id));
    const submissions = await this.submissionModel
      .find({ _id: { $in: ids } })
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(cappedLimit)
      .lean();

    const assignmentIdSet = new Set(
      submissions.map((item) => item.assignmentId.toString()),
    );
    const studentIdSet = new Set(
      submissions.map((item) => item.studentId.toString()),
    );
    const gradeIdSet = new Set(
      submissions
        .map((item) => item.latestGradeId?.toString())
        .filter((value): value is string => Boolean(value)),
    );

    const [assignmentMap, studentMap, gradeMap] = await Promise.all([
      this.getAssignmentMap(Array.from(assignmentIdSet)),
      this.getStudentMap(Array.from(studentIdSet)),
      this.getGradeMap(Array.from(gradeIdSet)),
    ]);

    return submissions.map((submission) => {
      const grade = submission.latestGradeId
        ? gradeMap.get(submission.latestGradeId.toString())
        : undefined;
      return {
        submissionId: submission._id,
        studentName:
          studentMap.get(submission.studentId.toString()) ?? 'Unknown Student',
        assignmentName:
          assignmentMap.get(submission.assignmentId.toString()) ??
          'Unknown Assignment',
        flagReason: this.pickNeedsReviewReason(submission, grade),
        submittedAt: submission.submittedAt ?? submission.createdAt,
        action: 'Review',
      };
    });
  }

  async getRecentActivity(user?: RequestUser, limit = 10) {
    const teacherId = this.getTeacherObjectId(user);
    const assignmentIds = await this.getTeacherAssignmentIds(teacherId);
    if (assignmentIds.length === 0) {
      return [];
    }

    const cappedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 20)
      : 10;

    const [recentSubmissions, recentGrades, assignmentMap, studentMap] =
      await Promise.all([
        this.submissionModel
          .find({ assignmentId: { $in: assignmentIds } })
          .sort({ createdAt: -1 })
          .limit(cappedLimit)
          .lean(),
        this.gradeModel
          .find({ assignmentId: { $in: assignmentIds } })
          .sort({ createdAt: -1 })
          .limit(cappedLimit)
          .lean(),
        this.getAssignmentMap(assignmentIds.map((id) => id.toString())),
        this.getStudentMapFromAssignments(assignmentIds),
      ]);

    const submissionEvents = recentSubmissions.map((item) => ({
      type: 'submission',
      occurredAt: item.createdAt,
      message: `${studentMap.get(item.studentId.toString()) ?? 'Student'} submitted ${assignmentMap.get(item.assignmentId.toString()) ?? 'an assignment'}`,
    }));

    const gradeEvents = recentGrades.map((item) => ({
      type: 'grade',
      occurredAt: item.createdAt,
      message: `Graded submission for ${assignmentMap.get(item.assignmentId.toString()) ?? 'an assignment'} (${item.score}/${item.maxScore})`,
    }));

    return [...submissionEvents, ...gradeEvents]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, cappedLimit);
  }

  private getTeacherObjectId(user?: RequestUser): Types.ObjectId {
    if (!user?.id) {
      throw new UnauthorizedException('User is not authenticated.');
    }
    if (user.role !== 'teacher') {
      throw new ForbiddenException('Teacher role is required.');
    }
    return new Types.ObjectId(user.id);
  }

  private async getTeacherAssignmentIds(teacherId: Types.ObjectId) {
    const assignments = await this.assignmentModel
      .find({ teacherId })
      .select('_id')
      .lean();
    return assignments.map((item) => item._id);
  }

  private async getFlaggedSubmissionIdSet(assignmentIds: Types.ObjectId[]) {
    const [submissionIds, gradeSubmissionIds] = await Promise.all([
      this.submissionModel.distinct('_id', {
        assignmentId: { $in: assignmentIds },
        $or: [
          { extractionError: { $exists: true, $nin: [null, ''] } },
          { status: { $in: ['failed', 'parse_failed', 'unreadable'] } },
        ],
      }),
      this.gradeModel.distinct('submissionId', {
        assignmentId: { $in: assignmentIds },
        $or: [
          { 'flags.lowConfidence': true },
          { 'flags.extractionIssues': true },
          { 'flags.manualReviewRecommended': true },
        ],
      }),
    ]);

    return new Set(
      [...submissionIds, ...gradeSubmissionIds].map((id) => id.toString()),
    );
  }

  private getAssignmentStatus(isPublished: boolean, dueAt?: Date | null) {
    if (!isPublished) {
      return 'Draft';
    }
    if (dueAt && dueAt.getTime() < Date.now()) {
      return 'Closed';
    }
    return 'Published';
  }

  private async getAssignmentMap(assignmentIds: string[]) {
    if (assignmentIds.length === 0) {
      return new Map<string, string>();
    }
    const assignments = await this.assignmentModel
      .find({ _id: { $in: assignmentIds } })
      .select({ _id: 1, title: 1 })
      .lean();
    return new Map(
      assignments.map((item) => [item._id.toString(), item.title]),
    );
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
      students.map((item) => [item._id.toString(), item.fullName]),
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

  private pickNeedsReviewReason(
    submission: SubmissionDocument,
    grade?: GradeDocument,
  ): NeedsReviewReason {
    if (submission.extractionError) {
      return 'parse failed';
    }
    if (grade?.flags?.lowConfidence) {
      return 'low confidence';
    }
    if (grade?.flags?.extractionIssues) {
      return 'failed extraction';
    }
    if (grade?.flags?.manualReviewRecommended) {
      return 'manual review recommended';
    }
    return 'review required';
  }

  private async getStudentMapFromAssignments(assignmentIds: Types.ObjectId[]) {
    const studentIds = await this.submissionModel.distinct('studentId', {
      assignmentId: { $in: assignmentIds },
    });
    return this.getStudentMap(studentIds.map((id) => id.toString()));
  }
}
