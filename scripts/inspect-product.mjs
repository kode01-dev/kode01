import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
    const slug = 'saas-ui-kit-figma';
    console.log(`Inspecting product: ${slug}`);

    const { data: product, error } = await supabase
        .from('products')
        .select(`
            id,
            seller_id,
            profiles (
                id,
                display_name,
                shop_name,
                avatar_url
            )
        `)
        .eq('slug', slug)
        .single();

    if (error) {
        console.error("Error fetching product:", error);
        return;
    }

    console.log("Product Data:");
    console.log(JSON.stringify(product, null, 2));

    if (!product.profiles) {
        console.log("WARNING: profiles join returned null!");
        
        // Check if the seller_id exists in profiles
        const { data: profile, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', product.seller_id)
            .maybeSingle();
            
        if (pError) {
            console.error("Error fetching profile directly:", pError);
        } else if (!profile) {
            console.log(`Profile with ID ${product.seller_id} NOT FOUND in profiles table.`);
        } else {
            console.log("Profile found directly:", JSON.stringify(profile, null, 2));
        }
    }
}

inspect();
