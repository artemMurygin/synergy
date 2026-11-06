import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../shared/config/app-config.module';
import { AuthModule } from './auth.module';

/** Root of the `seed:users` script: the auth module with its own configuration, no HTTP app. */
@Module({ imports: [AppConfigModule, AuthModule] })
export class AuthSeedModule {}
