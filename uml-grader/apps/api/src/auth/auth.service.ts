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

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly allowedEmailPattern =
    /^[a-zA-Z0-9._%+-]+@student\.adelaide\.edu\.au$/;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SignupVerification.name)
    private readonly signupVerificationModel: Model<SignupVerificationDocument>,
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

  private minutesToMs(minutes: number): number {
    return minutes * 60 * 1000;
  }

  private daysToMs(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  }
}
