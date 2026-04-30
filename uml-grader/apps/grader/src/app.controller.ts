import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import type { GradeRequest } from './contracts/grading.contract';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Post('grade')
  grade(@Body() request: GradeRequest) {
    return this.appService.grade(request);
  }
}
