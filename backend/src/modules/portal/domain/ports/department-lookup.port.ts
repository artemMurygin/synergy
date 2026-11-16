export abstract class DepartmentLookupPort {
    /** Подмножество `ids`, существующее в справочнике отделов (`auth_departments`). */
    abstract findExistingIds(ids: readonly string[]): Promise<string[]>;
}
