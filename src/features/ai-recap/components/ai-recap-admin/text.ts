export function getAiRecapAdminText(locale: string) {
  const isFrench = locale.toLowerCase().startsWith('fr');

  return {
    runNow: isFrench ? 'Lancer maintenant' : 'Run now',
    forceRun: isFrench ? 'Forcer' : 'Force run',
    runTest: isFrench ? 'Run test' : 'Run test',
    smokeTest: isFrench ? 'Smoke prod' : 'Prod smoke',
    editionKeyLabel: isFrench ? 'Cle d edition' : 'Edition key',
    testListLabel: isFrench ? 'Liste SendFox test' : 'SendFox test list',
    testListValue: 'SENDFOX_TEST_LIST_ID',
    testListHint: isFrench
      ? 'Run test envoie un message TEST vers la liste definie par SENDFOX_TEST_LIST_ID.'
      : 'Run test sends a TEST message to the list defined by SENDFOX_TEST_LIST_ID.',
    latestEditionOption: isFrench ? 'Derniere edition (auto)' : 'Latest edition (auto)',
    quickChoices: isFrench ? 'Choix rapides' : 'Quick choices',
    recentEditionKeys: isFrench ? 'Cles recentes' : 'Recent keys',
    latestRunChoice: isFrench ? 'Derniere edition executee' : 'Latest executed edition',
    previousRunChoice: isFrench ? 'Edition precedente' : 'Previous edition',
    latestSuccessChoice: isFrench ? 'Derniere edition reussie' : 'Latest successful edition',
    latestFailedChoice: isFrench ? 'Derniere edition en echec' : 'Latest failed edition',
    retryNewsletter: isFrench ? 'Relancer newsletter' : 'Retry newsletter',
    runNowPending: isFrench ? 'Execution en cours...' : 'Running now...',
    forceRunPending: isFrench ? 'Execution forcee en cours...' : 'Force run in progress...',
    runTestPending: isFrench ? 'Test en cours...' : 'Running test...',
    smokeTestPending: isFrench ? 'Smoke en cours...' : 'Running smoke...',
    retryNewsletterPending: isFrench ? 'Relance newsletter en cours...' : 'Retrying newsletter...',
    editionKeyHint: isFrench
      ? "L'option automatique utilise la date actuelle (ex: 2024-W10-MON) ou l'édition déjà publiée."
      : 'Auto uses the current date (ex: 2024-W10-MON) or the already published edition.',
    customKeyPlaceholder: isFrench
      ? 'Cle manuelle (ex: 2026-W11-THU ou SPECIAL_V2)'
      : 'Manual key (ex: 2026-W11-THU or SPECIAL_V2)',
    editionKeyInvalid: isFrench
      ? 'La cle d edition doit contenir 3-64 caracteres (A-Z, 0-9, _ ou -).'
      : 'Edition key must be 3-64 chars using A-Z, 0-9, _ or -.',
    orSign: isFrench ? 'OU' : 'OR',
    noHistory: isFrench ? '(Aucun historique)' : '(No history)',
    automationSchedule: isFrench ? 'Planification automatisation' : 'Automation schedule',
    automationScheduleHint: isFrench
      ? 'Synchronisation quotidienne complète à 07:00 (Heure de Toronto) pour AI News.'
      : 'Full daily synchronization runs at 07:00 (Toronto time) for AI News.',
    enabled: isFrench ? 'Active' : 'Enabled',
    timezone: isFrench ? 'Fuseau horaire' : 'Timezone',
    day: isFrench ? 'Jour' : 'Day',
    hour: isFrench ? 'Heure' : 'Hour',
    minute: isFrench ? 'Minute' : 'Minute',
    saveSchedule: isFrench ? 'Sauvegarder planning' : 'Save schedule',
    slotLabel: (index: number) => `Slot ${index}`,
    slotA: 'Slot A',
    slotB: 'Slot B',
    dayThemes: isFrench ? 'Themes journaliers' : 'Day themes',
    dayThemesHint: isFrench
      ? 'Chaque jour de la semaine a un angle editorial et des sources dediees.'
      : 'Each weekday has a dedicated editorial angle and source set.',
    factCheck: isFrench ? 'Fact-check' : 'Fact-check',
    skipIfQuiet: isFrench ? 'Sauter si calme' : 'Skip if quiet',
    sourceNamePlaceholder: isFrench ? 'Nom de la source' : 'Source name',
    sourceUrlPlaceholder: isFrench ? 'URL principale (https://...)' : 'Main URL (https://...)',
    route: isFrench ? 'Route' : 'Route',
    rss: 'RSS',
    firecrawl: 'Firecrawl',
    rssFeed: isFrench ? 'Flux RSS' : 'RSS feed',
    rssFeedPlaceholder: isFrench ? 'Flux RSS (https://...)' : 'RSS feed (https://...)',
    allowFirecrawlFallback: isFrench ? 'Autoriser fallback Firecrawl' : 'Allow Firecrawl fallback',
    rssFeedRequired: isFrench ? 'Le flux RSS est requis pour la route RSS.' : 'RSS feed is required for RSS route.',
    add: isFrench ? 'Ajouter' : 'Add',
    sources: isFrench ? 'Sources' : 'Sources',
    activePlural: isFrench ? 'actives' : 'active',
    name: isFrench ? 'Nom' : 'Name',
    domain: isFrench ? 'Domaine' : 'Domain',
    priority: isFrench ? 'Priorite' : 'Priority',
    active: isFrench ? 'Active' : 'Active',
    action: isFrench ? 'Action' : 'Action',
    yes: isFrench ? 'OUI' : 'YES',
    no: isFrench ? 'NON' : 'NO',
    disable: isFrench ? 'Désactiver' : 'Disable',
    enable: isFrench ? 'Activer' : 'Enable',
    delete: isFrench ? 'Supprimer' : 'Delete',
    modify: isFrench ? 'Modifier' : 'Modify',
    save: isFrench ? 'Enregistrer' : 'Save',
    cancel: isFrench ? 'Annuler' : 'Cancel',
    editingSource: isFrench ? 'Modification de la source' : 'Editing source',
    recentRuns: isFrench ? 'Exécutions récentes' : 'Recent runs',
    edition: isFrench ? 'Édition' : 'Edition',
    trigger: isFrench ? 'Déclencheur' : 'Trigger',
    mode: isFrench ? 'Mode' : 'Mode',
    attempt: isFrench ? 'Tentative' : 'Attempt',
    status: isFrench ? 'Statut' : 'Status',
    started: isFrench ? 'Démarré' : 'Started',
    error: isFrench ? 'Erreur' : 'Error',
    runFailedPrefix: isFrench ? 'Exécution échouée' : 'Run failed',
    runStatusPrefix: isFrench ? 'Statut exécution' : 'Run status',
    smokeStatusPrefix: isFrench ? 'Statut smoke' : 'Smoke status',
    smokeFailedPrefix: isFrench ? 'Smoke échoué' : 'Smoke failed',
    retryFailedPrefix: isFrench ? 'Relance échouée' : 'Retry failed',
    newsletterRetryPrefix: isFrench ? 'Relance newsletter' : 'Newsletter retry',
    sent: isFrench ? 'envoyée' : 'sent',
    failed: isFrench ? 'échouée' : 'failed',
    createSourceFailedPrefix: isFrench ? 'Création source échouée' : 'Create source failed',
    sourceCreated: isFrench ? 'Source créée.' : 'Source created.',
    updateSourceFailedPrefix: isFrench ? 'Maj source échouée' : 'Update source failed',
    sourceUpdated: isFrench ? 'Source mise à jour.' : 'Source updated.',
    priorityUpdateFailedPrefix: isFrench ? 'Maj priorité échouée' : 'Priority update failed',
    priorityUpdated: isFrench ? 'Priorité mise à jour.' : 'Priority updated.',
    deleteSourceFailedPrefix: isFrench ? 'Suppression source échouée' : 'Delete source failed',
    sourceDeleted: isFrench ? 'Source supprimée.' : 'Source deleted.',
    scheduleUpdateFailedPrefix: isFrench ? 'Maj planning échouée' : 'Schedule update failed',
    scheduleUpdated: isFrench ? 'Planning mis à jour.' : 'Schedule updated.',
    deleteSourceConfirm: isFrench ? 'Supprimer la source' : 'Delete source',
    unknownError: isFrench ? 'Erreur inconnue' : 'Unknown error',
    siteTextControlTitle: isFrench ? 'Textes du site' : 'Site text control',
    siteTextControlHint: isFrench
      ? 'Acces rapide pour voir et modifier les textes critiques du site en cas de probleme.'
      : 'Quick access to review and edit critical site copy when issues happen.',
    siteTextTemplatesTitle: isFrench ? 'Modeles notifications' : 'Notification templates',
    siteTextTemplatesHint: isFrench
      ? 'Modifier les messages email/in-app utilises par le systeme.'
      : 'Edit the email and in-app templates used by the system.',
    openEditor: isFrench ? 'Ouvrir' : 'Open',
    next: isFrench ? 'Suivant' : 'Next',
    previous: isFrench ? 'Précédent' : 'Previous',
    showingRange: (from: number, to: number, total: number) =>
      isFrench ? `Affichage de ${from} à ${to} sur ${total}` : `Showing ${from} to ${to} of ${total}`,
  };
}

export type AiRecapAdminText = ReturnType<typeof getAiRecapAdminText>;
