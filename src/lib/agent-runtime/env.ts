export const AGENT_EXECUTION_MODES = ['vercel', 'modal'] as const;
export type AgentExecutionMode = (typeof AGENT_EXECUTION_MODES)[number];

export type AgentRuntimeEnv = {
  mode: AgentExecutionMode;
  modalApiUrl: string | null;
  internalToken: string | null;
  internalTokenNext: string | null;
  internalAuthMaxSkewSeconds: number;
};

function parseMode(raw: string | undefined): AgentExecutionMode {
  const normalized = raw?.trim().toLowerCase();
  return normalized === 'modal' ? 'modal' : 'vercel';
}

export function getAgentRuntimeEnv(): AgentRuntimeEnv {
  const env = process.env;
  return {
    mode: parseMode(env.AGENT_EXECUTION_MODE),
    modalApiUrl: env.MODAL_AGENT_API_URL?.trim() || null,
    internalToken: env.AGENT_INTERNAL_TOKEN?.trim() || null,
    internalTokenNext: env.AGENT_INTERNAL_TOKEN_NEXT?.trim() || null,
    internalAuthMaxSkewSeconds: (() => {
      const parsed = Number(env.AGENT_INTERNAL_AUTH_MAX_SKEW_SECONDS);
      if (!Number.isFinite(parsed) || parsed < 30 || parsed > 900) return 300;
      return Math.floor(parsed);
    })(),
  };
}

export function canUseModalRuntime(value = getAgentRuntimeEnv()): boolean {
  return Boolean(value.modalApiUrl && (value.internalToken || value.internalTokenNext));
}
