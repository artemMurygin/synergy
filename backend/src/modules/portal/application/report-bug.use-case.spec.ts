import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { BugReportedEvent } from '../contracts/bug-reported.event';
import {
    AgentArchivedError,
    AgentNotFoundError,
    AgentNotInProductError,
    ProductNotFoundError,
} from '../domain/errors';
import type { Agent } from '../domain/agent';
import type { Product } from '../domain/product';
import { ReportBugUseCase, type ReportBugInput } from './report-bug.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup {
    fx: PortalFixture;
    product: Product;
    other: Product;
    agent: Agent;
    useCase: ReportBugUseCase;
    input: ReportBugInput;
}

function setup(): Setup {
    const fx = createPortalFixture();
    const product = fx.catalog.addProduct('crm', 'CRM');
    const other = fx.catalog.addProduct('erp', 'ERP');
    const agent = fx.catalog.addAgent('crm', 'helper', 'Помощник');
    const useCase = new ReportBugUseCase(
        fx.bugs,
        fx.catalog,
        fx.bugQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const input = {
        actorId: 'author',
        roles: ['user'],
        title: '  Не работает  ',
        description: 'Описание',
        productId: product.id,
        agentId: agent.id,
    };
    return { fx, product, other, agent, useCase, input };
}

describe('ReportBugUseCase', () => {
    it('сохраняет баг open и возвращает вид без действий для автора', async () => {
        const { fx, useCase, input, product, agent } = setup();
        const view = await useCase.execute(input);
        expect(view).toMatchObject({
            title: 'Не работает',
            status: 'open',
            product: { id: product.id, name: 'CRM' },
            agent: { id: agent.id, name: 'Помощник' },
            nextStatuses: [],
        });
        expect(fx.bugs.byId.get(view.id)?.authorId).toBe('author');
        expect(fx.catalog.sharedIds).toEqual([agent.id]);
    });

    it('публикует BugReportedEvent с названиями продукта и агента в транзакции', async () => {
        const { fx, useCase, input } = setup();
        const view = await useCase.execute(input);
        const [event] = fx.events.published;
        expect(event).toBeInstanceOf(BugReportedEvent);
        expect(event).toMatchObject({
            bugId: view.id,
            authorId: 'author',
            title: 'Не работает',
            productName: 'CRM',
            agentName: 'Помощник',
        });
        expect(fx.events.publishedInTransaction).toEqual([true]);
    });

    it('неизвестный агент даёт AgentNotFoundError', async () => {
        const { useCase, input } = setup();
        await expect(useCase.execute({ ...input, agentId: 'nope' })).rejects.toBeInstanceOf(
            AgentNotFoundError,
        );
    });

    it('архивный агент даёт AgentArchivedError', async () => {
        const { fx, useCase, input, agent } = setup();
        agent.archive(fx.clock.now());
        await expect(useCase.execute(input)).rejects.toBeInstanceOf(AgentArchivedError);
        expect(fx.bugs.byId.size).toBe(0);
    });

    it('неизвестный продукт даёт ProductNotFoundError', async () => {
        const { useCase, input } = setup();
        await expect(useCase.execute({ ...input, productId: 'nope' })).rejects.toBeInstanceOf(
            ProductNotFoundError,
        );
    });

    it('неизвестный агент даёт AgentNotFoundError', async () => {
        const { useCase, input } = setup();
        await expect(useCase.execute({ ...input, agentId: 'x' })).rejects.toBeInstanceOf(
            AgentNotFoundError,
        );
    });

    it('агент не из продукта даёт AgentNotInProductError', async () => {
        const { fx, useCase, input, other } = setup();
        await expect(useCase.execute({ ...input, productId: other.id })).rejects.toBeInstanceOf(
            AgentNotInProductError,
        );
        expect(fx.bugs.byId.size).toBe(0);
        expect(fx.events.published).toEqual([]);
    });

    it('пустой заголовок даёт ArgumentInvalidError', async () => {
        const { fx, useCase, input } = setup();
        await expect(useCase.execute({ ...input, title: '   ' })).rejects.toBeInstanceOf(
            ArgumentInvalidError,
        );
        expect(fx.bugs.byId.size).toBe(0);
    });

    it('ошибка публикации откатывает вставку', async () => {
        const { fx, useCase, input } = setup();
        fx.events.publish = () => Promise.reject(new Error('outbox down'));
        await expect(useCase.execute(input)).rejects.toThrow('outbox down');
        expect(fx.bugs.byId.size).toBe(0);
    });
});
