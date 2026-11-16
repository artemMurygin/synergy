/** Метка автора комментария: автор бага или любой другой (разработчик). */
export type BugCommentAuthorRole = 'bug_author' | 'developer';

/** Read-модель комментария к багу; `authorId` нужен для расчёта `canEdit`. */
export interface BugCommentRecord {
    id: string;
    authorId: string;
    body: string;
    /** ФИО по правилам employee-directory, без ФИО — логин. */
    author: { id: string; login: string; fullName: string };
    authorRole: BugCommentAuthorRole;
    createdAt: Date;
    editedAt: Date | null;
}

export abstract class BugCommentQuery {
    /** Лента бага: `ORDER BY created_at, id`. */
    abstract listByBug(bugId: string): Promise<BugCommentRecord[]>;
    abstract findView(id: string): Promise<BugCommentRecord | null>;
}
