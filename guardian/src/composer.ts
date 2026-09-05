/**
 * The risk analyst — the ONLY probabilistic part.
 *
 * It never moves money. It looks at the position, thinks about the risk, and
 * PROPOSES a repay amount plus a plain-language reason. Its output then has to
 * pass through the deterministic guard (guard.ts) before anything is executed.
 *
 * Two implementations:
 *  - DeepSeek (if an API key is set) — the "AI proposes" story for the demo.
 *  - Deterministic (always available, offline) — just does the exact math.
 */
import type { Proposal } from './guard';

export interface RiskContext {
  healthFactor: number;
  totalDebtBase: string;
  totalCollateralBase: string;
  /** The policy's suggested repay, token units. The analyst must not exceed it. */
  suggestedUnits: string;
  debtAsset: string;
  debtAssetName: string;
  rationaleHook?: string; // extra colour for the human explanation
}

export interface Analyst {
  readonly kind: 'deepseek' | 'deterministic';
  propose(ctx: RiskContext): Promise<AnalystReply>;
}

/** The ONLY shape an analyst may return. `rationale` is display-only — it is never
 *  parsed or used to decide what moves money (the guard decides that). */
export interface AnalystReply {
  rationale: string;
  amountUnits: string;
  debtAsset: string;
}

/**
 * The LLM's reply is treated as HOSTILE (hardening §P1-8), not just "structured":
 *  - reject anything with unexpected top-level fields,
 *  - reject wrong types / non-integer amounts / amounts above the policy suggestion,
 *  - the rationale is a bounded display string and carries no decision power.
 * Throws on any violation; callers fall back to the deterministic analyst.
 */
const ANALYST_ALLOWED_FIELDS = ['rationale', 'amountUnits', 'debtAsset'] as const;

export function validateAnalystReply(raw: unknown, ctx: RiskContext): AnalystReply {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('analyst reply is not an object');
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!(ANALYST_ALLOWED_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`analyst reply has unexpected field "${key}"`);
    }
  }
  const { rationale, amountUnits, debtAsset } = o;
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    throw new Error('analyst reply is missing a rationale');
  }
  if (rationale.length > 2000) throw new Error('analyst rationale is too long');
  if (typeof amountUnits !== 'string' || !/^\d+$/.test(amountUnits)) {
    throw new Error('analyst amountUnits must be a non-negative integer string');
  }
  if (BigInt(amountUnits) > BigInt(ctx.suggestedUnits)) {
    throw new Error('analyst proposed amount exceeds the policy suggestion');
  }
  if (typeof debtAsset !== 'string' || !debtAsset.toLowerCase().startsWith('0x')) {
    throw new Error('analyst debtAsset must be an address');
  }
  return { rationale, amountUnits, debtAsset };
}

/** Offline analyst: do the exact arithmetic, explain it in plain words. */
export function deterministicAnalyst(): Analyst {
  return {
    kind: 'deterministic',
    async propose(ctx: RiskContext) {
      const units = BigInt(ctx.suggestedUnits);
      const usd = Number(units) / 10 ** 0; // token units ≈ dollars for a stablecoin
      const amountUnits = units < 0n ? 0n : units;
      return validateAnalystReply(
        {
          amountUnits: amountUnits.toString(),
          debtAsset: ctx.debtAsset,
          rationale:
            `Health factor ${ctx.healthFactor.toFixed(3)} is below the action threshold. ` +
            `Repaying ~$${usd.toFixed(2)} of ${ctx.debtAssetName} restores it to a safe level.`,
        },
        ctx,
      );
    },
  };
}

/**
 * DeepSeek analyst — only loads the OpenAI SDK when actually used (keeps offline runs light).
 * The user message is built ONLY from our own structured numeric fields (hardening §P1-7):
 * the model never receives raw external text, alerts, or arbitrary RPC payloads.
 */
export function deepseekAnalyst(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): Analyst {
  return {
    kind: 'deepseek',
    async propose(ctx: RiskContext) {
      // Lazy import so the offline build never pulls the SDK in.
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
      const r = await client.chat.completions.create({
        model: opts.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a DeFi risk analyst. Given a lending position at risk, respond ONLY with JSON ' +
              '{"rationale": string, "amountUnits": string, "debtAsset": string}. You PROPOSE a repay; ' +
              'you never execute. Do not exceed the suggestedUnits.',
          },
          // ctx carries ONLY clean numeric/structured fields we control — no external text.
          { role: 'user', content: JSON.stringify(ctx) },
        ],
      });
      // Treat the model's reply as hostile: reject unexpected fields before it goes anywhere.
      const parsed = JSON.parse(r.choices[0]?.message?.content ?? '{}');
      return validateAnalystReply(parsed, ctx);
    },
  };
}

/** Pick an analyst: DeepSeek when a key exists, otherwise the deterministic one. */
export function makeAnalyst(env?: {
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
}): Analyst {
  if (env?.deepseekApiKey) {
    return deepseekAnalyst({
      apiKey: env.deepseekApiKey,
      baseUrl: env.deepseekBaseUrl ?? 'https://api.deepseek.com',
      model: env.deepseekModel ?? 'deepseek-v4-flash',
    });
  }
  return deterministicAnalyst();
}

/** Type helper so rescue logic can work with a raw Proposal + rationale. */
export type { Proposal };
