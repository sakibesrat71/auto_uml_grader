import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StudentService } from './student.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    fullName: string;
  };
}

interface CreateSubmissionBody {
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  imageDataUrl: string;
}

@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('dashboard/summary')
  summary(@Req() request: AuthenticatedRequest) {
    return this.studentService.getDashboardSummary(request.user);
  }

  @Get('assignments')
  assignments(@Req() request: AuthenticatedRequest) {
    return this.studentService.getAssignments(request.user);
  }

  @Get('grades/recent')
  recentGrades(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.studentService.getRecentGrades(
      request.user,
      Number(limit ?? 5),
    );
  }

  @Get('assignments/:assignmentId')
  assignmentDetail(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.studentService.getAssignmentDetail(request.user, assignmentId);
  }

  @Post('assignments/:assignmentId/submissions')
  createSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Body() body: CreateSubmissionBody,
  ) {
    return this.studentService.createSubmission(
      request.user,
      assignmentId,
      body,
    );
  }

  @Get('submissions/:submissionId')
  submissionDetail(
    @Req() request: AuthenticatedRequest,
    @Param('submissionId') submissionId: string,
  ) {
    return this.studentService.getSubmissionDetail(request.user, submissionId);
  }
}
