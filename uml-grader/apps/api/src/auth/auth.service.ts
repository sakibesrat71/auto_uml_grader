import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/entities.schema';
import {
  SignupVerification,
  SignupVerificationDocument,
} from './schemas/signup-verification.schema';

@Injectable()
export class AuthService {
  private readonly allowedEmailPattern =
    /^[a-zA-Z0-9._%+-]+@student\.adelaide\.edu\.au$/;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SignupVerification.name)
    private readonly signupVerificationModel: Model<SignupVerificationDocument>,
    private readonly configService: ConfigService,
  ) {}

  async signup(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    this.validateStudentEmail(normalizedEmail);
    this.validatePassword(password);

    const existingUser = await this.userModel
      .findOne({ email: normalizedEmail })
      .lean();
    if (existingUser) {
      throw new ConflictException('An account already exists for this email.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);
    const otpMinutes = this.getOtpExpiryMinutes();
    const expiresAt = new Date(Date.now() + otpMinutes * 60 * 1000);

    await this.signupVerificationModel.findOneAndUpdate(
      { email: normalizedEmail },
      {
        email: normalizedEmail,
        passwordHash,
        otpHash,
        expiresAt,
        failedAttempts: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this.sendOtpEmail(normalizedEmail, otp, otpMinutes);

    return {
      message:
        'Verification OTP sent to your email. Use /auth/signup/verify to complete signup.',
    };
  }

  async verifySignup(email: string, otp: string) {
    const normalizedEmail = this.normalizeEmail(email);
    this.validateStudentEmail(normalizedEmail);

    const pendingSignup = await this.signupVerificationModel.findOne({
      email: normalizedEmail,
    });
    if (!pendingSignup) {
      throw new BadRequestException('No pending signup found for this email.');
    }

    if (pendingSignup.expiresAt.getTime() < Date.now()) {
      await this.signupVerificationModel.deleteOne({ _id: pendingSignup._id });
      throw new UnauthorizedException('OTP expired. Please signup again.');
    }

    const otpHash = this.hashOtp(otp);
    if (otpHash !== pendingSignup.otpHash) {
      pendingSignup.failedAttempts += 1;
      await pendingSignup.save();
      throw new UnauthorizedException('Invalid OTP.');
    }

    const existingUser = await this.userModel
      .findOne({ email: normalizedEmail })
      .lean();
    if (existingUser) {
      await this.signupVerificationModel.deleteOne({ _id: pendingSignup._id });
      throw new ConflictException('An account already exists for this email.');
    }

    const fullName = this.deriveFullNameFromEmail(normalizedEmail);
    await this.userModel.create({
      fullName,
      email: normalizedEmail,
      passwordHash: pendingSignup.passwordHash,
      role: 'student',
      isActive: true,
    });

    await this.signupVerificationModel.deleteOne({ _id: pendingSignup._id });

    return { message: 'Signup completed successfully.' };
  }

  private normalizeEmail(email: string): string {
    return email?.trim().toLowerCase();
  }

  private validateStudentEmail(email: string) {
    if (!email || !this.allowedEmailPattern.test(email)) {
      throw new BadRequestException(
        'Email must be a valid @student.adelaide.edu.au address.',
      );
    }
  }

  private validatePassword(password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'Password is required and must be at least 8 characters.',
      );
    }
  }

  private generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private getOtpExpiryMinutes(): number {
    const raw = this.configService.get<string>('OTP_EXPIRY_MINUTES');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }

  private deriveFullNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? 'Student User';
    return localPart
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async sendOtpEmail(email: string, otp: string, expiresIn: number) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? '587');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM') ?? user;

    if (!host || !user || !pass || !from) {
      throw new InternalServerErrorException(
        'SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'UML Grader signup verification OTP',
      text: `Your OTP is ${otp}. It expires in ${expiresIn} minutes.`,
    });
  }
}
