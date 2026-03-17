import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TeacherDashboardService } from './teacher-dashboard.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    fullName: string;
  };
}

@Controller('teacher/dashboard')
export class TeacherDashboardController {
  constructor(
    private readonly teacherDashboardService: TeacherDashboardService,
  ) {}

  @Get('quick-stats')
  quickStats(@Req() request: AuthenticatedRequest) {
    return this.teacherDashboardService.getQuickStats(request.user);
  }

  @Get('assignments')
  assignments(@Req() request: AuthenticatedRequest) {
    return this.teacherDashboardService.getAssignmentsTable(request.user);
  }

  @Get('action-shortcuts')
  actionShortcuts() {
    return this.teacherDashboardService.getActionShortcuts();
  }

  @Get('needs-review-queue')
  needsReviewQueue(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.teacherDashboardService.getNeedsReviewQueue(
      request.user,
      Number(limit ?? 10),
    );
  }

  @Get('recent-activity')
  recentActivity(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.teacherDashboardService.getRecentActivity(
      request.user,
      Number(limit ?? 10),
    );
  }
}
