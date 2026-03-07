import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { Request, Response } from 'express';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/entities.schema';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL,
} from './auth.constants';
import {
  SignupVerification,
  SignupVerificationDocument,
} from './schemas/signup-verification.schema';
import { TeacherInvite, TeacherInviteDocument } from './schemas/teacher-invite.schema';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

interface TeacherInvitePayload {
  email: string;
  type: 'teacher-invite';
}

@Injectable()
export class AuthService {
  private readonly allowedEmailPattern =
    /^[a-zA-Z0-9._%+-]+@student\.adelaide\.edu\.au$/;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SignupVerification.name)
    private readonly signupVerificationModel: Model<SignupVerificationDocument>,
    @InjectModel(TeacherInvite.name)
    private readonly teacherInviteModel: Model<TeacherInviteDocument>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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

  async verifySignup(email: string, otp: string, response: Response) {
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

    const existingUser = await this.userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      await this.signupVerificationModel.deleteOne({ _id: pendingSignup._id });
      throw new ConflictException('An account already exists for this email.');
    }

    const fullName = this.deriveFullNameFromEmail(normalizedEmail);
    const createdUser = await this.userModel.create({
      fullName,
      email: normalizedEmail,
      passwordHash: pendingSignup.passwordHash,
      role: 'student',
      isActive: true,
    });

    await this.signupVerificationModel.deleteOne({ _id: pendingSignup._id });

    const safeUser = await this.issueSession(createdUser, response);
    return { message: 'Signup completed successfully.', user: safeUser };
  }

  async login(email: string, password: string, response: Response) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.userModel.findOne({ email: normalizedEmail });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account is inactive.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const safeUser = await this.issueSession(user, response);
    return { message: 'Login successful.', user: safeUser };
  }

  async refresh(request: Request, response: Response) {
    const refreshToken = this.getRefreshTokenFromRequest(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing.');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.userModel.findById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const safeUser = await this.issueSession(user, response);
    return { message: 'Session refreshed.', user: safeUser };
  }

  async logout(request: Request & { user?: { id?: string } }, response: Response) {
    const userId = request.user?.id;
    if (userId) {
      await this.userModel.updateOne(
        { _id: userId },
        { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } },
      );
    }

    this.clearAuthCookies(response);
    return { message: 'Logged out successfully.' };
  }

  me(request: Request & { user?: unknown }) {
    return {
      user: request.user ?? null,
    };
  }

  async superadminLogin(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const superadminEmail = this.normalizeEmail(
      this.getRequiredEnv('SUPERADMIN_EMAIL'),
    );
    const superadminPassword = this.getRequiredEnv('SUPERADMIN_PASSWORD');

    if (
      normalizedEmail !== superadminEmail ||
      password !== superadminPassword
    ) {
      throw new UnauthorizedException('Invalid superadmin credentials.');
    }

    const secret = this.getRequiredEnv('JWT_SUPERADMIN_SECRET');
    const token = await this.jwtService.signAsync(
      {
        sub: 'superadmin',
        email: superadminEmail,
        role: 'superadmin',
      },
      { secret, expiresIn: '12h' },
    );

    return {
      message: 'Superadmin login successful.',
      token,
    };
  }

  async inviteTeachers(emails: string[]) {
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new BadRequestException('emails must be a non-empty array.');
    }

    const uniqueEmails = [...new Set(emails.map((item) => this.normalizeEmail(item)))];
    const invited: string[] = [];
    const skipped: { email: string; reason: string }[] = [];

    for (const email of uniqueEmails) {
      if (!email || !this.isValidEmail(email)) {
        skipped.push({ email, reason: 'Invalid email format.' });
        continue;
      }

      const userExists = await this.userModel.findOne({ email }).lean();
      if (userExists) {
        skipped.push({ email, reason: 'User already exists.' });
        continue;
      }

      const inviteToken = await this.createTeacherInviteToken(email);
      const tokenHash = this.hashOtp(inviteToken);
      const expiresAt = new Date(Date.now() + this.daysToMs(3));

      await this.teacherInviteModel.create({
        email,
        tokenHash,
        expiresAt,
        invitedBy: this.getRequiredEnv('SUPERADMIN_EMAIL'),
      });

      const inviteLink = `${this.getTeacherInviteBaseUrl()}?token=${encodeURIComponent(inviteToken)}`;
      await this.sendTeacherInviteEmail(email, inviteLink);
      invited.push(email);
    }

    return {
      message: 'Teacher invitations processed.',
      invitedCount: invited.length,
      invited,
      skipped,
    };
  }

  async acceptTeacherInvite(
    token: string,
    password: string,
    confirmPassword: string,
  ) {
    if (!token) {
      throw new BadRequestException('Invitation token is required.');
    }
    this.validatePassword(password);
    if (password !== confirmPassword) {
      throw new BadRequestException('Password and confirmPassword must match.');
    }

    const payload = await this.verifyTeacherInviteToken(token);
    const tokenHash = this.hashOtp(token);

    const invite = await this.teacherInviteModel.findOne({
      email: payload.email,
      tokenHash,
      usedAt: { $exists: false },
    });
    if (!invite) {
      throw new UnauthorizedException('Invalid or already used invitation.');
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invitation has expired.');
    }

    const existingUser = await this.userModel.findOne({ email: payload.email }).lean();
    if (existingUser) {
      throw new ConflictException('A user already exists for this email.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const fullName = this.deriveFullNameFromEmail(payload.email);
    await this.userModel.create({
      fullName,
      email: payload.email,
      passwordHash,
      role: 'teacher',
      isActive: true,
    });

    invite.usedAt = new Date();
    await invite.save();

    return { message: 'Teacher account created successfully. You can now login.' };
  }

  private async issueSession(user: UserDocument, response: Response) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessSecret = this.getRequiredEnv('JWT_ACCESS_SECRET');
    const refreshSecret = this.getRequiredEnv('JWT_REFRESH_SECRET');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: ACCESS_TOKEN_TTL,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: REFRESH_TOKEN_TTL,
      }),
    ]);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    user.refreshTokenHash = refreshTokenHash;
    user.refreshTokenExpiresAt = new Date(Date.now() + this.daysToMs(7));
    await user.save();

    this.setAuthCookies(response, accessToken, refreshToken);

    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: this.minutesToMs(15),
    });
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: this.daysToMs(7),
    });
  }

  private clearAuthCookies(response: Response) {
    response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    const refreshSecret = this.getRequiredEnv('JWT_REFRESH_SECRET');
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
  }

  private getRefreshTokenFromRequest(request: Request): string | undefined {
    const fromCookie = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (fromCookie) {
      return fromCookie;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }
    return authHeader.slice('Bearer '.length).trim();
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured.`);
    }
    return value;
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

  private async sendTeacherInviteEmail(email: string, inviteLink: string) {
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
      subject: 'UML Grader teacher invitation',
      text: `You were invited as a teacher. Complete signup here: ${inviteLink}`,
    });
  }

  private async createTeacherInviteToken(email: string): Promise<string> {
    const secret = this.getRequiredEnv('JWT_TEACHER_INVITE_SECRET');
    return this.jwtService.signAsync(
      {
        email,
        type: 'teacher-invite',
      } satisfies TeacherInvitePayload,
      { secret, expiresIn: '3d' },
    );
  }

  private async verifyTeacherInviteToken(
    token: string,
  ): Promise<TeacherInvitePayload> {
    const secret = this.getRequiredEnv('JWT_TEACHER_INVITE_SECRET');
    try {
      const payload = await this.jwtService.verifyAsync<TeacherInvitePayload>(
        token,
        { secret },
      );
      if (payload.type !== 'teacher-invite' || !payload.email) {
        throw new UnauthorizedException('Invalid invitation payload.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired invitation token.');
    }
  }

  private getTeacherInviteBaseUrl(): string {
    return (
      this.configService.get<string>('TEACHER_INVITE_BASE_URL') ??
      'http://localhost:3000/teacher/signup'
    );
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private minutesToMs(minutes: number): number {
    return minutes * 60 * 1000;
  }

  private daysToMs(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  }
}
