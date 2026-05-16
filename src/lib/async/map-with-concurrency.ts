export async function mapWithConcurrency<TItem, TResult>(
    items: readonly TItem[],
    concurrency: number,
    worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
    if (items.length === 0) {
        return [];
    }

    const safeConcurrency = Math.max(1, Math.floor(concurrency));
    const results: TResult[] = new Array(items.length);
    let nextIndex = 0;

    async function consumeQueue() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(safeConcurrency, items.length) }, () => consumeQueue()),
    );

    return results;
}
