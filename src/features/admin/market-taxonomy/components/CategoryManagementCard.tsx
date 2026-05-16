import { Loader2, Pencil } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type {
  CategoryFormState,
  CategoryItem,
  MarketTaxonomyTranslator,
} from './market-taxonomy-types';

interface CategoryManagementCardProps {
  t: MarketTaxonomyTranslator;
  isLoading: boolean;
  totalCategoryProducts: number;
  categories: CategoryItem[];
  editingCategoryId: string | null;
  categoryForm: CategoryFormState;
  setCategoryForm: Dispatch<SetStateAction<CategoryFormState>>;
  saveCategory: () => Promise<void>;
  resetCategoryForm: () => void;
  startCategoryEdit: (category: CategoryItem) => void;
  toggleCategoryActive: (category: CategoryItem) => Promise<void>;
}

export function CategoryManagementCard({
  t,
  isLoading,
  totalCategoryProducts,
  categories,
  editingCategoryId,
  categoryForm,
  setCategoryForm,
  saveCategory,
  resetCategoryForm,
  startCategoryEdit,
  toggleCategoryActive,
}: CategoryManagementCardProps): React.JSX.Element {
  return (
    <Card className="border-none shadow-sm ring-1 ring-black/5 bg-white">
      <CardHeader>
        <CardTitle className="text-lg">{t('categories.title')}</CardTitle>
        <p className="text-sm text-kode01-noir/60">{t('categories.description')}</p>
        <p className="text-xs text-kode01-noir/50">{t('overview.total_category_products', { count: totalCategoryProducts })}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            value={categoryForm.slug}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, slug: event.target.value }))}
            placeholder={t('categories.fields.slug')}
            disabled={Boolean(editingCategoryId)}
          />
          <Input
            value={categoryForm.display_order}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, display_order: event.target.value }))}
            type="number"
            min={0}
            placeholder={t('categories.fields.display_order')}
          />
          <Input
            value={categoryForm.name_en}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, name_en: event.target.value }))}
            placeholder={t('categories.fields.name_en')}
          />
          <Input
            value={categoryForm.name_fr}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, name_fr: event.target.value }))}
            placeholder={t('categories.fields.name_fr')}
          />
          <Input
            value={categoryForm.description_en}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, description_en: event.target.value }))}
            placeholder={t('categories.fields.description_en')}
          />
          <Input
            value={categoryForm.description_fr}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, description_fr: event.target.value }))}
            placeholder={t('categories.fields.description_fr')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-kode01-sauge/20 px-3 py-2 text-xs font-semibold text-kode01-noir/75">
            <input
              type="checkbox"
              checked={categoryForm.is_active}
              onChange={(event) => setCategoryForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              className="h-4 w-4"
            />
            {t('categories.fields.is_active')}
          </label>
          <Button
            type="button"
            onClick={() => void saveCategory()}
            disabled={
              isLoading
              || categoryForm.name_en.trim().length === 0
              || categoryForm.name_fr.trim().length === 0
              || (!editingCategoryId && categoryForm.slug.trim().length === 0)
            }
            className="rounded-full text-xs font-bold uppercase tracking-widest"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editingCategoryId ? t('actions.save') : t('actions.add')}
          </Button>
          {editingCategoryId && (
            <Button type="button" variant="outline" onClick={resetCategoryForm} disabled={isLoading} className="rounded-full text-xs font-bold uppercase tracking-widest">
              {t('actions.cancel')}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-kode01-sauge/20">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-kode01-sauge/20 bg-kode01-sauge/5">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                <th className="px-3 py-2">{t('categories.table.slug')}</th>
                <th className="px-3 py-2">{t('categories.table.names')}</th>
                <th className="px-3 py-2">{t('categories.table.order')}</th>
                <th className="px-3 py-2">{t('categories.table.status')}</th>
                <th className="px-3 py-2">{t('categories.table.published_products')}</th>
                <th className="px-3 py-2">{t('categories.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-kode01-sauge/10 align-top">
                  <td className="px-3 py-2 text-xs font-semibold text-kode01-noir/80">{category.slug}</td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">
                    <p className="font-semibold">EN: {category.name_en}</p>
                    <p>FR: {category.name_fr}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">{category.display_order}</td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    <span className={category.is_active ? 'text-emerald-700' : 'text-kode01-noir/45'}>
                      {category.is_active ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">{category.published_products_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startCategoryEdit(category)} disabled={isLoading} className="rounded-full text-xs">
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void toggleCategoryActive(category)} disabled={isLoading} className="rounded-full text-xs">
                        {category.is_active ? t('actions.deactivate') : t('actions.activate')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-kode01-noir/50">
                    {t('categories.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
