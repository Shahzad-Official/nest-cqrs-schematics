import { GUIDANCE_FOUNDATION_VERSION } from './guidance.js';

export const FOUNDATION_VERSION = GUIDANCE_FOUNDATION_VERSION;

export const runtimeDependencies = {
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
  'pino-pretty': '^13.0.0',
};

export const files = {
  'src/main.ts': `import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.config.types';

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

void bootstrap();
`,
  'src/app.module.ts': `import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { configuration } from './config/configuration';
import { envFilePath } from './config/env-file-path';
import { EnvConfig } from './config/env.config.types';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

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
  'src/common/decorators/api-response.decorator.ts': `import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath, ReferenceObject, SchemaObject } from '@nestjs/swagger';
import { ApiErrorResponse, ApiSuccessResponse } from '../interfaces/api-response.interface';

type ResponseSchema = SchemaObject | ReferenceObject;

interface SuccessResponseOptions {
  status: number;
  description: string;
  data: ResponseSchema;
  models?: Type<unknown>[];
}

export function ApiSuccessEnvelope(options: SuccessResponseOptions): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessResponse, ...(options.models ?? [])),
    ApiResponse({
      status: options.status,
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiSuccessResponse) },
          { properties: { data: options.data } },
        ],
      },
    }),
  );
}

export function ApiErrorEnvelope(status: number, description: string): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponse),
    ApiResponse({ status, description, schema: { $ref: getSchemaPath(ApiErrorResponse) } }),
  );
}
`,
  'src/common/interfaces/api-response.interface.ts': `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiSuccessResponse<T> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/resources' })
  path!: string;

  @ApiPropertyOptional({ example: 'Request completed successfully' })
  message?: string;

  @ApiProperty({ description: 'Endpoint response payload' })
  data!: T;
}

export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/resources' })
  path!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;
}
`,
  'src/common/filters/global-exception.filter.ts': `import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

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
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';

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
  'src/common/pagination/pagination-query.dto.ts': `import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
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
  'src/common/pagination/paginated-result.interface.ts': `import { PaginationMeta } from './pagination-meta.interface';

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
`,
  'src/config/env-file-path.ts': `const nodeEnvironments = ['development', 'staging', 'production', 'test'] as const;

export function envFilePath(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!nodeEnvironments.includes(nodeEnv as (typeof nodeEnvironments)[number])) {
    throw new Error('NODE_ENV must be development, staging, production, or test');
  }
  return [\`.env.\${nodeEnv}\`, '.env'];
}
`,
  'src/config/env.d.ts': `export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'staging' | 'production' | 'test';
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
  env: 'development' | 'staging' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  swaggerEnabled: boolean;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  cors: { enabled: boolean; origins: string[] };
};
`,
  'src/config/configuration.ts': `import { EnvConfig } from './env.config.types';

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
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').required(),
  PORT: Joi.number().required(),
  API_PREFIX: Joi.string().required(),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').required(),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').required(),
  CORS_ENABLED: Joi.boolean().truthy('true').falsy('false').required(),
  CORS_ORIGINS: Joi.when('CORS_ENABLED', {
    is: true,
    // oxlint-disable-next-line unicorn/no-thenable -- Joi uses "then" as a conditional schema key.
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').required(),
  }),
});
`,
  'src/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { ApiErrorEnvelope, ApiSuccessEnvelope } from '../common/decorators/api-response.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('live')
  @ApiSuccessEnvelope({ status: 200, description: 'Application is alive', data: { type: 'object' } })
  @ApiErrorEnvelope(500, 'Unexpected health-check failure')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @ApiSuccessEnvelope({ status: 200, description: 'Application is ready', data: { type: 'object' } })
  @ApiErrorEnvelope(500, 'Unexpected readiness failure')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
`,
  'src/health/health.module.ts': `import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({ imports: [TerminusModule], controllers: [HealthController] })
export class HealthModule {}
`,
  'src/health/health.controller.spec.ts': `import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('keeps liveness independent from external integrations', async () => {
    const result = { status: 'ok', info: {}, error: {}, details: {} } as const;
    const check = jest.fn().mockResolvedValue(result);
    const health = { check } as unknown as HealthCheckService;
    await expect(new HealthController(health).live()).resolves.toEqual(result);
    expect(check).toHaveBeenCalledWith([]);
  });

  it('checks foundation readiness', async () => {
    const result = { status: 'ok', info: {}, error: {}, details: {} } as const;
    const check = jest.fn().mockResolvedValue(result);
    const health = { check } as unknown as HealthCheckService;
    await expect(new HealthController(health).ready()).resolves.toEqual(result);
    expect(check).toHaveBeenCalledWith([]);
  });
});
`,
  '.env.example': `# Runtime and configuration-file environment: development, staging, or production
NODE_ENV="development"
# HTTP server
PORT=3000
API_PREFIX="api"
# API documentation is served at /docs when enabled
SWAGGER_ENABLED=true
# Pino level: fatal, error, warn, info, debug, or trace
LOG_LEVEL="debug"
# Comma-separated browser origins; at least one is required when enabled
CORS_ENABLED=true
CORS_ORIGINS="http://localhost:3000"
`,
  'test/setup-env.ts': `Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  API_PREFIX: 'api',
  SWAGGER_ENABLED: 'true',
  LOG_LEVEL: 'error',
  CORS_ENABLED: 'false',
  CORS_ORIGINS: '',
  DB_TYPE: 'postgres',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'test',
  DB_SSL: 'false',
});
`,
  'test/app.e2e-spec.ts': `import './setup-env';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('health (e2e)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  it('GET /api/health/live', () => request(app.getHttpServer()).get('/api/health/live').expect(200));
  it('GET /api/health/ready', () => request(app.getHttpServer()).get('/api/health/ready').expect(200));
  it('documents the intercepted success envelope', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const response = document.paths['/api/health/live']?.get?.responses?.['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/ApiSuccessResponse' },
              { properties: { data: { type: 'object' } } },
            ],
          },
        },
      },
    });
    expect(document.paths['/api/health/live']?.get?.responses?.['500']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiErrorResponse' },
        },
      },
    });
  });
});
`,
};

export const removableDefaultFiles = [
  'src/app.controller.ts',
  'src/app.service.ts',
  'src/app.controller.spec.ts',
  'test/app.e2e-spec.ts',
];

// Tests are intentionally authored later against confirmed project behavior
// and the application's existing test runner/configuration.
for (const path of [
  'src/health/health.controller.spec.ts',
  'test/setup-env.ts',
  'test/app.e2e-spec.ts',
]) delete files[path];
