import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

interface SignupRequestBody {
  email: string;
  password: string;
}

interface VerifySignupBody {
  email: string;
  otp: string;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() body: SignupRequestBody) {
    return this.authService.signup(body.email, body.password);
  }

  @Public()
  @Post('signup/verify')
  verifySignup(
    @Body() body: VerifySignupBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.verifySignup(body.email, body.otp, response);
  }

  @Public()
  @Post('login')
  login(
    @Body() body: LoginRequestBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(body.email, body.password, response);
  }

  @Public()
  @Post('refresh')
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refresh(request, response);
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response);
  }

  @Get('me')
  me(@Req() request: Request & { user?: unknown }) {
    return this.authService.me(request);
  }
}
