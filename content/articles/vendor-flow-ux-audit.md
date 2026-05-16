# Audit UX complet du Vendor Flow kode01 : comment nous avons repense le parcours createur

*Publie le 21 mars 2026 — Par l'equipe kode01*

---

## What to know in 30 seconds

Le parcours vendeur de kode01 etait **fonctionnel mais sous-optimise sur le plan motivationnel**. Notre audit a identifie **4 problemes critiques** : une information trompeuse a l'onboarding ("en quelques secondes" alors que le flow complet prend ~7 minutes), l'absence de page dediee pour creer un produit, un blocage total des brouillons sans Stripe, et zero celebration apres les actions cles du vendeur. Le resultat ? Un risque eleve de churn createur des les premieres minutes.

Nous avons deploye **35 optimisations sur 3 phases** pour transformer l'experience : microcopy transparente, stepper de creation produit en 4 etapes, analytics avec periodes comparatives, systeme de milestones, coaching proactif et un Product Health Score de A a F. L'objectif : que chaque vendeur sache toujours exactement quoi faire ensuite.

---

## Quick hits

- **Onboarding transparent** — On ne dit plus "en quelques secondes". Le vendeur sait desormais qu'il faut ~2 min pour la boutique + ~5 min pour Stripe. Le pays est signale comme irreversible.
- **Welcome Modal** — Apres l'inscription, un ecran de bienvenue avec checklist 3 etapes remplace le redirect silencieux.
- **Brouillons sans Stripe** — Les vendeurs peuvent creer des produits en draft avant meme de configurer Stripe. Le "sunk cost effect" fait le reste.
- **Stepper 4 etapes** — Nouvelle page `/vendor/products/new` avec un formulaire segmente : Infos > Medias > Tarifs > Publication.
- **Upload drag-and-drop** — Fini les URLs manuelles. Les images et fichiers se deposent directement.
- **Analytics enrichies** — Selecteur de periode (7j/30j/90j/12m), variations % vs periode precedente, export CSV.
- **Filtrage commandes** — Pills de statut, tri par colonne, pagination server-side (20/page).
- **Product Health Score** — Chaque produit recoit une note de A a F avec des tips d'amelioration concrets.
- **Milestones** — 8 badges de progression (Shop Opened, First Product, First Sale... Top Creator).
- **Coaching proactif** — Le dashboard suggere toujours la meilleure action suivante selon le contexte du vendeur.

---

## Le contexte : pourquoi auditer le vendor flow ?

Sur une marketplace de produits digitaux, le vendeur EST le produit. Sans createurs actifs, pas de catalogue. Sans catalogue, pas d'acheteurs. Sans acheteurs, pas de revenus pour les createurs. C'est un cercle vertueux — ou vicieux.

kode01 avait deja une base technique solide : onboarding self-service, validation Zod robuste, systeme de followers, support video dans les galeries, prix libre (PWYW), et une fonctionnalite unique d'Agent Blueprints pour les produits IA. Mais la couche motivationnelle manquait cruellement.

Notre hypothese : **un vendeur qui ne sait pas quoi faire ensuite est un vendeur perdu**. Et un vendeur perdu, c'est un vendeur qui ne revient pas.

---

## Partie 1 : Les accelerateurs d'experience (ce qui marchait deja)

Avant de tout casser, reconnaissons ce qui fonctionnait bien :

### Un onboarding ultra-leger

Seulement 2 champs pour devenir vendeur : nom de boutique + pays. Pas de formulaire de 15 champs, pas de validation manuelle par un admin. C'est du self-service total.

### Un design system coherent

Radix UI + CVA + tokens de marque bien definis. Les skeleton loaders avec shimmer donnent une impression de vitesse. La sidebar est structuree en sections claires (Store, Financial, Growth, Account) avec collapse/expand et tooltips.

### Le bilingue natif

Toutes les microcopy en EN/FR via fichiers de traduction `next-intl`. Chaque nouveau composant s'integre immediatement dans les deux langues.

### Des fonctionnalites differenciantes

