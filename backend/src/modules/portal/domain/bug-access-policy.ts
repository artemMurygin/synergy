export interface PolicyBug {
    authorId: string;
}

export interface BugPolicyActor {
    id: string;
    roles: readonly string[];
}

/** Доступ к багу и его комментариям: автор или `developer`. */
export const BugAccessPolicy = {
    canView(bug: PolicyBug, actor: BugPolicyActor): boolean {
        return bug.authorId === actor.id || actor.roles.includes('developer');
    },
} as const;
