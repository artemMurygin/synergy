/** Агент продукта. Заводится только сидером, поведения нет. */
export interface Agent {
    readonly id: string;
    readonly productId: string;
    readonly slug: string;
    readonly name: string;
}
