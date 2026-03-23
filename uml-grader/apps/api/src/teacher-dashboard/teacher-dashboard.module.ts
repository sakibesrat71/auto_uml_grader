import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Assignment,
  AssignmentSchema,
  Grade,
  GradeSchema,
  Solution,
  SolutionSchema,
  Submission,
  SubmissionSchema,
  User,
  UserSchema,
} from '../schemas/entities.schema';
import { TeacherAssignmentsController } from './teacher-assignments.controller';
import { TeacherAssignmentsService } from './teacher-assignments.service';
import { TeacherDashboardController } from './teacher-dashboard.controller';
import { TeacherDashboardService } from './teacher-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Solution.name, schema: SolutionSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TeacherDashboardController, TeacherAssignmentsController],
  providers: [TeacherDashboardService, TeacherAssignmentsService],
})
export class TeacherDashboardModule {}
