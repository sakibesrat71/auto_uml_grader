import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class AppService {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    const isDatabaseUp = this.mongoConnection.readyState === 1;

    return {
      status: isDatabaseUp ? 'ok' : 'degraded',
      service: 'api',
      database: {
        status: isDatabaseUp ? 'up' : 'down',
        readyState: this.mongoConnection.readyState,
      },
    };
  }
}
