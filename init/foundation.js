export const FOUNDATION_VERSION = 2;

export const runtimeDependencies = {
  '@fastify/cors': '^11.0.0',
  '@fastify/static': '^10.0.0',
  '@nestjs/config': '^12.0.0',
  '@nestjs/cqrs': '^12.0.0',
  '@nestjs/platform-fastify': '^12.0.0',
  '@nestjs/swagger': '^12.0.0',
  '@nestjs/terminus': '^12.0.0',
  'class-transformer': '^0.5.1',
  'class-validator': '^0.15.0',
  fastify: '^5.0.0',
  joi: '^18.0.0',
  'nestjs-pino': '^5.0.0',
  'pino-http': '^11.0.0',
};

export const devDependencies = {
  '@types/supertest': '^7.0.0',
  '@vitest/coverage-v8': '^4.0.0',
  oxlint: '^1.50.0',
  'oxlint-tsgolint': '^7.0.0',
  'pino-pretty': '^13.0.0',
  prettier: '^3.4.0',
  supertest: '^7.0.0',
  'vite-tsconfig-paths': '^5.0.0',
  vitest: '^4.0.0',
};

export const files = {
  'src/main.ts': `import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { EnvConfig } from './config/env.config.types.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(config.getOrThrow('apiPrefix', { infer: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (config.getOrThrow('cors.enabled', { infer: true })) {
    app.enableCors({
      origin: config.getOrThrow('cors.origins', { infer: true }),
    });
  }

  if (config.getOrThrow('swaggerEnabled', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nest API')
      .setDescription('API documentation')
      .setVersion('1.0.0')
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      () => SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(config.getOrThrow('port', { infer: true }), '0.0.0.0');
}

await bootstrap();
`,
  'src/app.module.ts': `import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { configuration } from './config/configuration.js';
import { envFilePath } from './config/env-file-path.js';
import { EnvConfig } from './config/env.config.types.js';
import { envValidationSchema } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath(),
      validationSchema: envValidationSchema,
      load: [configuration],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        pinoHttp: {
          level: config.getOrThrow('logLevel', { infer: true }),
          transport:
            config.getOrThrow('env', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    CqrsModule.forRoot(),
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
`,
  'src/common/decorators/response-message.decorator.ts': `import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
`,
  'src/common/interfaces/api-response.interface.ts': `export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  timestamp: string;
  path: string;
  message?: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  timestamp: string;
  path: string;
  error: string;
  message: string;
}
`,
  'src/common/filters/global-exception.filter.ts': `import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { ApiErrorResponse } from '../interfaces/api-response.interface.js';

interface HttpErrorBody { error?: string; message?: string | string[] }

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const statusCode = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const normalized = this.normalize(
      exception instanceof HttpException ? exception.getResponse() : undefined,
      statusCode,
    );

    if (statusCode >= 500) {
      this.logger.error(
        { err: exception, method: request.method, path: request.url.split('?')[0] },
        'Unhandled request exception',
      );
    }

    const payload: ApiErrorResponse = {
      success: false,
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url.split('?')[0],
      ...normalized,
    };
    void response.status(statusCode).send(payload);
  }

  private normalize(response: string | object | undefined, statusCode: number) {
    const fallback = HttpStatus[statusCode] ?? 'Error';
    if (typeof response === 'string') return { error: fallback, message: response };
    if (response && typeof response === 'object') {
      const body = response as HttpErrorBody;
      return {
        error: body.error ?? fallback,
        message: Array.isArray(body.message)
          ? (body.message[0] ?? fallback)
          : (body.message ?? fallback),
      };
    }
    return { error: 'Internal Server Error', message: 'An unexpected error occurred' };
  }
}
`,
  'src/common/interceptors/response.interceptor.ts': `import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator.js';
import { ApiSuccessResponse } from '../interfaces/api-response.interface.js';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const message = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(map((data) => ({
      success: true as const,
      statusCode: response.statusCode,
      timestamp: new Date().toISOString(),
      path: request.url.split('?')[0],
      ...(message ? { message } : {}),
      data,
    })));
  }
}
`,
  'src/common/pagination/pagination-query.dto.ts': `import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
`,
  'src/common/pagination/pagination-meta.interface.ts': `export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}
`,
  'src/common/pagination/paginated-result.interface.ts': `import { PaginationMeta } from './pagination-meta.interface.js';

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
`,
  'src/config/env-file-path.ts': `const appEnvironments = ['development', 'staging', 'production'] as const;

export function envFilePath(): string[] {
  const appEnv = process.env.APP_ENV ?? 'development';
  if (!appEnvironments.includes(appEnv as (typeof appEnvironments)[number])) {
    throw new Error('APP_ENV must be development, staging, or production');
  }
  return [\`.env.\${appEnv}\`, '.env'];
}
`,
  'src/config/env.d.ts': `export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      APP_ENV?: 'development' | 'staging' | 'production';
      NODE_ENV: 'development' | 'staging' | 'production';
      PORT: number;
      API_PREFIX: string;
      SWAGGER_ENABLED: 'true' | 'false';
      LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
      CORS_ENABLED: 'true' | 'false';
      CORS_ORIGINS: string;
    }
  }
}
`,
  'src/config/env.config.types.ts': `export type EnvConfig = {
  env: 'development' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  swaggerEnabled: boolean;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  cors: { enabled: boolean; origins: string[] };
};
`,
  'src/config/configuration.ts': `import { EnvConfig } from './env.config.types.js';

export function configuration(): EnvConfig {
  const parsed = process.env;
  const corsEnabled = parsed.CORS_ENABLED === 'true';
  const origins = parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    apiPrefix: parsed.API_PREFIX,
    swaggerEnabled: parsed.SWAGGER_ENABLED === 'true',
    logLevel: parsed.LOG_LEVEL,
    cors: { enabled: corsEnabled, origins },
  };
}
`,
  'src/config/env.validation.ts': `import Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').required(),
  PORT: Joi.number().required(),
  API_PREFIX: Joi.string().required(),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').required(),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').required(),
  CORS_ENABLED: Joi.boolean().truthy('true').falsy('false').required(),
  CORS_ORIGINS: Joi.when('CORS_ENABLED', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').required(),
  }),
});
`,
  'src/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
`,
  'src/health/health.module.ts': `import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

@Module({ imports: [TerminusModule], controllers: [HealthController] })
export class HealthModule {}
`,
  'src/health/health.controller.spec.ts': `import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('delegates the liveness check to Terminus', async () => {
    const result = { status: 'ok', info: {}, error: {}, details: {} } as const;
    const check = vi.fn().mockResolvedValue(result);
    const health = { check } as unknown as HealthCheckService;
    await expect(new HealthController(health).check()).resolves.toEqual(result);
    expect(check).toHaveBeenCalledWith([]);
  });
});
`,
  '.env.example': `# Runtime environment: development, staging, or production
NODE_ENV=development
# Deployment environment used to select application behavior
APP_ENV=development
# HTTP server
PORT=3000
API_PREFIX=api
# API documentation is served at /docs when enabled
SWAGGER_ENABLED=true
# Pino level: fatal, error, warn, info, debug, or trace
LOG_LEVEL=debug
# Comma-separated browser origins; at least one is required when enabled
CORS_ENABLED=true
CORS_ORIGINS=http://localhost:3000
`,
  'vitest.config.ts': `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { globals: true, root: './', include: ['**/*.spec.ts'] },
});
`,
  'vitest.config.e2e.ts': `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { globals: true, root: './', include: ['test/**/*.e2e-spec.ts'] },
});
`,
  'test/app.e2e-spec.ts': `import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('health (e2e)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'development';
    process.env.CORS_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  it('GET /api/health', () => request(app.getHttpServer()).get('/api/health').expect(200));
});
`,
};

export const removableDefaultFiles = [
  'src/app.controller.ts',
  'src/app.service.ts',
  'src/app.controller.spec.ts',
  'test/app.e2e-spec.ts',
];
