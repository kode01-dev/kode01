import { getServerSideSitemap } from 'next-sitemap'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace'

export async function GET() {
    const supabase = await createClient()
    const siteUrl = 'https://kode01.com'

    const { data: recapPosts } = await supabase
        .from('ai_recap_posts')
        .select('locale, slug, published_at, created_at')
        .eq('is_published', true)

    const { data: editorialPosts } = await supabase
        .from('editorial_posts')
        .select('locale, slug, published_at, created_at')
        .eq('status', 'published')

    const { data: products } = PUBLIC_MARKETPLACE_ENABLED
        ? await supabase
            .from('products')
            .select('slug, updated_at, created_at, is_bundle')
            .eq('status', 'published')
            .limit(5000)
        : { data: null }

    const { data: creators } = PUBLIC_MARKETPLACE_ENABLED
        ? await supabase
            .from('profiles')
            .select('slug, updated_at, created_at')
            .in('role', ['seller', 'admin'])
            .not('slug', 'is', null)
            .limit(5000)
        : { data: null }

    const fields: { loc: string; lastmod: string; changefreq: 'weekly'; priority: number }[] = []
    const locales = ['en', 'fr']

    if (recapPosts) {
        recapPosts.forEach(item => {
            if (!item.locale || !item.slug) return
            fields.push({
                loc: `${siteUrl}/${item.locale}/news/${item.slug}`,
                lastmod: new Date(item.published_at || item.created_at || new Date()).toISOString(),
                changefreq: 'weekly',
                priority: 0.7,
            })
        })
    }

    if (editorialPosts) {
        editorialPosts.forEach(item => {
            fields.push({
                loc: `${siteUrl}/${item.locale}/blog/${item.slug}`,
                lastmod: new Date(item.published_at || item.created_at || new Date()).toISOString(),
                changefreq: 'weekly',
                priority: 0.7,
            })
        })
    }

    if (products) {
        products.forEach(item => {
            if (!item.slug) return
            locales.forEach(locale => {
                fields.push({
                    loc: `${siteUrl}/${locale}/products/${item.slug}`,
                    lastmod: new Date(item.updated_at || item.created_at || new Date()).toISOString(),
                    changefreq: 'weekly',
                    priority: item.is_bundle ? 0.8 : 0.85,
                })
                if (item.is_bundle) {
                    fields.push({
                        loc: `${siteUrl}/${locale}/bundles/${item.slug}`,
                        lastmod: new Date(item.updated_at || item.created_at || new Date()).toISOString(),
                        changefreq: 'weekly',
                        priority: 0.8,
                    })
                }
            })
        })
    }

    if (creators) {
        creators.forEach(item => {
            if (!item.slug) return
            locales.forEach(locale => {
                fields.push({
                    loc: `${siteUrl}/${locale}/creators/${item.slug}`,
                    lastmod: new Date(item.updated_at || item.created_at || new Date()).toISOString(),
                    changefreq: 'weekly',
                    priority: 0.75,
                })
            })
        })
    }

    return getServerSideSitemap(fields)
}
