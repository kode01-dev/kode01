export type LogRow = {
  id: string;
  event_type: string;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
};
