export interface PaginatedListState<T> {
    items: T[];
    loading: boolean;
    loadingMore: boolean;
    total: number;
    hasMore: boolean;
    offset: number;
}
