import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.schema';
import { RequestContext } from '../context/request-context';
import { resolveRequestIds } from '../context/request-id';
import { LOG_REDACT_PATHS } from './log-redact-paths';
import { serializeRequest } from './request-serializer';

@Module({
    imports: [
        LoggerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => {
                const lokiUrl = config.get('LOKI_URL', { infer: true });
                const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
                const targets = [
                    isDev
                        ? { target: 'pino-pretty', options: { singleLine: true } }
                        : { target: 'pino/file', options: { destination: 1 } },
                    ...(lokiUrl !== undefined && lokiUrl !== ''
                        ? [
                              {
                                  target: 'pino-loki',
                                  options: {
                                      host: lokiUrl,
                                      batching: true,
                                      interval: 5,
                                      labels: {
                                          app: config.get('LOKI_LABELS_APP', { infer: true }),
                                      },
                                  },
                              },
                          ]
                        : []),
                ];
                return {
                    pinoHttp: {
                        level: config.get('LOG_LEVEL', { infer: true }),
                        genReqId: (req, res) => resolveRequestIds(req, res).requestId,
                        mixin: () => RequestContext.getIds() ?? {},
                        serializers: { req: serializeRequest },
                        redact: {
                            paths: [...LOG_REDACT_PATHS],
                            censor: '[Redacted]',
                        },
                        autoLogging: {
                            ignore: (req) => req.url === '/metrics' || req.url === '/health',
                        },
                        transport: { targets },
                    },
                };
            },
        }),
    ],
})
export class AppLoggerModule {}
