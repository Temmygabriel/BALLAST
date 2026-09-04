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
  propose(ctx: RiskContext): Promise<{ rationale: string; amountUnits: string; debtAsset: string }>;
}

/** Offline analyst: do the exact arithmetic, explain it in plain words. */
export function deterministicAnalyst(): Analyst {
  return {
    kind: 'deterministic',
    async propose(ctx: RiskContext) {
      const units = BigInt(ctx.suggestedUnits);
      const usd = Number(units) / 10 ** 0; // token units ≈ dollars for a stablecoin
      const amountUnits = units < 0n ? 0n : units;
      return {
        amountUnits: amountUnits.toString(),
        debtAsset: ctx.debtAsset,
        rationale:
          `Health factor ${ctx.healthFactor.toFixed(3)} is below the action threshold. ` +
          `Repaying ~$${usd.toFixed(2)} of ${ctx.debtAssetName} restores it to a safe level.`,
      };
    },
  };
}

/** DeepSeek analyst — only loads the OpenAI SDK when actually used (keeps offline runs light). */
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
          { role: 'user', content: JSON.stringify(ctx) },
        ],
      });
      const parsed = JSON.parse(r.choices[0]?.message?.content ?? '{}') as {
        rationale: string;
        amountUnits: string;
        debtAsset: string;
      };
      return parsed;
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
