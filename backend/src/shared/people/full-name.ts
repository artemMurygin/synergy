export interface FullNameParts {
    readonly lastName?: string | null;
    readonly firstName?: string | null;
    readonly middleName?: string | null;
}

/**
 * Полное имя сотрудника: фамилия, имя, отчество через пробел, пустые части
 * пропускаются. Если не заполнена ни одна часть, возвращается логин.
 */
export function formatFullName(parts: FullNameParts, login: string): string {
    const joined = [parts.lastName, parts.firstName, parts.middleName]
        .map((part) => (part ?? '').trim())
        .filter((part) => part.length > 0)
        .join(' ');
    return joined.length > 0 ? joined : login;
}
