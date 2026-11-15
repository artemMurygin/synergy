export interface PolicyRequest {
    authorId: string;
}

export interface PolicyActor {
    id: string;
    roles: readonly string[];
}

/** Единое правило доступа к заявке и её комментариям: автор или `developer`. */
export const RequestAccessPolicy = {
    canView(request: PolicyRequest, actor: PolicyActor): boolean {
        return request.authorId === actor.id || actor.roles.includes('developer');
    },
} as const;
