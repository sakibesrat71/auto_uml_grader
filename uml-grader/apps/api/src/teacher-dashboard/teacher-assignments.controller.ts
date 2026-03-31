import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { TeacherAssignmentsService } from './teacher-assignments.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    fullName: string;
  };
}

interface CreateAssignmentBody {
  title: string;
  description?: string;
  totalMarks: number;
  dueAt?: string | null;
  synonymsMap?: Record<string, string[]>;
  solutionCount?: number;
  isPublished?: boolean;
}

interface UploadSolutionBody {
  label: string;
  extractionStatus?: string;
}

interface OverrideSubmissionGradeBody {
  finalScore: number;
  comment?: string;
}

interface UploadedSolutionFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('teacher/assignments')
export class TeacherAssignmentsController {
  constructor(
    private readonly teacherAssignmentsService: TeacherAssignmentsService,
  ) {}

  @Post()
  createAssignment(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateAssignmentBody,
  ) {
    return this.teacherAssignmentsService.createAssignment(request.user, body);
  }

  @Get(':assignmentId')
  getAssignmentDetail(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.teacherAssignmentsService.getAssignmentDetail(
      request.user,
      assignmentId,
    );
  }

  @Patch(':assignmentId/close')
  closeAssignment(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.teacherAssignmentsService.closeAssignment(
      request.user,
      assignmentId,
    );
  }

  @Delete(':assignmentId')
  deleteAssignment(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.teacherAssignmentsService.deleteAssignment(
      request.user,
      assignmentId,
    );
  }

  @Post(':assignmentId/solutions')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadSolution(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Body() body: UploadSolutionBody,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(png|jpg|jpeg|xml)$/i,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: 400,
        }),
    )
    file: UploadedSolutionFile,
  ) {
    return this.teacherAssignmentsService.uploadSolution(
      request.user,
      assignmentId,
      body,
      file,
    );
  }

  @Patch(':assignmentId/solutions/:solutionId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  replaceSolution(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Param('solutionId') solutionId: string,
    @Body() body: UploadSolutionBody,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(png|jpg|jpeg|xml)$/i,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: 400,
        }),
    )
    file: UploadedSolutionFile,
  ) {
    return this.teacherAssignmentsService.replaceSolution(
      request.user,
      assignmentId,
      solutionId,
      body,
      file,
    );
  }

  @Delete(':assignmentId/solutions/:solutionId')
  deleteSolution(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Param('solutionId') solutionId: string,
  ) {
    return this.teacherAssignmentsService.deleteSolution(
      request.user,
      assignmentId,
      solutionId,
    );
  }

  @Patch(':assignmentId/submissions/:submissionId/override')
  overrideSubmissionGrade(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: OverrideSubmissionGradeBody,
  ) {
    return this.teacherAssignmentsService.overrideSubmissionGrade(
      request.user,
      assignmentId,
      submissionId,
      body,
    );
  }
}
