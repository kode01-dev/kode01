# Scenarios de Stress Test - Kode01

Ce document decrit les scenarios de test utilises pour evaluer la resilience de la plateforme.

## 1. Decouverte Marketplace (lecture intensive)

- **Cible**: `/api/market/list`
- **Objectif**: Simuler une vague d'utilisateurs parcourant les produits.
- **Ramping**: 2 -> 10 -> 40 connexions simultanees.
- **Points de vigilance**: Latence des filtres, facettes et lectures produits.

## 2. Recherche Marketplace (calcul intensif)

- **Cible**: `/api/market/list?q=...`
- **Objectif**: Tester la performance de la recherche textuelle (FTS Supabase).
- **Ramping**: 2 -> 10 -> 20 connexions simultanees.
- **Points de vigilance**: CPU de la base de donnees pendant les scans d'index.

## 3. Flux Actualites / News (cache et data fetching)

- **Cible**: `/api/news/list`
- **Objectif**: Simuler une forte demande sur les derniers articles AI.
- **Ramping**: 5 -> 20 -> 50 connexions simultanees.
- **Points de vigilance**: Performance du caching Next.js et debit reseau.

## Limites Theoriques

- **Supabase**: Le tier gratuit limite a environ 60 connexions simultanees. Au-dela, des erreurs `500` sont attendues si le pooling n'est pas configure.
- **Vercel/Next.js**: Timeout possible au-dela de 10s pour les Server Components complexes.
