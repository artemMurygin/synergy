import { Injectable } from '@nestjs/common';
import { CatalogRepository, type AgentWithProduct } from '../domain/ports/catalog-repository.port';

@Injectable()
export class ListAgentsUseCase {
    constructor(private readonly catalog: CatalogRepository) {}

    execute(): Promise<AgentWithProduct[]> {
        return this.catalog.listAgents();
    }
}
