import "server-only";

export const AGENT_NAMES = ["compass", "forge", "signal"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export type AgentDefinition = {
  name: string;
  description: string;
  schedule: string;
  operatingMode: "observe_recommend" | "draft_only";
  capabilities: readonly string[];
  publicWrites: false;
};

export const AGENT_REGISTRY = {
  compass: {
    name: "Compass",
    description: "Product intelligence, roadmap recommendations, and internal task creation.",
    schedule: "*/30 * * * *",
    operatingMode: "observe_recommend",
    capabilities: ["product changelog analysis", "roadmap recommendations", "internal task creation"],
    publicWrites: false,
  },
  forge: {
    name: "Forge",
    description: "Reliability, technical debt, and security-minded monitoring from existing signals.",
    schedule: "15 * * * *",
    operatingMode: "observe_recommend",
    capabilities: ["failed job review", "agent run review", "technical debt recommendations", "internal task creation"],
    publicWrites: false,
  },
  signal: {
    name: "Signal",
    description: "Marketing drafts and channel experiments based on product changes, always approval-gated.",
    schedule: "0 */6 * * *",
    operatingMode: "draft_only",
    capabilities: ["changelog-to-content drafts", "channel experiment ideas", "approval queue creation"],
    publicWrites: false,
  },
} as const satisfies Record<AgentName, AgentDefinition>;

export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}
