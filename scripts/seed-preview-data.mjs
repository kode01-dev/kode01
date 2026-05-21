import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
);

async function seed() {
    console.log("Fetching reference data...");
    
    // 1. Get a seller
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    const sellerId = profiles?.[0]?.id;
    if (!sellerId) {
        console.error("No profiles found. Seed aborted.");
        return;
    }

    // 2. Get a category
    const { data: categories } = await supabase.from('product_categories').select('id').limit(1);
    const categoryId = categories?.[0]?.id;
    if (!categoryId) {
        console.error("No categories found. Seed aborted.");
        return;
    }

    console.log(`Using Seller: ${sellerId}, Category: ${categoryId}`);

    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const mockProducts = [
        {
            title: "Super Tool [NEW]",
            slug: `mock-new-${Date.now()}`,
            description: "An amazing new tool to test the [NEW] tag.",
            price: 49,
            is_bundle: false,
            status: 'published',
            seller_id: sellerId,
            category_id: categoryId,
            tags: ['AI', 'Tool'],
            created_at: now.toISOString(),
            content_locales: ['en', 'fr'],
            content_source_locale: 'en'
        },
        {
            title: "Premium Pack [BUNDLE]",
            slug: `mock-bundle-${Date.now()}`,
            description: "A comprehensive bundle to test the [BUNDLE] tag.",
            price: 99,
            is_bundle: true,
            status: 'published',
            seller_id: sellerId,
            category_id: categoryId,
            tags: ['Bundle', 'Premium'],
            created_at: oneMonthAgo.toISOString(),
            content_locales: ['en', 'fr'],
            content_source_locale: 'en'
        },
        {
            title: "Community Choice [POPULAR]",
            slug: `mock-popular-${Date.now()}`,
            description: "A highly rated product to test the [POPULAR] tag.",
            price: 29,
            is_bundle: false,
            status: 'published',
            seller_id: sellerId,
            category_id: categoryId,
            tags: ['Best-seller'],
            created_at: oneMonthAgo.toISOString(),
            content_locales: ['en', 'fr'],
            content_source_locale: 'en'
        }
    ];

    console.log("Inserting products...");
    const { data: inserted, error } = await supabase.from('products').insert(mockProducts).select('id');
    
    if (error) {
        console.error("Error inserting products:", error);
        return;
    }

    console.log(`Successfully inserted ${inserted.length} products.`);

    // 3. To make "Community Choice" popular, we need to mock the review stats.
    // We'll try to update product_review_stats if it exists as a table.
    const popularId = inserted[2].id;
    console.log(`Setting popular stats for product ${popularId}...`);
    
    // Check if we can upsert into product_review_stats
    const { error: statsError } = await supabase.from('product_review_stats').upsert({
        product_id: popularId,
        average_rating: 4.8,
        reviews_count: 12
    });

    if (statsError) {
        console.log("Note: Could not upsert directly into product_review_stats (might be a view or restricted). Skipping stats mock.");
    } else {
        console.log("Successfully updated review stats for popular product.");
    }
}

seed();
