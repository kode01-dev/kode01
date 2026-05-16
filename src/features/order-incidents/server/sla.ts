import 'server-only';

const DEFAULT_ORDER_INCIDENT_SLA_DAYS = 3;

export function getOrderIncidentSlaDays(): number {
  const raw = process.env.ORDER_INCIDENT_SLA_DAYS;
  if (!raw) return DEFAULT_ORDER_INCIDENT_SLA_DAYS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_ORDER_INCIDENT_SLA_DAYS;

  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 30) return DEFAULT_ORDER_INCIDENT_SLA_DAYS;
  return normalized;
}

export function computeIncidentSlaDeadline(
  createdAt: string | Date,
  slaDays = getOrderIncidentSlaDays(),
): string {
  const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const deadline = new Date(base.getTime() + slaDays * 24 * 60 * 60 * 1000);
  return deadline.toISOString();
}
