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
  Solution,
  SolutionDocument,
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

interface UploadedSolutionFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class TeacherAssignmentsService {
  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Solution.name)
    private readonly solutionModel: Model<SolutionDocument>,
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

    return {
      solutionId: solution._id.toString(),
      assignmentId: assignment._id.toString(),
      label: solution.label,
      originalFileName: solution.originalFileName,
      mimeType: solution.mimeType,
      fileSizeBytes: solution.fileSizeBytes,
      extractionStatus: solution.extractionStatus,
      uploadedBy: solution.uploadedBy.toString(),
      uploadedAt: solution.createdAt.toISOString(),
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

    if (
      input.dueAt &&
      Number.isNaN(new Date(input.dueAt).getTime())
    ) {
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
