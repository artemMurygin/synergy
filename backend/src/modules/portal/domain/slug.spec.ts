import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, Slug } from './slug';

describe('Slug.fromName', () => {
    it('transliterates cyrillic names', () => {
        expect(Slug.fromName('Сверка актов', 'agent')).toBe('sverka-aktov');
    });

    it('collapses non-alphanumerics into single dashes', () => {
        expect(Slug.fromName('Веб 2.0', 'agent')).toBe('veb-2-0');
    });

    it('applies the simplified GOST 7.79-2000 B table', () => {
        expect(Slug.fromName('жхцчшщюя', 'agent')).toBe('zhkhtschshshchyuya');
        expect(Slug.fromName('съезд', 'agent')).toBe('sezd');
        expect(Slug.fromName('Йод', 'agent')).toBe('yod');
        expect(Slug.fromName('ёлка', 'agent')).toBe('elka');
        expect(Slug.fromName('мышь', 'agent')).toBe('mysh');
    });

    it('lower-cases latin and trims dashes', () => {
        expect(Slug.fromName('  --Hello, World!--  ', 'agent')).toBe('hello-world');
    });

    it('falls back when nothing is left', () => {
        expect(Slug.fromName('★★★', 'agent')).toBe('agent');
        expect(Slug.fromName('   ', 'product')).toBe('product');
    });

    it('truncates to 60 characters without a trailing dash', () => {
        const slug = Slug.fromName(`${'a'.repeat(59)} bbbbbb`, 'agent');
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith('-')).toBe(false);
        expect(Slug.fromName('a'.repeat(100), 'agent')).toBe('a'.repeat(60));
    });

    it('leaves room for a numeric suffix', () => {
        expect(MAX_SLUG_LENGTH).toBe(64);
    });
});

describe('Slug.withSuffix', () => {
    it('appends -n', () => {
        expect(Slug.withSuffix('sverka-aktov', 2)).toBe('sverka-aktov-2');
        expect(Slug.withSuffix('x', 15)).toBe('x-15');
    });
});
