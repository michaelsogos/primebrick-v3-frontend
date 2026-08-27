/**
 * Client tool registry — FE-side tools the AI orchestrator can invoke via
 * `client-tool-call` SSE events.
 *
 * Unlike server-side MCP tools (which query the BE database), client tools
 * execute in the browser — e.g. navigating to a route, opening a sheet,
 * scrolling to an element. The AI cannot perform these actions server-side,
 * so the orchestrator emits a `client-tool-call` event and the FE executes
 * the tool locally.
 *
 * Architecture:
 *   - The registry is a Map<string, ClientToolHandler>.
 *   - `registerClientTool(name, handler)` adds a tool.
 *   - `invokeClientTool(name, args)` calls the handler and returns the result.
 *   - The AI chat panel registers tools on mount and invokes them when it
 *     receives a `client-tool-call` SSE event.
 *
 * The `navigate` tool is the primary client tool — it lets the AI open any
 * page in the app (e.g. "Show me the customers list" → navigate to /customers).
 */
import { goto } from '$app/navigation';

/** Arguments for the `navigate` client tool. */
export interface NavigateToolArgs {
  /** Target route path (e.g. '/customers', '/users', '/organizations'). */
  route: string;
  /** Optional query parameters. */
  query?: Record<string, string>;
}

/** Generic client tool handler. */
export type ClientToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
) => Promise<TResult> | TResult;

/** Result of a client tool invocation. */
export interface ClientToolResult<TResult = unknown> {
  ok: boolean;
  result?: TResult;
  error?: string;
}

const registry = new Map<string, ClientToolHandler>();

/**
 * Register a client tool. Overwrites any existing tool with the same name.
 */
export function registerClientTool<TArgs, TResult>(
  name: string,
  handler: ClientToolHandler<TArgs, TResult>,
): void {
  registry.set(name, handler as ClientToolHandler);
}

/**
 * Invoke a client tool by name. Returns a result object — never throws.
 * If the tool is not registered, returns `{ ok: false, error: '...' }`.
 */
export async function invokeClientTool<TResult = unknown>(
  name: string,
  args: unknown,
): Promise<ClientToolResult<TResult>> {
  const handler = registry.get(name);
  if (!handler) {
    return { ok: false, error: `Client tool '${name}' is not registered` };
  }
  try {
    const result = (await handler(args)) as TResult;
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Register the built-in `navigate` client tool.
 * Uses SvelteKit's `goto()` to navigate to the target route with optional
 * query parameters.
 */
export function registerBuiltinClientTools(): void {
  registerClientTool<NavigateToolArgs, { url: string }>('navigate', (args) => {
    const target = args.query
      ? `${args.route}?${new URLSearchParams(args.query).toString()}`
      : args.route;
    void goto(target);
    return { url: target };
  });
}

/**
 * Clear all registered client tools (for testing or teardown).
 */
export function clearClientTools(): void {
  registry.clear();
}
