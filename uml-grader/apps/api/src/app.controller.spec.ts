import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHello: () => 'Hello World!',
            getHealth: () => ({
              status: 'ok',
              service: 'api',
              database: {
                status: 'up',
                readyState: 1,
              },
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return API health status', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'api',
        database: {
          status: 'up',
          readyState: 1,
        },
      });
    });
  });
});
