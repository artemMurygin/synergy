/** Метка автора комментария: автор заявки или любой другой (разработчик). */
export type CommentAuthorRole = 'request_author' | 'developer';

/** Read-модель комментария; `authorId` нужен для расчёта `canEdit`. */
export interface CommentRecord {
    id: string;
    authorId: string;
    body: string;
    /** ФИО по правилам employee-directory, без ФИО — логин. */
    author: { id: string; login: string; fullName: string };
    authorRole: CommentAuthorRole;
    createdAt: Date;
    editedAt: Date | null;
}

export abstract class CommentQuery {
    /** Лента заявки: `ORDER BY created_at, id`; чужие заявки не попадают. */
    abstract listByRequest(requestId: string): Promise<CommentRecord[]>;
    abstract findView(id: string): Promise<CommentRecord | null>;
}
