import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface SuperadminJwtPayload {
  sub: 'superadmin';
  email: string;
  role: 'superadmin';
}

@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing superadmin token.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const secret = this.configService.get<string>('JWT_SUPERADMIN_SECRET');
    if (!secret) {
      throw new BadRequestException('JWT_SUPERADMIN_SECRET is not configured.');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<SuperadminJwtPayload>(token, {
          secret,
        });
      if (payload.role !== 'superadmin' || payload.sub !== 'superadmin') {
        throw new UnauthorizedException('Invalid superadmin token.');
      }

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired superadmin token.');
    }
  }
}
