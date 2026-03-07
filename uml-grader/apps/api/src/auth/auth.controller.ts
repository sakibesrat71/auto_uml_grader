import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

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

  @Post('signup')
  signup(@Body() body: SignupRequestBody) {
    return this.authService.signup(body.email, body.password);
  }

  @Post('signup/verify')
  verifySignup(@Body() body: VerifySignupBody) {
    return this.authService.verifySignup(body.email, body.otp);
  }

  @Post('login')
  login(@Body() body: LoginRequestBody) {
    return this.authService.login(body.email, body.password);
  }
}
