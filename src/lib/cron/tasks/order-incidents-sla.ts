import { createAdminClient } from '@/lib/supabase/admin';
import { getOrderIncidentSlaDays, computeIncidentSlaDeadline } from '@/features/order-incidents/server/sla';

type IncidentRow = {
  id: string;
  created_at: string;
  sla_deadline_at: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  assigned_admin_id: string | null;
  resolution: string | null;
};

type ActionRow = {
  incident_id: string;
  actor_role: string;
};

export async function runOrderIncidentsSlaTask() {
  const admin = createAdminClient();
  const slaDays = getOrderIncidentSlaDays();
  const now = new Date();

  const { data: incidentsData, error: incidentsError } = await admin
    .from('purchase_incidents')
    .select('id, created_at, sla_deadline_at, status, assigned_admin_id, resolution')
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: true })
    .limit(1000);

  if (incidentsError) {
    throw new Error(`Failed to load incidents: ${incidentsError.message}`);
  }

  const incidents = (incidentsData ?? []) as IncidentRow[];
  if (incidents.length === 0) {
    return { checkedIncidents: 0, escalatedIncidents: 0, slaDays };
  }

  const incidentIds = incidents.map((incident) => incident.id);
  const { data: actionsData, error: actionsError } = await admin
    .from('purchase_incident_actions')
    .select('incident_id, actor_role')
    .in('incident_id', incidentIds)
    .eq('actor_role', 'vendor');

  if (actionsError) {
    throw new Error(`Failed to load incident actions: ${actionsError.message}`);
  }

  const vendorRespondedIds = new Set(
    ((actionsData ?? []) as ActionRow[]).map((action) => action.incident_id),
  );

  const { data: adminsData } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1);

  const fallbackAdminId = adminsData?.[0]?.id ?? null;
  const staleIncidentIds: string[] = [];
  for (const incident of incidents) {
    if (vendorRespondedIds.has(incident.id)) continue;
    if (incident.resolution === 'escalated') continue;

    const deadlineIso = incident.sla_deadline_at ?? computeIncidentSlaDeadline(incident.created_at, slaDays);
    const deadlineDate = new Date(deadlineIso);
    if (Number.isNaN(deadlineDate.getTime())) continue;
    if (deadlineDate <= now) {
      staleIncidentIds.push(incident.id);
    }
  }

  if (staleIncidentIds.length === 0) {
    return {
      checkedIncidents: incidents.length,
      escalatedIncidents: 0,
      slaDays,
    };
  }

  const { error: updateError } = await admin
    .from('purchase_incidents')
    .update({
      status: 'in_progress',
      resolution: 'escalated',
      assigned_admin_id: fallbackAdminId,
    })
    .in('id', staleIncidentIds);

  if (updateError) {
    throw new Error(`Failed to escalate incidents: ${updateError.message}`);
  }

  const actionRows = staleIncidentIds.map((incidentId) => ({
    incident_id: incidentId,
    action_type: 'sla_auto_escalated',
    actor_user_id: fallbackAdminId,
    actor_role: 'system',
    metadata: {
      reason: 'seller_no_response',
      sla_days: slaDays,
    },
  }));

  const { error: actionInsertError } = await admin
    .from('purchase_incident_actions')
    .insert(actionRows);

  if (actionInsertError) {
    throw new Error(`Failed to log SLA escalation actions: ${actionInsertError.message}`);
  }

  return {
    checkedIncidents: incidents.length,
    escalatedIncidents: staleIncidentIds.length,
    slaDays,
  };
}
