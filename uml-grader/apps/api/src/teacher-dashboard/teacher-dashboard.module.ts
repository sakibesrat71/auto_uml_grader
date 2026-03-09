import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Assignment,
  AssignmentSchema,
  Grade,
  GradeSchema,
  Submission,
  SubmissionSchema,
  User,
  UserSchema,
} from '../schemas/entities.schema';
import { TeacherDashboardController } from './teacher-dashboard.controller';
import { TeacherDashboardService } from './teacher-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TeacherDashboardController],
  providers: [TeacherDashboardService],
})
export class TeacherDashboardModule {}
