import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiagramComparisonService } from './comparison/diagram-comparison.service';
import { OllamaGradingService } from './ollama/ollama-grading.service';
import { UxfParserService } from './uxf/uxf-parser.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    UxfParserService,
    DiagramComparisonService,
    OllamaGradingService,
  ],
})
export class AppModule {}
