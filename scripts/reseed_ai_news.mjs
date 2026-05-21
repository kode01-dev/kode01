import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Starting seed process...');

    console.log('Clearing existing data...');
    await supabase.from('ai_recap_newsletter_dispatches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ai_recap_posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ai_recap_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ai_recap_editions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ai_recap_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Inserting new edition...');

    const { data: runData, error: runErr } = await supabase.from('ai_recap_runs').insert({
        edition_key: '2026-03-05',
        trigger_type: 'manual',
        status: 'succeeded',
        started_at: '2026-03-05T08:50:00Z',
        finished_at: '2026-03-05T08:55:00Z'
    }).select('id').single();

    if (runErr) throw runErr;

    const { data: editionData, error: edErr } = await supabase.from('ai_recap_editions').insert({
        edition_key: '2026-03-05',
        status: 'published',
        week_start: '2026-03-02',
        week_end: '2026-03-08',
        run_id: runData.id,
        published_at: '2026-03-05T09:00:00Z'
    }).select('id').single();

    if (edErr) throw edErr;

    const enPost = {
        edition_id: editionData.id,
        locale: 'en',
        slug: 'ai-news-work-impact-march-2026',
        title: 'AI Is Disrupting Work More Slowly — and More Unequally — Than Feared',
        intro: 'Anthropic releases the first labor-market impact measure grounded in real AI usage data. The headline finding: no mass unemployment yet — but a quiet hiring slowdown for young workers entering exposed fields.',
        excerpt: 'Anthropic releases the first labor-market impact measure grounded in real AI usage data. The headline finding: no mass unemployment yet — but a quiet hiring slowdown for young workers entering exposed fields.',
        is_published: true,
        published_at: '2026-03-05T09:00:00Z',
        content_markdown: `Anthropic releases the first labor-market impact measure grounded in real AI usage data, and the results are surprising: no wave of unemployment, but a silent pressure on the entry of young people into certain professions.

### 30-SECOND BRIEFING
* **No detectable unemployment surge.** Workers in the most AI-exposed occupations show no statistically significant rise in unemployment since late 2022.
* **But young workers are hitting a wall.** The job-finding rate for 22–25 year-olds entering high-exposure occupations has dropped roughly 14% compared to pre-ChatGPT levels.
* **Theoretical AI potential dwarfs actual deployment.** AI covers only 33% of theoretically automatable tasks in Computer & Math roles. The disruption curve is still ahead of us.

### 1. Why Existing AI Risk Measures Fall Short
Most AI labor market research has asked a single question: « could AI theoretically perform this task? » If yes, the worker is considered « exposed ». This approach, popularized by the study Eloundou et al. (2023), is clear — but it conflates potential with reality.

Anthropic proposes a methodological break with its « observed exposure » indicator: instead of asking if a task could be automated, researchers look at whether it actually is — by crossing real Claude usage data with O*NET's professional task catalogs.

💡 **The gap between what AI can do and what it actually does creates a dangerous blind spot: public policy is calibrated to an overstated near-term threat — while potentially underestimating the long-term trajectory.**

### 2. The Methodology: Three Sources, One Clearer Picture
The study combines three distinct sets of data:
1. **Source 1:** O*NET base — ~800 U.S. occupations with task details.
2. **Source 2:** Claude usage data (Anthropic Economic Index, August & November 2025).
3. **Source 3:** Theoretical exposure Eloundou et al. 2023 (score β: 0, 0.5 or 1).

**Key Innovation:** Weighting: automated use cases count more than augmentative ones; professional contexts count more than personal use.

**Validation:** 97% of tasks observed in usage data fall into categories theoretically feasible according to Eloundou et al. — proof that the model does not over-count marginal uses.

### 3. The Deployment Gap: Vast Potential, Limited Reality
The result is a striking gap between what AI could do and what it does. In Computer & Math occupations, 94% of tasks are theoretically realizable by an LLM. But observed Claude usage covers only 33% of these tasks.

**Theoretical vs Observed Coverage:**
* Computer & Math (theoretical) ██████████████████████████████████████░░ 94%
* Computer & Math (observed)    █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 33%
* Office & Admin (theoretical)  ████████████████████████████████████░░░░ 90%
* Office & Admin (observed)     █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 22%
* Personal Service (observed)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

### 4. Who's Most Exposed — and It's Not Who You'd Expect
The ten most exposed occupations reveal an unexpected profile. Computer Programmers (75% coverage) lead, followed by Customer Service representatives and Data Entry operators (67%).

Workers in the most exposed roles are 47% better paid on average, 16 percentage points more likely to be female, and much more educated: master or doctoral degree holders represent 17.4% of the high-exposure group, compared to only 4.5% among the non-exposed — a 4 to 1 gap.

⚠️ **AI does not primarily target low-wage, low-skill work. It targets high-value cognitive routines precisely found in qualified and well-remunerated jobs.**

### 5. The Reassuring Headline: No Unemployment Surge
Analysis of U.S. Current Population Survey (CPS) data shows something reassuring: since ChatGPT's release in late 2022, the unemployment rate of the most AI-exposed workers has not increased significantly compared to less exposed workers.

📊 **Absence of proof is not proof of absence. The framework is designed to be updated regularly. The coming quarters could tell a different story.**

### 6. The Concerning Signal: Young Workers Are Being Locked Out
While employees in place seem protected, the situation is more concerning for those seeking to enter the market. The study documents a 14% drop in the job-finding rate for 22–25 year-olds in high-exposure occupations compared to 2022.

Firms are slowing junior hiring where AI can absorb part of the entry-level workload. Young graduates in computer science or analysis find that positions that existed three years ago have disappeared — not because staff is shrinking, but because hiring is slowing.

### 7. What the Coverage Missed
Most coverage focused on the reassuring absence of mass unemployment. But two angles were underreported:
1. **BLS Convergence:** Bureau of Labor Statistics projections independently show weaker growth in AI-exposed occupations.
2. **Gender Disparity:** High-exposure occupations are 16 points more female. If AI impact intensifies, it will have a non-neutral gender effect.

### 8. Limitations Worth Knowing
* **U.S.-only data:** dynamics may differ in Europe.
* **Single-model coverage:** results rely on Claude data only.
* **Theoretical base dated 2023:** capacities have evolved.
* **Invisible transitions:** youth pivoting to other sectors remain unmeasured.

### 9. Open Questions
* What happens to recent graduates?
* Will disruption be gradual or sudden?
* What role for public policy?

---
*Based on: 'Labor market impacts of AI: A new measure and early evidence' — Anthropic Economic Research, March 5, 2026. Authors: Maxim Massenkoff & Peter McCrory.*`,
        content_json: {
            "title": "AI Is Disrupting Work More Slowly — and More Unequally — Than Feared",
            "introduction": "Anthropic releases the first labor-market impact measure grounded in real AI usage data. The headline finding: no mass unemployment yet — but a quiet hiring slowdown for young workers entering exposed fields.",
            "bigNews": {
                "name": "Labor market impacts of AI: A new measure and early evidence",
                "impact": "Researchers developed 'observed exposure' metric shifting focus from theoretical risk to actual adoption.",
                "source_url": "https://www.anthropic.com/research/labor-market-impacts"
            },
            "quickHits": [
                {
                    "topic": "75% task coverage",
                    "summary": "Computer Programmers face the highest AI-exposure.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "33% observed usage",
                    "summary": "Actual usage in Computer & Math roles vs 94% theoretical potential.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "14% hiring drop",
                    "summary": "Decrease in hiring workers aged 22-25 into high-exposure roles since 2022.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "Educational Gap",
                    "summary": "Graduate degree holders are 4x more prevalent in highly exposed groups.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                }
            ],
            "tags": ["Anthropic", "Labor Market", "AI Trends", "Economic Research"],
            "lookingAhead": "AI capabilities are advancing, adoption is spreading, and the 'observed exposure' gap is likely to narrow. The framework is designed to be updated regularly."
        }
    };

    const frPost = {
        edition_id: editionData.id,
        locale: 'fr',
        slug: 'ai-news-impact-travail-mars-2026',
        title: 'L\'IA transforme l\'emploi moins vite — et différemment — que prévu',
        intro: 'Anthropic publie la première mesure d\'impact basée sur l\'usage réel de l\'IA, et les résultats surprennent : pas de vague de chômage, mais une pression silencieuse sur l\'entrée des jeunes dans certains métiers.',
        excerpt: 'Anthropic publie la première mesure d\'impact basée sur l\'usage réel de l\'IA, et les résultats surprennent : pas de vague de chômage, mais une pression silencieuse sur l\'entrée des jeunes dans certains métiers.',
        is_published: true,
        published_at: '2026-03-05T09:00:00Z',
        content_markdown: `Anthropic publie la première mesure d'impact basée sur l'usage réel de l'IA, et les résultats surprennent : pas de vague de chômage, mais une pression silencieuse sur l'entrée des jeunes dans certains métiers.

### CE QU'IL FAUT RETENIR EN 30 SECONDES
* **Pas de vague de chômage visible.** Les travailleurs les plus exposés à l'IA n'ont pas vu leur taux de chômage augmenter depuis fin 2022.
* **Mais les jeunes frappent à des portes fermées.** Les 22-25 ans entrent 14 % moins souvent dans des emplois à forte exposition à l'IA qu'avant l'arrivée de ChatGPT.
* **Le potentiel théorique reste bien loin de la réalité.** L'IA ne couvre que 33 % des tâches informatiques théoriquement automatisables. Le choc est encore devant nous.

### 1. Pourquoi les mesures actuelles du risque IA sont-elles trompeuses ?
Depuis l'émergence des grands modèles de langage, la recherche sur l'emploi s'est souvent appuyée sur une question simple : « L'IA peut-elle théoriquement réaliser cette tâche ? » Si oui, le travailleur concerné est considéré comme « exposé ». Cette approche, popularisée par l'étude Eloundou et al. (2023), a le mérite de la clarté — mais elle confond potentiel et réalité.

Anthropic propose une rupture méthodologique avec son indicateur d'« exposition observée » : au lieu de se demander si une tâche pourrait être automatisée, les chercheurs regardent si elle l'est effectivement — en croisant les données d'usage réel de Claude avec les catalogues de tâches professionnelles de l'O*NET.

💡 **L'écart entre ce que l'IA peut faire et ce qu'elle fait réellement crée un angle mort dangereux : les politiques d'accompagnement sont calibrées sur un risque surestimé à court terme, mais peut-être sous-estimé à long terme.**

### 2. La méthodologie : trois sources, une image plus honnête
L'étude croise trois ensembles de données distincts :
1. **Source 1 :** Base O*NET — ~800 métiers américains avec détail des tâches.
2. **Source 2 :** Données d'usage réel de Claude (Anthropic Economic Index, août & novembre 2025).
3. **Source 3 :** Estimations d'exposition théorique d'Eloundou et al. (2023) (score β : 0, 0.5 ou 1).

**Innovation clé :** Pondération : les usages automatisés (tâches déléguées entièrement à l'IA) comptent davantage que les usages augmentatifs (l'IA comme assistant).

**Validation :** 97 % des tâches observées tombent dans des catégories théoriquement faisables selon Eloundou et al. — preuve que le modèle ne sur-compte pas des usages marginaux.

### 3. L'écart saisissant entre potentiel et réalité
Le résultat le plus frappant de l'étude est cet abîme entre ce que l'IA pourrait faire et ce qu'elle fait. Dans les métiers de l'informatique et des mathématiques, 94 % des tâches sont théoriquement réalisables par un LLM. Mais l'usage observé de Claude ne couvre que 33 % de ces tâches.

**Couverture observée vs potentiel théorique :**
* Informatique & Mathématiques (théorique) ██████████████████████████████████████░░ 94%
* Informatique & Mathématiques (réel)      █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 33%
* Bureau & Administration (théorique)      ████████████████████████████████████░░░░ 90%
* Bureau & Administration (réel)           █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 22%
* Services à la personne (réel)            ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

### 4. Quels métiers sont vraiment dans le viseur ?
Les dix métiers les plus exposés révèlent un profil inattendu. Les programmeurs informatiques arrivent en tête avec 75 % de couverture. Suivent les représentants du service client et les opérateurs de saisie de données (67 %).

⚠️ **L'IA ne menace pas d'abord les emplois à bas salaires. Elle cible les tâches cognitives répétitives à haute valeur formelle — rédaction, codage, traitement de données structurées — qui se trouvent précisément dans des emplois qualifiés et bien rémunérés.**

### 5. La bonne nouvelle : pas de vague de chômage — pour l'instant
L'analyse des données de l'Enquête auprès de la population actuelle (CPS) américaine montre quelque chose de rassurant : depuis la sortie de ChatGPT fin 2022, le taux de chômage des travailleurs les plus exposés à l'IA n'a pas augmenté de façon statistiquement significative.

📊 **Absence de preuve n'est pas preuve d'absence. Le cadre analytique est conçu pour être mis à jour régulièrement. Les prochains trimestres pourraient raconter une histoire différente.**

### 6. Le signal inquiétant : les jeunes n'entrent plus
Si les employés en poste semblent protégés pour l'instant, la situation est plus préoccupante pour ceux qui cherchent à entrer sur le marché du travail. L'étude documente une baisse de 14 % du taux d'embauche des 22-25 ans dans les métiers à forte exposition à l'IA, par rapport à 2022.

L'interprétation la plus probable : les entreprises ralentissent le recrutement junior dans les fonctions où l'IA peut prendre en charge une partie des tâches d'entrée de gamme.

### 7. Ce que les médias n'ont pas dit
1. **Convergence BLS :** L'étude valide implicitement que les projections du BLS anticipent déjà des croissances d'emploi plus faibles dans les métiers exposés.
2. **Disparité de genre :** Les métiers les plus exposés sont 16 points plus féminins. Si l'impact s'intensifie, il aura un effet de genre non-neutre.

### 8. Les limites honnêtes de l'étude
* **Données américaines uniquement :** la dynamique peut différer en Europe.
* **Usage limité à Claude :** ne capture pas GPT-4, Gemini, etc.
* **Base théorique datant de 2023 :** les capacités ont évolué.
* **Transitions invisibles :** les jeunes qui se réorientent n'apparaissent pas dans les stats de chômage.

### 9. Questions encore ouvertes
* Qu'arrive-t-il aux diplômés récents ?
* L'effet sera-t-il graduel ou soudain ?
* Quel rôle pour la politique publique ?

---
*D'après : 'Labor market impacts of AI: A new measure and early evidence' — Anthropic Economic Research, 5 mars 2026. Auteurs : Maxim Massenkoff & Peter McCrory.*`,
        content_json: {
            "title": "L'IA transforme l'emploi moins vite — et différemment — que prévu",
            "introduction": "Anthropic publie la première mesure d'impact basée sur l'usage réel de l'IA, et les résultats surprennent : pas de vague de chômage, mais une pression silencieuse sur l'entrée des jeunes dans certains métiers.",
            "bigNews": {
                "name": "Labor market impacts of AI: A new measure and early evidence",
                "impact": "Pas de vague de chômage visible, mais une baisse de 14 % de l'embauche des 22-25 ans dans les métiers exposés.",
                "source_url": "https://www.anthropic.com/research/labor-market-impacts"
            },
            "quickHits": [
                {
                    "topic": "75 % de couverture",
                    "summary": "Les programmeurs informatiques sont le métier le plus exposé.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "33 % d'usage réel",
                    "summary": "Usage réel en informatique vs 94 % de potentiel théorique.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "Baisse de 14 %",
                    "summary": "Chute de l'embauche des 22-25 ans dans les métiers IA-exposés.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                },
                {
                    "topic": "4x plus de diplômés",
                    "summary": "Les diplômés bac+5 sont beaucoup plus présents dans les métiers très exposés.",
                    "source_url": "https://www.anthropic.com/research/labor-market-impacts"
                }
            ],
            "tags": ["Anthropic", "Marché du Travail", "Tendances IA", "Recherche Économique"],
            "lookingAhead": "Les capacités de l'IA progressent, son adoption s'accélère, et l'écart d'« exposition observée » devrait se réduire. Ce cadre d'analyse est conçu pour être mis à jour régulièrement."
        }
    };

    const { error: postErr } = await supabase.from('ai_recap_posts').insert([enPost, frPost]);
    if (postErr) throw postErr;

    console.log('Successfully inserted new AI Recap edition and posts!');
}

run().catch(console.error);
