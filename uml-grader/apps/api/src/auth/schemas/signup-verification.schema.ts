import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SignupVerificationDocument = HydratedDocument<SignupVerification>;

@Schema({ timestamps: true })
export class SignupVerification {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true })
  otpHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: 0 })
  failedAttempts!: number;
}

export const SignupVerificationSchema =
  SchemaFactory.createForClass(SignupVerification);
