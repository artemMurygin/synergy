import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { Agent } from './agent';
import { AgentArchivedError } from './errors';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');
const T2 = new Date('2026-01-03T10:00:00Z');

function newAgent(): Agent {
    return Agent.create({
        id: 'a1',
        slug: 'assistant',
        name: 'Ассистент',
        productIds: ['p1', 'p2'],
        now: T0,
    });
}

describe('Agent', () => {
    it('is created active with product ids', () => {
        const agent = newAgent();
        expect(agent.slug).toBe('assistant');
        expect(agent.name).toBe('Ассистент');
        expect(agent.productIds).toEqual(['p1', 'p2']);
        expect(agent.archivedAt).toBeNull();
        expect(agent.createdAt).toEqual(T0);
    });

    it('rejects an empty product list', () => {
        expect(() =>
            Agent.create({ id: 'a1', slug: 's', name: 'N', productIds: [], now: T0 }),
        ).toThrow(ArgumentInvalidError);
        expect(() =>
            Agent.restore({
                id: 'a1',
                slug: 's',
                name: 'N',
                productIds: [],
                archivedAt: null,
                createdAt: T0,
                updatedAt: T0,
            }),
        ).toThrow(ArgumentInvalidError);
    });

    it('archive and restore are idempotent', () => {
        const agent = newAgent();
        expect(agent.restore()).toBe(false);
        expect(agent.archive(T1)).toBe(true);
        expect(agent.archivedAt).toEqual(T1);
        expect(agent.archive(T2)).toBe(false);
        expect(agent.archivedAt).toEqual(T1);
        expect(agent.restore()).toBe(true);
        expect(agent.archivedAt).toBeNull();
        expect(agent.restore()).toBe(false);
    });

    it('ensureActive throws only for an archived agent', () => {
        const agent = newAgent();
        expect(() => {
            agent.ensureActive();
        }).not.toThrow();
        agent.archive(T1);
        expect(() => {
            agent.ensureActive();
        }).toThrow(AgentArchivedError);
    });

    it('restores from storage', () => {
        const agent = Agent.restore({
            id: 'a1',
            slug: 's',
            name: 'N',
            productIds: ['p1'],
            archivedAt: T1,
            createdAt: T0,
            updatedAt: T1,
        });
        expect(agent.archivedAt).toEqual(T1);
        expect(agent.productIds).toEqual(['p1']);
    });
});
