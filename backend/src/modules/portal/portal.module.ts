import { Module, type OnModuleInit } from '@nestjs/common';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { AcceptRequestUseCase } from './application/accept-request.use-case';
import { ArchiveAgentUseCase } from './application/archive-agent.use-case';
import { ArchiveSkillUseCase } from './application/archive-skill.use-case';
import { ChangeBugStatusUseCase } from './application/change-bug-status.use-case';
import { ChangeSkillStatusUseCase } from './application/change-skill-status.use-case';
import { EditCommentUseCase } from './application/edit-comment.use-case';
import { CreateSkillUseCase } from './application/create-skill.use-case';
import { GetArchiveUseCase } from './application/get-archive.use-case';
import { GetBugUseCase } from './application/get-bug.use-case';
import { GetCatalogUseCase } from './application/get-catalog.use-case';
import { GetRequestUseCase } from './application/get-request.use-case';
import { ListAgentsUseCase } from './application/list-agents.use-case';
import { EditBugCommentUseCase } from './application/edit-bug-comment.use-case';
import { ListBugCommentsUseCase } from './application/list-bug-comments.use-case';
import { ListBugQueueUseCase } from './application/list-bug-queue.use-case';
import { ListMyBugsUseCase } from './application/list-my-bugs.use-case';
import { PostBugCommentUseCase } from './application/post-bug-comment.use-case';
import { ReportBugUseCase } from './application/report-bug.use-case';
import { ListCommentsUseCase } from './application/list-comments.use-case';
import { ListMyRequestsUseCase } from './application/list-my-requests.use-case';
import { ListQueueUseCase } from './application/list-queue.use-case';
import { ListSkillsUseCase } from './application/list-skills.use-case';
import { PostCommentUseCase } from './application/post-comment.use-case';
import { RejectRequestUseCase } from './application/reject-request.use-case';
import { SeedPortalCatalogUseCase } from './application/seed-portal-catalog.use-case';
import { SubmitRequestUseCase } from './application/submit-request.use-case';
import { TakeRequestUseCase } from './application/take-request.use-case';
import { registerPortalEvents } from './contracts/register-portal-events';
import { BugCommentQuery } from './domain/ports/bug-comment-query.port';
import { BugCommentRepository } from './domain/ports/bug-comment-repository.port';
import { BugQuery } from './domain/ports/bug-query.port';
import { BugRepository } from './domain/ports/bug-repository.port';
import { CatalogRepository } from './domain/ports/catalog-repository.port';
import { CatalogQuery } from './domain/ports/catalog-query.port';
import { Clock } from './domain/ports/clock.port';
import { CommentQuery } from './domain/ports/comment-query.port';
import { CommentRepository } from './domain/ports/comment-repository.port';
import { RequestQuery } from './domain/ports/request-query.port';
import { RequestRepository } from './domain/ports/request-repository.port';
import { SkillQuery } from './domain/ports/skill-query.port';
import { SkillRepository } from './domain/ports/skill-repository.port';
import { SlonikBugCommentQuery } from './infrastructure/slonik-bug-comment.query';
import { SlonikBugCommentRepository } from './infrastructure/slonik-bug-comment.repository';
import { SlonikBugQuery } from './infrastructure/slonik-bug.query';
import { SlonikBugRepository } from './infrastructure/slonik-bug.repository';
import { SlonikCatalogRepository } from './infrastructure/slonik-catalog.repository';
import { SlonikCatalogQuery } from './infrastructure/slonik-catalog.query';
import { SlonikCommentQuery } from './infrastructure/slonik-comment.query';
import { SlonikCommentRepository } from './infrastructure/slonik-comment.repository';
import { SlonikRequestQuery } from './infrastructure/slonik-request.query';
import { SlonikRequestRepository } from './infrastructure/slonik-request.repository';
import { SlonikSkillQuery } from './infrastructure/slonik-skill.query';
import { SlonikSkillRepository } from './infrastructure/slonik-skill.repository';
import { SystemClock } from './infrastructure/system-clock';
import { BugCommentsController } from './interface/http/bug-comments.controller';
import { BugsController } from './interface/http/bugs.controller';
import { CatalogController } from './interface/http/catalog.controller';
import { CommentsController } from './interface/http/comments.controller';
import { RequestsController } from './interface/http/requests.controller';
import { SkillsController } from './interface/http/skills.controller';
import { registerPortalErrorStatuses } from './interface/portal-error-status';

// Каталог, навыки и заявки портала Featurer. Маршруты защищены глобальными JwtAuthGuard и RolesGuard из AuthModule.
@Module({
    imports: [PostgresModule],
    controllers: [
        RequestsController,
        CommentsController,
        BugsController,
        BugCommentsController,
        SkillsController,
        CatalogController,
    ],
    providers: [
        SubmitRequestUseCase,
        ListMyRequestsUseCase,
        GetRequestUseCase,
        ListQueueUseCase,
        TakeRequestUseCase,
        AcceptRequestUseCase,
        RejectRequestUseCase,
        ListAgentsUseCase,
        CreateSkillUseCase,
        ListSkillsUseCase,
        ChangeSkillStatusUseCase,
        ArchiveSkillUseCase,
        ArchiveAgentUseCase,
        GetCatalogUseCase,
        GetArchiveUseCase,
        ListCommentsUseCase,
        PostCommentUseCase,
        EditCommentUseCase,
        ReportBugUseCase,
        ListMyBugsUseCase,
        ListBugQueueUseCase,
        GetBugUseCase,
        ChangeBugStatusUseCase,
        ListBugCommentsUseCase,
        PostBugCommentUseCase,
        EditBugCommentUseCase,
        SeedPortalCatalogUseCase,
        { provide: Clock, useClass: SystemClock },
        { provide: RequestRepository, useClass: SlonikRequestRepository },
        { provide: RequestQuery, useClass: SlonikRequestQuery },
        { provide: SkillRepository, useClass: SlonikSkillRepository },
        { provide: SkillQuery, useClass: SlonikSkillQuery },
        { provide: CatalogRepository, useClass: SlonikCatalogRepository },
        { provide: CatalogQuery, useClass: SlonikCatalogQuery },
        { provide: CommentRepository, useClass: SlonikCommentRepository },
        { provide: CommentQuery, useClass: SlonikCommentQuery },
        { provide: BugRepository, useClass: SlonikBugRepository },
        { provide: BugQuery, useClass: SlonikBugQuery },
        { provide: BugCommentRepository, useClass: SlonikBugCommentRepository },
        { provide: BugCommentQuery, useClass: SlonikBugCommentQuery },
    ],
    exports: [
        SeedPortalCatalogUseCase,
        Clock,
        RequestRepository,
        RequestQuery,
        SkillRepository,
        SkillQuery,
        CatalogRepository,
        CatalogQuery,
    ],
})
export class PortalModule implements OnModuleInit {
    constructor(private readonly events: DomainEventRegistry) {}

    onModuleInit(): void {
        registerPortalErrorStatuses();
        registerPortalEvents(this.events);
    }
}