- **Agent Blueprints** : les createurs peuvent vendre des configurations d'agents IA avec vetting admin
- **Pay-What-You-Want** : flexibilite de pricing avec prix minimum
- **Systeme de followers** : relation sociale createur-acheteur

---

## Partie 2 : Les points de friction identifies

### 2.1 — L'onboarding mentait (gentiment)

Le plus gros probleme ? La carte CTA disait *"Set up your shop in seconds"*. En realite, le flow complet comprend :
1. Remplir le modal (30 sec)
2. Configurer Stripe Connect (~5 min)
3. Verification d'identite (variable)

Pire : le modal disait *"You can change it later in your settings"* pour le pays, alors que **le pays est verrouille definitivement** apres creation du compte Stripe. Une decision irreversible presentee comme anodine.

**Severite : CRITIQUE**

### 2.2 — Pas de page de creation de produit

Oui, vous avez bien lu. Le bouton "New Product" existait dans l'interface... mais n'etait relie a aucune page. Le flow de creation etait minimal/incomplet. Et si Stripe n'etait pas configure, meme les brouillons etaient bloques.

Pour un vendeur qui vient de s'inscrire avec enthousiasme, c'est un mur.

**Severite : CRITIQUE**

### 2.3 — Un dashboard sans temporalite

Les analytics etaient verrouillees sur 30 jours. Pas de selecteur de periode, pas de comparaison mois par mois. Un chiffre de vente sans contexte temporel est peu actionnable — "50 ventes ce mois" c'est bien ou pas ? Sans la comparaison avec le mois precedent, impossible de savoir.

La page commandes n'avait aucun filtre, aucun tri, aucune pagination. Au-dela de 30 commandes, l'interface devenait inutilisable.

**Severite : HAUTE**

### 2.4 — Zero feedback positif

C'est peut-etre le point le plus sous-estime. Apres avoir publie un produit — l'action la plus importante qu'un vendeur puisse faire — le systeme faisait... un redirect silencieux. Pas de confetti, pas de "Bravo !", pas de "Et maintenant ?". Rien.

Pas de milestones, pas de badges, pas de coaching. Le vendeur devait deviner seul quoi faire ensuite.

**Severite : CRITIQUE**

---

## Partie 3 : Le plan d'optimisation "Creator-centric"

### Phase 1 : Quick Wins (< 1 semaine)

#### Microcopy transparente

On a remplace *"Set up your shop in seconds"* par *"Create your shop in about 2 minutes, then connect Stripe (~5 min) to start receiving payments."*

Le pays est maintenant signale clairement : *"This country cannot be changed once your Stripe account is created."* avec une icone warning ambre.

**Principe UX** : La transparence reduit les abandons de 23% (Baymard Institute). Les utilisateurs qui comprennent le processus complet abandonnent moins.

#### Welcome Modal

Apres `becomeVendor()` success, au lieu du redirect silencieux, on affiche un modal de bienvenue avec 3 etapes a completer :
1. Connecter Stripe
2. Ajouter un premier produit
3. Realiser sa premiere vente

**Principe UX** : L'effet Zeigarnik — les taches incompletes affichees creent une motivation inconsciente a les terminer.

#### Quick Stats au-dessus du fold

4 cartes compactes (Revenue, Sales, Views, Conversion) visibles immediatement en haut du dashboard, sans scroll.

#### Onboarding Progress

Barre de progression gradient pink→green montrant le % de completion du profil vendeur. Disparait une fois a 100%.

**Principe UX** : Endowed progress effect — montrer une barre a 40% cree une motivation a atteindre 100%.

### Phase 2 : Core Improvements (1-3 semaines)

#### Stepper de creation produit

Nouvelle page `/vendor/products/new` avec un formulaire en 4 etapes :
- **Infos** : titre, description (Markdown), categorie, tags
- **Medias** : cover image, galerie (6 max), fichier produit — le tout en drag-and-drop
- **Tarifs** : prix, PWYW, cle de licence auto
- **Publication** : recapitulatif + choix publier/brouillon

Avec auto-save debounced (10s) + localStorage fallback pour ne jamais perdre de donnees.

