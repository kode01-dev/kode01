---
trigger: glob
globs: lint
---

À chaque tâche de code, exécute `npm run lint` avant de conclure.
Si le lint retourne la moindre erreur ou warning, corrige le code immédiatement et relance `npm run lint`.
Répète jusqu’à obtenir un exit code 0.
Ne termine jamais la tâche tant que `npm run lint` n’est pas vert.
