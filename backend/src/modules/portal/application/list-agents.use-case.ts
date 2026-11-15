import { Injectable } from '@nestjs/common';
import { CatalogRepository, type AgentWithProducts } from '../domain/ports/catalog-repository.port';

@Injectable()
export class ListAgentsUseCase {
    constructor(private readonly catalog: CatalogRepository) {}

    execute(): Promise<AgentWithProducts[]> {
        return this.catalog.listAgents();
    }
}
