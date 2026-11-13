import { Module, type OnModuleInit } from '@nestjs/common';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { AcceptRequestUseCase } from './application/accept-request.use-case';
import { ChangeSkillStatusUseCase } from './application/change-skill-status.use-case';
import { CreateSkillUseCase } from './application/create-skill.use-case';
import { GetRequestUseCase } from './application/get-request.use-case';
import { ListAgentsUseCase } from './application/list-agents.use-case';
import { ListMyRequestsUseCase } from './application/list-my-requests.use-case';
import { ListQueueUseCase } from './application/list-queue.use-case';
import { ListSkillsUseCase } from './application/list-skills.use-case';
import { RejectRequestUseCase } from './application/reject-request.use-case';
import { SeedPortalCatalogUseCase } from './application/seed-portal-catalog.use-case';
import { SubmitRequestUseCase } from './application/submit-request.use-case';
import { registerPortalEvents } from './contracts/register-portal-events';
import { CatalogRepository } from './domain/ports/catalog-repository.port';
import { Clock } from './domain/ports/clock.port';
import { RequestQuery } from './domain/ports/request-query.port';
import { RequestRepository } from './domain/ports/request-repository.port';
import { SkillQuery } from './domain/ports/skill-query.port';
import { SkillRepository } from './domain/ports/skill-repository.port';
import { SlonikCatalogRepository } from './infrastructure/slonik-catalog.repository';
import { SlonikRequestQuery } from './infrastructure/slonik-request.query';
import { SlonikRequestRepository } from './infrastructure/slonik-request.repository';
import { SlonikSkillQuery } from './infrastructure/slonik-skill.query';
import { SlonikSkillRepository } from './infrastructure/slonik-skill.repository';
import { SystemClock } from './infrastructure/system-clock';
import { RequestsController } from './interface/http/requests.controller';
import { SkillsController } from './interface/http/skills.controller';
import { registerPortalErrorStatuses } from './interface/portal-error-status';

// Каталог, навыки и заявки портала Featurer. Маршруты защищены глобальными JwtAuthGuard и RolesGuard из AuthModule.
@Module({
    imports: [PostgresModule],
    controllers: [RequestsController, SkillsController],
    providers: [
        SubmitRequestUseCase,
        ListMyRequestsUseCase,
        GetRequestUseCase,
        ListQueueUseCase,
        AcceptRequestUseCase,
        RejectRequestUseCase,
        ListAgentsUseCase,
        CreateSkillUseCase,
        ListSkillsUseCase,
        ChangeSkillStatusUseCase,
        SeedPortalCatalogUseCase,
        { provide: Clock, useClass: SystemClock },
        { provide: RequestRepository, useClass: SlonikRequestRepository },
        { provide: RequestQuery, useClass: SlonikRequestQuery },
        { provide: SkillRepository, useClass: SlonikSkillRepository },
        { provide: SkillQuery, useClass: SlonikSkillQuery },
        { provide: CatalogRepository, useClass: SlonikCatalogRepository },
    ],
    exports: [
        SeedPortalCatalogUseCase,
        Clock,
        RequestRepository,
        RequestQuery,
        SkillRepository,
        SkillQuery,
        CatalogRepository,
    ],
})
export class PortalModule implements OnModuleInit {
    constructor(private readonly events: DomainEventRegistry) {}

    onModuleInit(): void {
        registerPortalErrorStatuses();
        registerPortalEvents(this.events);
    }
}
