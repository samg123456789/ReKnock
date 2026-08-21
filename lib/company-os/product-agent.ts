import "server-only";
import { generateText, parseJson, AI_MODEL } from "@/lib/ai";

export type ProductAgentOutput = {
  title: string;
  changelog: string;
  productArea: string;
  customerImpact: string;
  internalNotes: string;
  productIdeas: string[];
  userExperienceNotes: string[];
  growthRevenueNotes: string[];
  risks: string[];
  actionItems: string[];
};

type GithubCommit = {
  id?: string;
  message?: string;
  timestamp?: string;
  url?: string;
  author?: { name?: string; email?: string; username?: string };
  added?: string[];
  modified?: string[];
  removed?: string[];
};

export type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  compare?: string;
  repository?: {
    name?: string;
    full_name?: string;
    html_url?: string;
    default_branch?: string;
  };
  pusher?: { name?: string; email?: string };
  head_commit?: GithubCommit | null;
  commits?: GithubCommit[];
  deleted?: boolean;
  forced?: boolean;
};

export function productAgentEmailTo(): string {
  return process.env.PRODUCT_AGENT_EMAIL_TO ?? "samuelgoldberg98@gmail.com";
}

export function branchFromRef(ref?: string): string {
  return ref?.replace(/^refs\/heads\//, "") ?? "unknown";
}

export function summarizePush(payload: GithubPushPayload): string {
  const commits = payload.commits ?? [];
  const files = new Set<string>();
  for (const c of commits) {
    for (const name of [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]) files.add(name);
  }

  const commitLines = commits.slice(0, 25).map((commit, idx) => {
    const shortSha = commit.id?.slice(0, 7) ?? `commit-${idx + 1}`;
    const author = commit.author?.name || commit.author?.username || "unknown";
    const message = (commit.message ?? "").trim().split("\n")[0] || "(no message)";
    return `- ${shortSha} by ${author}: ${message}`;
  });

  const fileLines = Array.from(files)
    .sort()
    .slice(0, 80)
    .map((file) => `- ${file}`);

  return [
    `Repository: ${payload.repository?.full_name ?? payload.repository?.name ?? "unknown"}`,
    `Branch: ${branchFromRef(payload.ref)}`,
    `Default branch: ${payload.repository?.default_branch ?? "unknown"}`,
    `Compare URL: ${payload.compare ?? "n/a"}`,
    `After SHA: ${payload.after ?? "unknown"}`,
    `Commit count: ${commits.length}`,
    `Forced push: ${payload.forced ? "yes" : "no"}`,
    `Deleted ref: ${payload.deleted ? "yes" : "no"}`,
    "",
    "Commits:",
    commitLines.length ? commitLines.join("\n") : "- none",
    "",
    "Files touched:",
    fileLines.length ? fileLines.join("\n") : "- unavailable in payload",
  ].join("\n");
}

export async function runProductAgent(payload: GithubPushPayload): Promise<{
  output: ProductAgentOutput;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const pushSummary = summarizePush(payload);
  const system = [
    "You are ReKnock's internal Product Agent.",
    "Your job is to constantly help build the best possible product, protect user trust, and increase app usage that can grow revenue.",
    "You should be candid, product-minded, and willing to take advice or criticism.",
    "You are not allowed to contact customers, spend money, change pricing, or make public claims. Recommend those actions for human approval only.",
    "Focus on what changed, why users may care, what risks exist, and what the next best product move should be.",
  ].join(" ");

  const prompt = [
    "A GitHub push was received. Convert it into a useful internal product log.",
    "",
    "Return only valid JSON with this exact shape:",
    JSON.stringify({
      title: "Short changelog title",
      changelog: "Plain-English changelog entry. 2-5 sentences.",
      productArea: "Area of the product affected",
      customerImpact: "How this may help or affect users",
      internalNotes: "Useful implementation or operational context",
      productIdeas: ["Idea to improve the product"],
      userExperienceNotes: ["UX observation"],
      growthRevenueNotes: ["Usage/revenue observation"],
      risks: ["Risk or regression to watch"],
      actionItems: ["Concrete follow-up"],
    }),
    "",
    "Rules:",
    "- Do not overclaim if commit context is thin.",
    "- Prefer practical next steps over vague strategy.",
    "- Tie recommendations to user usage, retention, conversion, or trust when possible.",
    "- Mention when a human decision or approval is needed.",
    "",
    "Push summary:",
    pushSummary,
  ].join("\n");

  const res = await generateText({ system, prompt, temperature: 0.2, maxTokens: 1600 });
  const parsed = parseJson<ProductAgentOutput>(res.text);
  if (!parsed) {
    return {
      output: {
        title: "Product update logged",
        changelog: res.text.trim().slice(0, 4000) || "A push was received, but the product summary could not be parsed.",
        productArea: "Unknown",
        customerImpact: "Needs review",
        internalNotes: "The model response did not parse as JSON.",
        productIdeas: [],
        userExperienceNotes: [],
        growthRevenueNotes: [],
        risks: ["Review the raw agent output before sharing this changelog."],
        actionItems: ["Improve the Product Agent prompt or inspect the source push payload."],
      },
      usage: res.usage,
    };
  }
  return { output: normalizeOutput(parsed), usage: res.usage };
}

function normalizeOutput(output: ProductAgentOutput): ProductAgentOutput {
  const list = (items: unknown): string[] => (Array.isArray(items) ? items.map(String).filter(Boolean).slice(0, 8) : []);
  return {
    title: String(output.title || "Product update logged").slice(0, 180),
    changelog: String(output.changelog || "").slice(0, 5000),
    productArea: String(output.productArea || "Unknown").slice(0, 180),
    customerImpact: String(output.customerImpact || "Needs review").slice(0, 1000),
    internalNotes: String(output.internalNotes || "").slice(0, 2000),
    productIdeas: list(output.productIdeas),
    userExperienceNotes: list(output.userExperienceNotes),
    growthRevenueNotes: list(output.growthRevenueNotes),
    risks: list(output.risks),
    actionItems: list(output.actionItems),
  };
}

export async function sendProductAgentEmail(opts: {
  to: string;
  payload: GithubPushPayload;
  output: ProductAgentOutput;
  runId: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const repo = opts.payload.repository?.full_name ?? opts.payload.repository?.name ?? "unknown repo";
  const branch = branchFromRef(opts.payload.ref);
  const lines = [
    "Product Agent ran on a new GitHub push.",
    "",
    `Repository: ${repo}`,
    `Branch: ${branch}`,
    `Commits: ${opts.payload.commits?.length ?? 0}`,
    opts.payload.compare ? `Compare: ${opts.payload.compare}` : null,
    "",
    `Title: ${opts.output.title}`,
    "",
    opts.output.changelog,
    "",
    `Customer impact: ${opts.output.customerImpact}`,
    "",
    section("Product ideas", opts.output.productIdeas),
    section("UX notes", opts.output.userExperienceNotes),
    section("Growth/revenue notes", opts.output.growthRevenueNotes),
    section("Risks", opts.output.risks),
    section("Action items", opts.output.actionItems),
    "",
    `Run ID: ${opts.runId}`,
    `Model: ${AI_MODEL}`,
  ].filter((line): line is string => line !== null);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "ReKnock Product Agent <ops@getreknock.com>",
      to: [opts.to],
      subject: `[ReKnock Product] ${opts.output.title}`,
      text: lines.join("\n"),
    }),
  });
  if (!resp.ok) throw new Error(`Product Agent email failed: Resend ${resp.status}`);
  return true;
}

function section(title: string, items: string[]): string {
  if (!items.length) return `${title}: none`;
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}