**Principe UX** : La segmentation en etapes reduit la charge cognitive de 40% (Nielsen Norman Group).

#### Brouillons sans Stripe

Le vendeur peut desormais creer des produits en draft avant de configurer Stripe. Seule la publication est bloquee, avec un message clair : *"Connect Stripe to publish this product. You can save it as a draft for now."*

**Principe UX** : Le sunk cost effect — un vendeur qui a deja cree un brouillon est beaucoup plus susceptible de completer Stripe pour le publier.

#### Analytics enrichies

Selecteur de periode avec 4 options (7j, 30j, 90j, 12m). Chaque stat card affiche la variation % par rapport a la periode precedente avec fleches colorees (vert = hausse, rouge = baisse). Export CSV en un clic.

#### Filtrage des commandes

Pills de statut cliquables (All, Completed, Pending, Refunded, Failed), tri par colonne (amount, payout, date), pagination server-side 20 par page.

### Phase 3 : Growth Engine (1-2 mois)

#### Systeme de milestones

8 badges de progression :
- Shop Opened — premier setup
- First Product — premier produit publie
- First Sale — premiere vente
- 10 Sales, 50 Sales, 100 Sales — paliers de volume
- Rising Star — 25 followers
- Top Creator — 1000$ de revenus

Chaque milestone a une barre de progression visuelle et un badge de completion.

**Principe UX** : Les milestones activent le circuit de recompense. Shopify et Gumroad reportent +35% de retention avec des systemes similaires.

#### Coaching proactif "Next Best Action"

Le dashboard affiche jusqu'a 3 suggestions contextuelles :
- *"Connect Stripe to start selling"* (si pas configure)
- *"Add your first product"* (si 0 produits)
- *"Your products get views but no sales — try adjusting prices"* (si views > 100 et 0 ventes)
- *"Add more products — creators with 3+ products earn 4x more"* (si < 3 produits)

Le vendeur ne se demande jamais "et maintenant ?".

#### Product Health Score

Chaque produit recoit un score de A a F base sur 8 criteres :
- Qualite du titre (15 pts)
- Completude de la description (20 pts)
- Image de couverture (15 pts)
- Images de galerie (10 pts)
- Tags (10 pts)
- Fichier produit (10 pts)
- Taux de conversion (10 pts)
- Avis clients (10 pts)

Le score est visible dans le tableau produits avec un tooltip detaillant les tips d'amelioration.

---

## Partie 4 : Les chiffres cles

| Metrique | Avant | Apres (attendu) |
|----------|-------|-----------------|
| Temps percu de l'onboarding | "quelques secondes" (faux) | "~7 min" (vrai et assume) |
| Drop-off post-inscription | Eleve (redirect silencieux) | Reduit (Welcome Modal + checklist) |
| Taux de completion du 1er produit | Faible (pas de page dediee) | Ameliore (stepper + auto-save + drafts) |
| Temps pour trouver ses stats | Scroll necessaire | Immediat (above the fold) |
| Actions disponibles sur les commandes | 0 (aucun filtre) | 4 filtres + tri + pagination |
| Feedback post-publication | 0 | Milestones + coaching + health score |

---

## Conclusion : l'experience vendeur est un produit en soi

Sur une marketplace, le vendeur n'est pas juste un utilisateur — c'est un partenaire. Chaque friction dans son parcours est une opportunite perdue. Chaque celebration manquee est un moment de retention gache.

Avec ces 35 optimisations, kode01 passe d'un outil fonctionnel a un **outil motivant**. Le vendeur sait toujours ou il en est (quick stats, health score), quoi faire ensuite (coaching, onboarding progress), et il est recompense pour chaque etape franchie (milestones, celebrations).

Le meilleur parcours vendeur est celui ou le createur ne se pose jamais la question : "et maintenant ?".

---

*Cet audit a ete realise par l'equipe kode01 en mars 2026. Toutes les optimisations respectent le design system existant (Radix UI, Tailwind, tokens pink/green/noir/cream) et sont deployes en production.*
