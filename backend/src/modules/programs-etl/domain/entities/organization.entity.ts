import { CatalogDomainError } from '../errors/catalog-domain.error';
import { type OrganizationKind, parseOrganizationKind } from '../value-objects/organization-kind';
import { requireNonBlank } from './guards';

export interface CreateOrganizationProps {
    id: string;
    kind: string;
    name: string;
    parentId?: string | null;
}

export class Organization {
    private constructor(
        readonly id: string,
        readonly kind: OrganizationKind,
        readonly name: string,
        readonly parentId: string | null,
    ) {}

    static create({ id, kind, name, parentId }: CreateOrganizationProps): Organization {
        requireNonBlank('Organization id', id);
        if (parentId === id) {
            throw new CatalogDomainError('Organization must not be its own parent');
        }
        return new Organization(
            id,
            parseOrganizationKind(kind),
            requireNonBlank('Organization name', name),
            parentId ?? null,
        );
    }
}
