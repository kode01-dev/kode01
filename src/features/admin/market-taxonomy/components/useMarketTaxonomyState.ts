import { useCreate, useList, useUpdate, type HttpError } from '@refinedev/core';
import { useMemo, useState } from 'react';

import {
  MARKET_CATEGORIES_RESOURCE,
  MARKET_SUBCATEGORIES_RESOURCE,
  categoryFormDefaults,
  subcategoryFormDefaults,
  type CategoryCreatePayload,
  type CategoryItem,
  type CategoryUpdatePayload,
  type MarketTaxonomyTranslator,
  type SubcategoryCreatePayload,
  type SubcategoryItem,
  type SubcategoryUpdatePayload,
} from './market-taxonomy-types';

type StatusTone = 'idle' | 'success' | 'error';

interface UseMarketTaxonomyStateArgs {
  initialCategories: CategoryItem[];
  initialSubcategories: SubcategoryItem[];
  t: MarketTaxonomyTranslator;
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}

export function useMarketTaxonomyState({
  initialCategories,
  initialSubcategories,
  t,
}: UseMarketTaxonomyStateArgs) {
  const {
    query: categoriesQuery,
    result: { data: categories },
  } = useList<CategoryItem, HttpError>({
    resource: MARKET_CATEGORIES_RESOURCE,
    pagination: { mode: 'off' },
    queryOptions: {
      initialData: {
        data: initialCategories,
        total: initialCategories.length,
      },
    },
  });
  const {
    query: subcategoriesQuery,
    result: { data: subcategories },
  } = useList<SubcategoryItem, HttpError>({
    resource: MARKET_SUBCATEGORIES_RESOURCE,
    pagination: { mode: 'off' },
    queryOptions: {
      initialData: {
        data: initialSubcategories,
        total: initialSubcategories.length,
      },
    },
  });
  const createCategoryMutation = useCreate<CategoryItem, HttpError, CategoryCreatePayload>({
    resource: MARKET_CATEGORIES_RESOURCE,
    invalidates: ['list'],
  });
  const updateCategoryMutation = useUpdate<CategoryItem, HttpError, CategoryUpdatePayload>({
    resource: MARKET_CATEGORIES_RESOURCE,
    invalidates: ['list'],
  });
  const createSubcategoryMutation = useCreate<SubcategoryItem, HttpError, SubcategoryCreatePayload>({
    resource: MARKET_SUBCATEGORIES_RESOURCE,
    invalidates: ['list'],
  });
  const updateSubcategoryMutation = useUpdate<SubcategoryItem, HttpError, SubcategoryUpdatePayload>({
    resource: MARKET_SUBCATEGORIES_RESOURCE,
    invalidates: ['list'],
  });

  const isLoading = categoriesQuery.isFetching
    || subcategoriesQuery.isFetching
    || createCategoryMutation.mutation.isPending
    || updateCategoryMutation.mutation.isPending
    || createSubcategoryMutation.mutation.isPending
    || updateSubcategoryMutation.mutation.isPending;

  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<StatusTone>('idle');

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({ ...categoryFormDefaults });

  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null);
  const [subcategoryForm, setSubcategoryForm] = useState({ ...subcategoryFormDefaults });

  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const totalCategoryProducts = useMemo(
    () => categories.reduce((sum: number, item: CategoryItem) => sum + item.published_products_count, 0),
    [categories],
  );
  const totalSubcategoryProducts = useMemo(
    () => subcategories.reduce((sum: number, item: SubcategoryItem) => sum + item.published_products_count, 0),
    [subcategories],
  );

  const queryErrorMessage = useMemo(() => {
    const queryError = categoriesQuery.error ?? subcategoriesQuery.error;
    if (!queryError) return '';
    return getErrorMessage(queryError, t('messages.load_failed'));
  }, [categoriesQuery.error, subcategoriesQuery.error, t]);

  const resolvedStatus = status || queryErrorMessage;
  const resolvedStatusTone: StatusTone = status
    ? statusTone
    : queryErrorMessage
      ? 'error'
      : 'idle';

  async function refreshCategories() {
    const result = await categoriesQuery.refetch();
    if (result.error) {
      throw result.error;
    }
  }

  async function refreshSubcategories() {
    const result = await subcategoriesQuery.refetch();
    if (result.error) {
      throw result.error;
    }
  }

  async function refreshAll() {
    setStatus('');
    setStatusTone('idle');

    try {
      await Promise.all([refreshCategories(), refreshSubcategories()]);
    } catch (error) {
      setStatus(getErrorMessage(error, t('messages.load_failed')));
      setStatusTone('error');
    }
  }

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryForm({ ...categoryFormDefaults });
  }

  function resetSubcategoryForm() {
    setEditingSubcategoryId(null);
    setSubcategoryForm({ ...subcategoryFormDefaults });
  }

  function startCategoryEdit(category: CategoryItem) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      slug: category.slug,
      name_en: category.name_en,
      name_fr: category.name_fr,
      description_en: category.description_en ?? '',
      description_fr: category.description_fr ?? '',
      display_order: String(category.display_order),
      is_active: category.is_active,
    });
  }

  function startSubcategoryEdit(subcategory: SubcategoryItem) {
    setEditingSubcategoryId(subcategory.id);
    setSubcategoryForm({
      category_id: subcategory.category_id,
      slug: subcategory.slug,
      name_en: subcategory.name_en,
      name_fr: subcategory.name_fr,
      description_en: subcategory.description_en ?? '',
      description_fr: subcategory.description_fr ?? '',
      display_order: String(subcategory.display_order),
      is_active: subcategory.is_active,
    });
  }

  async function saveCategory() {
    setStatus('');
    setStatusTone('idle');

    try {
      const displayOrder = Number(categoryForm.display_order);
      if (editingCategoryId) {
        await updateCategoryMutation.mutateAsync({
          id: editingCategoryId,
          values: {
            name_en: categoryForm.name_en,
            name_fr: categoryForm.name_fr,
            description_en: normalizeOptionalText(categoryForm.description_en),
            description_fr: normalizeOptionalText(categoryForm.description_fr),
            display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
            is_active: categoryForm.is_active,
          },
        });
      } else {
        await createCategoryMutation.mutateAsync({
          values: {
            slug: categoryForm.slug.trim(),
            name_en: categoryForm.name_en,
            name_fr: categoryForm.name_fr,
            description_en: normalizeOptionalText(categoryForm.description_en),
            description_fr: normalizeOptionalText(categoryForm.description_fr),
            display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
            is_active: categoryForm.is_active,
          },
        });
      }

      await refreshCategories();
      resetCategoryForm();
      setStatus(editingCategoryId ? t('messages.category_updated') : t('messages.category_created'));
      setStatusTone('success');
    } catch (error) {
      setStatus(getErrorMessage(error, t('messages.save_failed')));
      setStatusTone('error');
    }
  }

  async function saveSubcategory() {
    setStatus('');
    setStatusTone('idle');

    try {
      const displayOrder = Number(subcategoryForm.display_order);
      if (editingSubcategoryId) {
        await updateSubcategoryMutation.mutateAsync({
          id: editingSubcategoryId,
          values: {
            category_id: subcategoryForm.category_id,
            name_en: subcategoryForm.name_en,
            name_fr: subcategoryForm.name_fr,
            description_en: normalizeOptionalText(subcategoryForm.description_en),
            description_fr: normalizeOptionalText(subcategoryForm.description_fr),
            display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
            is_active: subcategoryForm.is_active,
          },
        });
      } else {
        await createSubcategoryMutation.mutateAsync({
          values: {
            category_id: subcategoryForm.category_id,
            slug: subcategoryForm.slug.trim(),
            name_en: subcategoryForm.name_en,
            name_fr: subcategoryForm.name_fr,
            description_en: normalizeOptionalText(subcategoryForm.description_en),
            description_fr: normalizeOptionalText(subcategoryForm.description_fr),
            display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
            is_active: subcategoryForm.is_active,
          },
        });
      }

      await refreshSubcategories();
      resetSubcategoryForm();
      setStatus(editingSubcategoryId ? t('messages.subcategory_updated') : t('messages.subcategory_created'));
      setStatusTone('success');
    } catch (error) {
      setStatus(getErrorMessage(error, t('messages.save_failed')));
      setStatusTone('error');
    }
  }

  async function toggleCategoryActive(category: CategoryItem) {
    setStatus('');
    setStatusTone('idle');

    try {
      await updateCategoryMutation.mutateAsync({
        id: category.id,
        values: { is_active: !category.is_active },
      });
      await refreshCategories();
      setStatus(t('messages.category_updated'));
      setStatusTone('success');
    } catch (error) {
      setStatus(getErrorMessage(error, t('messages.save_failed')));
      setStatusTone('error');
    }
  }

  async function toggleSubcategoryActive(subcategory: SubcategoryItem) {
    setStatus('');
    setStatusTone('idle');

    try {
      await updateSubcategoryMutation.mutateAsync({
        id: subcategory.id,
        values: { is_active: !subcategory.is_active },
      });
      await refreshSubcategories();
      setStatus(t('messages.subcategory_updated'));
      setStatusTone('success');
    } catch (error) {
      setStatus(getErrorMessage(error, t('messages.save_failed')));
      setStatusTone('error');
    }
  }

  return {
    categories,
    subcategories,
    isLoading,
    status: resolvedStatus,
    statusTone: resolvedStatusTone,
    editingCategoryId,
    categoryForm,
    editingSubcategoryId,
    subcategoryForm,
    categoryById,
    totalCategoryProducts,
    totalSubcategoryProducts,
    setCategoryForm,
    setSubcategoryForm,
    refreshAll,
    resetCategoryForm,
    resetSubcategoryForm,
    startCategoryEdit,
    startSubcategoryEdit,
    saveCategory,
    saveSubcategory,
    toggleCategoryActive,
    toggleSubcategoryActive,
  };
}
