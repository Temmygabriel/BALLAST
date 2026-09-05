/**
 * ⚓ THE KEEPERHUB ADAPTER BOUNDARY — the only file in the repo that knows KeeperHub.
 *
 * Everything else talks to `KeeperHub` (a small interface). This file supplies it
 * two ways:
 *   1. MockKeeperHub  — offline. Used for sim/demo/tests. No network, no keys.
 *   2. LiveKeeperHub  — the real thing. Talks to KeeperHub's MCP server over HTTP,
 *      calling the same tools the Claude Code plugin exposes
 *      (`execute_contract_call`, `get_direct_execution_status`).
 *
 * Grep rule to keep forever: nothing outside this file may import a KeeperHub SDK.
 */
import type { ContractCall, ExecResult, KeeperHub, SimResult } from './types';

const randHex = (len = 16) =>
  '0x' + Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/* ───────────────────────── 1. OFFLINE MOCK ───────────────────────── */

export interface MockOpts {
  /**
   * Optional "would this call revert on the real chain?" oracle, so a scenario can
   * make the dry-run catch a bad repay. Default: nothing reverts.
   */
  wouldRevert?: (call: ContractCall) => boolean;
  /** Optional log so the engine can record what the mock did. */
  onStep?: (msg: string) => void;
  /**
   * Whether the mock chain pretends private/MEV-safe routing is available.
   * Default false — the guardian must never ASSUME privacy (hardening §P1-6).
   */
  privateRouting?: boolean;
}

export class MockKeeperHub implements KeeperHub {
  private readonly opts: MockOpts;
  /** Idempotency keys we've already seen → their result. Re-sends return it. */
  private readonly seen = new Map<string, ExecResult>();

  constructor(opts: MockOpts = {}) {
    this.opts = opts;
  }

  async supportsPrivateRouting(network: string): Promise<boolean> {
    return this.opts.privateRouting ?? false;
  }

  async simulate(call: ContractCall): Promise<SimResult> {
    const wouldRevert = this.opts.wouldRevert?.(call) ?? false;
    this.opts.onStep?.(`dry-run ${call.abiFunction} → ${wouldRevert ? 'WOULD REVERT' : 'ok'}`);
    return wouldRevert
      ? { success: false, wouldRevert: true, error: 'simulate: call would revert' }
      : { success: true, wouldRevert: false };
  }

  async execute(call: ContractCall, idempotencyKey: string): Promise<ExecResult> {
    const prior = this.seen.get(idempotencyKey);
    if (prior) {
      this.opts.onStep?.(`idempotent re-send of ${call.abiFunction} → reused ${prior.txHash}`);
      return prior;
    }
    const executionId = `mock_exec_${randHex(10).slice(2)}`;
    const result: ExecResult = {
      executionId,
      status: 'completed',
      txHash: randHex(32),
      auditUrl: `https://mock.keeperhub.local/audit/${executionId}`,
    };
    this.seen.set(idempotencyKey, result);
    this.opts.onStep?.(`executed ${call.abiFunction} → ${result.txHash}`);
    return result;
  }

  async waitForTx(executionId: string): Promise<ExecResult> {
    return {
      executionId,
      status: 'completed',
      txHash: randHex(32),
      auditUrl: `https://mock.keeperhub.local/audit/${executionId}`,
    };
  }
}

/* ───────────────────────── 2. LIVE (REAL KEEPERHUB) ───────────────────────── */

interface LiveOpts {
  mcpUrl: string;
  apiKey: string;
}

/**
 * Talks to KeeperHub's MCP server. The MCP SDK is imported lazily so the offline
 * build never loads it. Field names below were read from the live plugin surface
 * (read-only introspection, 2026-09-04):
 *   execute_contract_call {chain_id, contract_address, function_name,
 *                          function_args (JSON-array-as-string), simulate?,
 *                          idempotency_key}
 *   get_direct_execution_status {execution_id}
 * The `abi` field is optional — verified contracts are auto-fetched.
 */
export class LiveKeeperHub implements KeeperHub {
  private readonly opts: LiveOpts;
  private client: Promise<unknown> | null = null;

  constructor(opts: LiveOpts) {
    this.opts = opts;
  }

