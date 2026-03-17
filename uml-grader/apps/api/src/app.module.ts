import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { resolve } from 'path';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StudentModule } from './student/student.module';
import { TeacherDashboardModule } from './teacher-dashboard/teacher-dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env',
        'apps/api/.env',
        'uml-grader/apps/api/.env',
        resolve(process.cwd(), 'uml-grader/apps/api/.env'),
      ],
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/auto_uml_grader',
    ),
    AuthModule,
    StudentModule,
    TeacherDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
