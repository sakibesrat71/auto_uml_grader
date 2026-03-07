import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/entities.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  SignupVerification,
  SignupVerificationSchema,
} from './schemas/signup-verification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SignupVerification.name, schema: SignupVerificationSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
