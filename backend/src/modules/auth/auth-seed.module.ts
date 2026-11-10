import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../shared/config/app-config.module';
import { AppLoggerModule } from '../../shared/logger/app-logger.module';
import { AuthModule } from './auth.module';

@Module({ imports: [AppConfigModule, AppLoggerModule, AuthModule] })
export class AuthSeedModule {}
