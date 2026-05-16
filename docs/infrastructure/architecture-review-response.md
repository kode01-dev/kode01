# Reponse a l'architecture review Thiki / Kode01

Merci pour la revue. La direction generale est bonne : pour le palier growth vise,
l'architecture Vercel + Supabase + Modal est coherente, et l'approche par paliers
est la bonne. Je garde surtout le principe suivant : scaler sans reecrire, en
traitant d'abord les points qui peuvent casser en production.

Cela dit, la revue semble partiellement datee par rapport a l'etat actuel du repo.
Je separerais donc les constats en trois groupes : confirme, deja traite ou a
verifier en prod, et a requalifier.

## Constats confirmes

- Il y a bien une surface RLS importante : 244 policies dans les migrations. C'est
  un sujet de performance et de maintenabilite a suivre avec `pg_stat_statements`,
  pas seulement par inspection statique.
- Le cron `abandoned-carts` a ete decouple : il enfile maintenant des jobs dans
  `abandoned_cart_email_jobs`, et l'envoi Resend est porte par le worker
  `abandoned-cart-emails`.
- L'observabilite applicative existe partiellement via le monitoring custom, mais
  il manque une vraie capture d'erreurs runtime avec source maps, type Sentry.
- Les connexions directes Postgres doivent etre auditees. Le risque ne vient pas de
  `@supabase/ssr` en lui-meme, qui passe par Supabase HTTP/PostgREST, mais des
  chemins serveur qui utilisent `postgres` / `DATABASE_URL`.
- `pg_stat_statements` doit devenir la source de verite pour prioriser les index,
  les rewrites RLS et les optimisations de requetes.

## Deja traite ou a verifier en production

- La recommandation "creer `is_admin()`" est deja partiellement couverte par la
  migration `20260624000000_rls_admin_perf_v4.sql`, qui cree
  `public.is_admin_user()` en `STABLE SECURITY DEFINER` et tente de remplacer les
  sous-requetes admin dans les policies. La bonne action est de verifier qu'elle
  est appliquee en prod et qu'il ne reste pas de policies critiques avec
  `profiles.role = 'admin'`.
- La deduplication Stripe existe deja cote Supabase Edge Function via
  `stripe_webhook_events` et un lock `processing` / `processed` / `failed`. La
  route Next.js proxy ne deduplique pas, mais l'Edge Function valide la signature
  puis acquiert le lock avant les side effects.
- Le circuit breaker existe deja sous forme de `resilientFetch`. Il ne faut pas
  ajouter un second `withCircuitBreaker.ts`; il vaut mieux factoriser autour de
  l'implementation existante.
- Supavisor est deja documente dans `docs/infrastructure/SUPAVISOR.md`. Le sujet
  restant est de confirmer que les variables runtime Vercel utilisent bien l'URL
  pooler en transaction mode pour les chemins SQL directs.

## Points a requalifier

- Je ne classerais pas Stripe idempotence comme High dans l'etat actuel. Le risque
  devient High seulement si un chemin webhook fait des side effects avant validation
  de signature ou avant acquisition du lock. A verifier par test de replay.
- Je ne presenterais pas le pooling comme un probleme global Supabase SSR. Le vrai
  risque est cible : tout usage de `postgres` / `DATABASE_URL` en runtime serverless
  doit passer par Supavisor transaction mode.
- Je remplacerais "aucune observabilite" par "observabilite custom presente, mais
  manque Sentry/source maps et correlation cross-service".
- Je ne lancerais pas QStash/Redis partout. Il faut les ajouter la ou un store
  partage ou une queue apporte un gain mesurable : rate-limit multi-instance,
  deduplication distribuee, fan-out email, crons decoupes.

## Stripe : position corrigee

Pour Stripe, la sequence correcte est :

1. Recevoir le payload brut et la signature.
2. Valider la signature Stripe.
3. Recuperer `event.id`.
4. Acquerir un lock idempotent sur `stripe_webhook_events`.
5. Executer les side effects une seule fois.
6. Marquer l'event `processed` ou `failed`.

Il ne faut pas dedupliquer un webhook entrant avant validation de signature, car
cela permettrait a un payload non authentifie de polluer l'etat d'idempotence.
L'approche actuelle, avec dedup cote Edge Function apres verification Stripe, est
le bon niveau minimal. Les ameliorations prioritaires sont donc des tests de replay,
une meilleure documentation des etats `processing` / `processed` / `failed`, et une
verification separee des flows Checkout / Connect.

## Roadmap revisee

### 0-7 jours

- Verifier la prod DB : presence de `public.is_admin_user()`, policies restantes
  avec `role = 'admin'`, top 20 `pg_stat_statements`.
- Rejouer le meme webhook Stripe deux fois et verifier qu'aucun achat, email,
  licence ou entitlement n'est cree deux fois.
- Auditer tous les usages `postgres` / `DATABASE_URL` et confirmer qu'ils passent
  par l'URL Supavisor pooler en runtime serverless.
- Ajouter Sentry avec source maps sur Vercel.
- Mesurer `abandoned-carts` et `abandoned-cart-emails` avec un volume realiste et
  des batchs eleves.

### 30 jours

- Surveiller le backlog `abandoned_cart_email_jobs`; QStash ou Modal ne deviennent
  necessaires que si le worker batch DB ne suffit plus.
- Brancher Redis/Upstash uniquement sur les chemins qui necessitent un etat partage :
  rate-limit multi-instance, locks distribues, dedup externe.