  /** Connect once, lazily. Returns the raw MCP client object (typed as unknown on purpose). */
  private mcp(): Promise<any> {
    if (this.client) return this.client;
    this.client = (async () => {
      // Lazy import: only present when the live dependency set is installed.
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const transport = new StreamableHTTPClientTransport(new URL(this.opts.mcpUrl), {
        requestInit: { headers: { Authorization: `Bearer ${this.opts.apiKey}` } },
      });
      const client = new Client({ name: 'ballast-guardian', version: '0.1.0' });
      await client.connect(transport);
      return client;
    })();
    return this.client;
  }

  private async call(name: string, args: unknown): Promise<any> {
    const mcp: any = await this.mcp();
    const res = await mcp.callTool({ name, arguments: args });
    // This MCP server returns content:[{type:'text', text:'<json>'}] and NO
    // structuredContent — parse the JSON text out (learned the hard way live).
    const items = res?.content;
    if (Array.isArray(items)) {
      const text = items
        .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text)
        .join('');
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return text; // plain text, not JSON — caller must handle it
        }
      }
    }
    return res?.structuredContent ?? res;
  }

  /** "repay(address,uint256,…)" → the bare function name the tools expect. */
  private static fname(abiFunction: string): string {
    const i = abiFunction.indexOf('(');
    return i >= 0 ? abiFunction.slice(0, i) : abiFunction;
  }

  /** Map our ContractCall onto the real MCP tool's argument names. */
  private static txArgs(call: ContractCall): Record<string, unknown> {
    return {
      chain_id: call.network,
      contract_address: call.contractAddress,
      function_name: LiveKeeperHub.fname(call.abiFunction),
      function_args: JSON.stringify(call.args ?? []),
      ...(call.value ? { value: call.value } : {}),
    };
  }

  async simulate(call: ContractCall): Promise<SimResult> {
    const r: any = await this.call('execute_contract_call', {
      ...LiveKeeperHub.txArgs(call),
      simulate: true, // JSON boolean — nothing is broadcast
    });
    return { success: !!r?.success, wouldRevert: !!r?.wouldRevert, error: r?.error };
  }

  /**
   * Whether THIS chain + execution path actually provides private routing. Ballast
   * never assumes privacy (hardening §P1-6). Best-effort until live creds let us
   * query KeeperHub's chain-capability endpoint directly: an operator can list the
   * networks they've verified as private-capable in KEEPERHUB_PRIVATE_NETWORKS.
   * Unlisted chains answer false, so anything that REQUIRES privacy fails closed.
   */
  async supportsPrivateRouting(network: string): Promise<boolean> {
    const known = (process.env.KEEPERHUB_PRIVATE_NETWORKS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return known.includes(network);
  }

  async execute(call: ContractCall, idempotencyKey: string): Promise<ExecResult> {
    const r: any = await this.call('execute_contract_call', {
      ...LiveKeeperHub.txArgs(call),
      idempotency_key: idempotencyKey,
    });
    return {
      executionId: r?.executionId ?? r?.id ?? r?.execution_id ?? '',
      status: r?.status ?? 'running',
      txHash: r?.txHash ?? r?.transactionHash,
      // KeeperHub names the block-explorer link "transactionLink" (not auditUrl)
      auditUrl: r?.transactionLink ?? r?.auditUrl,
    };
  }

  async waitForTx(executionId: string): Promise<ExecResult> {
    for (let i = 0, d = 1500; i < 20; i++, d = Math.min(d * 1.6, 15000)) {
      const r: any = await this.call('get_direct_execution_status', { execution_id: executionId });
      const status = r?.status;
      if (status === 'completed' || status === 'failed') {
        return {
          executionId,
          status,
          txHash: r?.transactionHash ?? r?.txHash,
          auditUrl: r?.transactionLink ?? r?.auditUrl,
        };
      }
      await new Promise((res) => setTimeout(res, d));
    }
    return { executionId, status: 'timeout' };
  }
}

/* ───────────────────────── 3. PICK ONE ───────────────────────── */

/** Live only when real creds exist — otherwise the offline mock. */
export function pickKeeper(env?: { keeperhubMcpUrl?: string; keeperhubApiKey?: string }): KeeperHub {
  if (env?.keeperhubMcpUrl && env?.keeperhubApiKey) {
    return new LiveKeeperHub({ mcpUrl: env.keeperhubMcpUrl, apiKey: env.keeperhubApiKey });
  }
  return new MockKeeperHub();
}
