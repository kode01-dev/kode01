export type ProductCategoryMenuRow = {
    id: string;
    slug: string;
    name_en: string;
    name_fr: string;
    display_order: number;
};

export type ProductSubcategoryMenuRow = {
    id: string;
    category_id: string;
    slug: string;
    name_en: string;
    name_fr: string;
    display_order: number;
};

export type ProductTaxonomyUsageRow = {
    category_id: string | null;
    subcategory_id: string | null;
};

export type TaxonomyLabelItem = {
    name_fr?: string | null;
    name_en?: string | null;
    slug: string;
};
