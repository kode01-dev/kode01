import { Loader2, Pencil } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type {
  CategoryItem,
  MarketTaxonomyTranslator,
  SubcategoryFormState,
  SubcategoryItem,
} from './market-taxonomy-types';

interface SubcategoryManagementCardProps {
  t: MarketTaxonomyTranslator;
  isLoading: boolean;
  totalSubcategoryProducts: number;
  categories: CategoryItem[];
  subcategories: SubcategoryItem[];
  categoryById: Map<string, CategoryItem>;
  editingSubcategoryId: string | null;
  subcategoryForm: SubcategoryFormState;
  setSubcategoryForm: Dispatch<SetStateAction<SubcategoryFormState>>;
  saveSubcategory: () => Promise<void>;
  resetSubcategoryForm: () => void;
  startSubcategoryEdit: (subcategory: SubcategoryItem) => void;
  toggleSubcategoryActive: (subcategory: SubcategoryItem) => Promise<void>;
}

export function SubcategoryManagementCard({
  t,
  isLoading,
  totalSubcategoryProducts,
  categories,
  subcategories,
  categoryById,
  editingSubcategoryId,
  subcategoryForm,
  setSubcategoryForm,
  saveSubcategory,
  resetSubcategoryForm,
  startSubcategoryEdit,
  toggleSubcategoryActive,
}: SubcategoryManagementCardProps): React.JSX.Element {
  return (
    <Card className="border-none shadow-sm ring-1 ring-black/5 bg-white">
      <CardHeader>
        <CardTitle className="text-lg">{t('subcategories.title')}</CardTitle>
        <p className="text-sm text-kode01-noir/60">{t('subcategories.description')}</p>
        <p className="text-xs text-kode01-noir/50">{t('overview.total_subcategory_products', { count: totalSubcategoryProducts })}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={subcategoryForm.category_id}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, category_id: event.target.value }))}
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          >
            <option value="">{t('subcategories.fields.category_id')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_en} ({category.slug})
              </option>
            ))}
          </select>
          <Input
            value={subcategoryForm.slug}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, slug: event.target.value }))}
            placeholder={t('subcategories.fields.slug')}
            disabled={Boolean(editingSubcategoryId)}
          />
          <Input
            value={subcategoryForm.name_en}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, name_en: event.target.value }))}
            placeholder={t('subcategories.fields.name_en')}
          />
          <Input
            value={subcategoryForm.name_fr}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, name_fr: event.target.value }))}
            placeholder={t('subcategories.fields.name_fr')}
          />
          <Input
            value={subcategoryForm.description_en}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, description_en: event.target.value }))}
            placeholder={t('subcategories.fields.description_en')}
          />
          <Input
            value={subcategoryForm.description_fr}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, description_fr: event.target.value }))}
            placeholder={t('subcategories.fields.description_fr')}
          />
          <Input
            value={subcategoryForm.display_order}
            onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, display_order: event.target.value }))}
            type="number"
            min={0}
            placeholder={t('subcategories.fields.display_order')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-kode01-sauge/20 px-3 py-2 text-xs font-semibold text-kode01-noir/75">
            <input
              type="checkbox"
              checked={subcategoryForm.is_active}
              onChange={(event) => setSubcategoryForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              className="h-4 w-4"
            />
            {t('subcategories.fields.is_active')}
          </label>
          <Button
            type="button"
            onClick={() => void saveSubcategory()}
            disabled={
              isLoading
              || subcategoryForm.category_id.trim().length === 0
              || subcategoryForm.name_en.trim().length === 0
              || subcategoryForm.name_fr.trim().length === 0
              || (!editingSubcategoryId && subcategoryForm.slug.trim().length === 0)
            }
            className="rounded-full text-xs font-bold uppercase tracking-widest"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editingSubcategoryId ? t('actions.save') : t('actions.add')}
          </Button>
          {editingSubcategoryId && (
            <Button type="button" variant="outline" onClick={resetSubcategoryForm} disabled={isLoading} className="rounded-full text-xs font-bold uppercase tracking-widest">
              {t('actions.cancel')}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-kode01-sauge/20">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-kode01-sauge/20 bg-kode01-sauge/5">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                <th className="px-3 py-2">{t('subcategories.table.slug')}</th>
                <th className="px-3 py-2">{t('subcategories.table.category')}</th>
                <th className="px-3 py-2">{t('subcategories.table.names')}</th>
                <th className="px-3 py-2">{t('subcategories.table.order')}</th>
                <th className="px-3 py-2">{t('subcategories.table.status')}</th>
                <th className="px-3 py-2">{t('subcategories.table.published_products')}</th>
                <th className="px-3 py-2">{t('subcategories.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {subcategories.map((subcategory) => (
                <tr key={subcategory.id} className="border-b border-kode01-sauge/10 align-top">
                  <td className="px-3 py-2 text-xs font-semibold text-kode01-noir/80">{subcategory.slug}</td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">
                    {categoryById.get(subcategory.category_id)?.name_en ?? subcategory.category_id}
                  </td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">
                    <p className="font-semibold">EN: {subcategory.name_en}</p>
                    <p>FR: {subcategory.name_fr}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">{subcategory.display_order}</td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    <span className={subcategory.is_active ? 'text-emerald-700' : 'text-kode01-noir/45'}>
                      {subcategory.is_active ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-kode01-noir/75">{subcategory.published_products_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startSubcategoryEdit(subcategory)} disabled={isLoading} className="rounded-full text-xs">
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void toggleSubcategoryActive(subcategory)} disabled={isLoading} className="rounded-full text-xs">
                        {subcategory.is_active ? t('actions.deactivate') : t('actions.activate')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {subcategories.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-kode01-noir/50">
                    {t('subcategories.empty')}
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
