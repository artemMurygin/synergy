/** Продукт каталога. Заводится только сидером, поведения нет. */
export interface Product {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
}
