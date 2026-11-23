import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests, so tests run against the exact production setup. */
export function configureApp(app: INestApplication): void {
  // Behind Nginx, trust the first proxy so req.ip (used by the rate limiter)
  // is the real client IP from X-Forwarded-For, not Nginx's own address.
  if (app.get(ConfigService).get<boolean>('TRUST_PROXY')) {
    (app as NestExpressApplication).set('trust proxy', 1);
  }
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.use(helmet());
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PayLite Wallet API')
    .setDescription(
      'Digital wallet & P2P transfer API. All amounts are integers in **millimes** ' +
        '(1 TND = 1000 millimes). Log in, then click **Authorize** and paste the access token.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
