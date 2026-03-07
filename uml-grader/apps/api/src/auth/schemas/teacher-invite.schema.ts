import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TeacherInviteDocument = HydratedDocument<TeacherInvite>;

@Schema({ timestamps: true })
export class TeacherInvite {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  usedAt?: Date;

  @Prop({ required: true })
  invitedBy!: string;
}

export const TeacherInviteSchema = SchemaFactory.createForClass(TeacherInvite);
