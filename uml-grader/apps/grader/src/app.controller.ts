import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import type { CompareDiagramsRequest } from './contracts/comparison.contract';
import type { GradeRequest } from './contracts/grading.contract';
import type { ParseUxfRequest } from './contracts/uml.contract';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Post('grade')
  async grade(@Body() request: GradeRequest) {
    return this.appService.grade(request);
  }

  @Post('parse-uxf')
  parseUxf(@Body() request: ParseUxfRequest) {
    return this.appService.parseUxf(request);
  }

  @Post('compare')
  compare(@Body() request: CompareDiagramsRequest) {
    return this.appService.compare(request);
  }
}
