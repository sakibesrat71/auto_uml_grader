import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  DiscrepancyItem,
  DiscrepancyItemSchema,
  ExtractedUmlJson,
  ExtractedUmlJsonSchema,
  Flags,
  FlagsSchema,
  RubricBreakdownItem,
  RubricBreakdownItemSchema,
  TeacherOverride,
  TeacherOverrideSchema,
} from './common.schema';

export type UserDocument = HydratedDocument<User>;
export type AssignmentDocument = HydratedDocument<Assignment>;
export type SolutionDocument = HydratedDocument<Solution>;
export type SubmissionDocument = HydratedDocument<Submission>;
export type GradeDocument = HydratedDocument<Grade>;
export type GraderLogDocument = HydratedDocument<GraderLog>;

@Schema({ timestamps: true })
export class User {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true })
  role!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  lastLoginAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

@Schema({ timestamps: true })
export class Assignment {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  totalMarks!: number;

  @Prop()
  dueAt?: Date;

  @Prop({ type: Map, of: [String], default: {} })
  synonymsMap!: Map<string, string[]>;

  @Prop({ default: 0, min: 0 })
  solutionCount!: number;

  @Prop({ default: false })
  isPublished!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);

@Schema({ timestamps: true })
export class Solution {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Assignment.name, required: true })
  assignmentId!: Types.ObjectId;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true, min: 0 })
  fileSizeBytes!: number;

  @Prop({ required: true })
  imageUrl!: string;

  @Prop({ required: true })
  imageStorageKey!: string;

  @Prop({ default: 'pending' })
  extractionStatus!: string;

  @Prop({ type: ExtractedUmlJsonSchema })
  extractedUmlJson?: ExtractedUmlJson;

  @Prop()
  extractionError?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  uploadedBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SolutionSchema = SchemaFactory.createForClass(Solution);

@Schema({ timestamps: true })
export class Submission {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Assignment.name, required: true })
  assignmentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true, min: 0 })
  fileSizeBytes!: number;

  @Prop({ required: true })
  imageUrl!: string;

  @Prop({ required: true })
  imageStorageKey!: string;

  @Prop({ default: 'submitted' })
  status!: string;

  @Prop()
  submittedAt?: Date;

  @Prop({ type: ExtractedUmlJsonSchema })
  extractedUmlJson?: ExtractedUmlJson;

  @Prop()
  extractionError?: string;

  @Prop({ type: Types.ObjectId, ref: 'Grade' })
  latestGradeId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);

@Schema({ timestamps: true })
export class Grade {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Submission.name, required: true })
  submissionId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Assignment.name, required: true })
  assignmentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  score!: number;

  @Prop({ required: true, min: 0 })
  maxScore!: number;

  @Prop({ required: true, min: 0, max: 100 })
  percentage!: number;

  @Prop({ type: [RubricBreakdownItemSchema], default: [] })
  rubricBreakdown!: RubricBreakdownItem[];

  @Prop({ type: Types.ObjectId, ref: Solution.name })
  chosenSolutionId?: Types.ObjectId;

  @Prop()
  chosenSolutionLabel?: string;

  @Prop({ type: [DiscrepancyItemSchema], default: [] })
  discrepancies!: DiscrepancyItem[];

  @Prop({ type: FlagsSchema, default: {} })
  flags!: Flags;

  @Prop({ type: TeacherOverrideSchema, default: {} })
  teacherOverride!: TeacherOverride;

  @Prop()
  gradingVersion?: string;

  @Prop()
  graderModelName?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);

@Schema({ timestamps: true })
export class GraderLog {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Submission.name, required: true })
  submissionId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Assignment.name, required: true })
  assignmentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Solution.name })
  solutionId?: Types.ObjectId;

  @Prop({ required: true })
  level!: string;

  @Prop({ required: true })
  stage!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ type: Object })
  details?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GraderLogSchema = SchemaFactory.createForClass(GraderLog);