- Ajouter des alertes sur p95 API, erreurs cron, retries Stripe, connexions DB et
  taux d'echec des providers externes.
- Ajouter un test d'integration pour l'idempotence Stripe, incluant replay d'un
  event deja `processed` et reprise d'un event `failed`.

### 90 jours

- Mettre en place retention ou partitionnement pour les tables a croissance rapide.
- Faire un audit index base sur donnees reelles et `pg_stat_statements`, pas sur une
  liste theorique d'indexes.
- Decomposer les parties couteuses du proxy uniquement apres mesure du cold start et
  du cout d'invocation.
- Evaluer OTEL seulement si Sentry + logs structures ne suffisent plus a correler
  Modal, Vercel et Supabase.

## Validation attendue

- SQL : compter les policies qui utilisent encore `profiles.role = 'admin'`.
- DB perf : comparer les top queries `pg_stat_statements` avant/apres les corrections
  RLS et index.
- Stripe : rejouer le meme `event.id` deux fois et verifier
  `stripe_webhook_events.status = 'processed'` sans double side effect.
- Cron : simuler un gros volume de carts abandonnes et verifier temps de reponse,
  erreurs Resend et progression du batch.
- Pooling : suivre le graphe Supabase "Database Connections" pendant un load test.
- Observabilite : declencher une erreur volontaire en staging et verifier la stack
  trace source-mapee dans Sentry.

## Annexe : checks concrets

### RLS admin

Verifier que la fonction existe en prod :

```sql
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.provolatile AS volatility,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin_user';
```

Compter les policies qui reference encore directement le role admin dans
`profiles` :

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ILIKE '%profiles%'
    OR COALESCE(with_check, '') ILIKE '%profiles%'
  )
  AND (
    COALESCE(qual, '') ILIKE '%role%admin%'
    OR COALESCE(with_check, '') ILIKE '%role%admin%'
  )
ORDER BY tablename, policyname;
```

Verifier combien de policies utilisent le helper :

```sql
SELECT
  COUNT(*) FILTER (
    WHERE COALESCE(qual, '') ILIKE '%is_admin_user%'
       OR COALESCE(with_check, '') ILIKE '%is_admin_user%'
  ) AS policies_using_is_admin_user,
  COUNT(*) AS total_public_policies
FROM pg_policies
WHERE schemaname = 'public';
```

### pg_stat_statements

Le check rapide `npm run audit:growth` ne contacte pas la DB. Pour verifier
`pg_stat_statements` sur la base cible, utiliser `npm run audit:growth:db` quand
l'acces live DB est disponible.

Verifier que l'extension est disponible et active :

```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pg_stat_statements';
```

Lister les requetes metier les plus couteuses :

```sql
SELECT
  queryid,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
  ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
  shared_blks_read,
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 240) AS sample_query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query ~* '^(select|with|update|insert|delete)'
  AND query NOT ILIKE '%pg_catalog%'
  AND query NOT ILIKE '%information_schema%'
ORDER BY total_exec_time DESC
LIMIT 20;
```

### Stripe webhook idempotence

Verifier l'etat recent des events :

```sql
SELECT
  event_id,
  type,
  status,
  processed_at,
  error_message,
  created_at
FROM public.stripe_webhook_events
ORDER BY created_at DESC
LIMIT 50;
```

Validation attendue :

- Premier replay : l'event passe a `processed` si le traitement reussit.
- Deuxieme replay du meme `event_id` : la reponse indique un duplicate ou ne
  declenche aucun side effect metier.
- Aucun doublon dans `purchases`, `license_keys`, emails planifies ou entitlements
  pour le meme checkout/payment event.

### Connexions directes Postgres

Lister les usages directs a auditer dans le repo :

```powershell
Get-ChildItem -Path src,scripts,services,supabase -Recurse -File |
  Select-String -Pattern "postgres\(|from 'postgres'|DATABASE_URL|SUPABASE_DB_URL" |
  Select-Object Path,LineNumber,Line
```

Regle de decision :

- Runtime Vercel ou serverless : utiliser `DATABASE_URL` Supavisor transaction mode.
- Script local ponctuel : direct DB acceptable si documente et non deploye.
- Supabase JS / SSR : pas concerne par le pooler Postgres, car HTTP/PostgREST.

### Cron abandoned-carts

Le refactor Growth introduit deux etapes :

- `abandoned-carts` scanne les paniers actifs expires et cree des jobs.
- `abandoned-cart-emails` traite un batch de jobs et envoie les emails.

Mesures minimales :

- Temps de reponse pour `ABANDONED_CART_BATCH_SIZE=100`.
- Temps de reponse pour `ABANDONED_CART_BATCH_SIZE=500`.
- Temps de reponse pour `ABANDONED_CART_SEND_BATCH_SIZE=25`.
- Nombre de jobs crees, emails envoyes, skips, erreurs Resend.
- Effet sur la duree du handler quand `auth.admin.getUserById` ralentit.

Critere de decision :

- Si le backlog `abandoned_cart_email_jobs` grossit durablement, augmenter la
  frequence/batch du worker ou remplacer le worker DB par QStash/Modal.

## Conclusion

Je garde l'orientation de la revue : renforcer la DB, decoupler les crons, ajouter
une observabilite runtime, et eviter les rearchitectures prematurees. La correction
principale est la priorisation : Stripe idempotence et circuit breaker ne sont pas
des manques critiques aujourd'hui; les vrais chantiers immediats sont la verification
prod de RLS/`pg_stat_statements`, le pooling cible des connexions directes, les crons
synchrones, et Sentry.
