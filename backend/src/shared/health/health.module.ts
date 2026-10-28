import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { HealthController } from './health.controller';

@Module({ imports: [TerminusModule, PostgresModule], controllers: [HealthController] })
export class HealthModule {}
