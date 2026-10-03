import type { AiAction } from '$lib/components/ui/smart-ai/ai-assistant.types';

export interface GuideResponse {
  answer_markdown: string;
  actions: AiAction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function parseAction(value: unknown, grounding_context?: string): AiAction | null {
  if (!isRecord(value) || typeof value.label !== 'string' || !value.label.trim()) return null;

  if (
    value.kind === 'navigate' &&
    typeof value.route === 'string' &&
    value.route.startsWith('/') &&
    !value.route.startsWith('//') &&
    !value.route.startsWith('/api/') &&
    (grounding_context === undefined || grounding_context.includes(value.route))
  ) {
    return {
      kind: 'navigate',
      route: value.route,
      label: value.label,
      query: isStringRecord(value.query) ? value.query : undefined,
    };
  }

  if (value.kind === 'tool' && typeof value.tool === 'string' && value.tool.trim()) {
    return {
      kind: 'tool',
      tool: value.tool,
      args: isRecord(value.args) ? value.args : {},
      label: value.label,
      page_route:
        typeof value.page_route === 'string' &&
        value.page_route.startsWith('/') &&
        !value.page_route.startsWith('//') &&
        !value.page_route.startsWith('/api/') &&
        (grounding_context === undefined || grounding_context.includes(value.page_route))
          ? value.page_route
          : undefined,
    };
  }

  return null;
}

export function parseGuideResponse(raw: string, grounding_context?: string): GuideResponse | null {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    // Salvage: the answer envelope can be truncated mid-string when the
    // generation hits max_tokens (invalid JSON, usable prose). Extract the
    // answer_markdown value up to the truncation point.
    const m = json.match(/"answer_markdown"\s*:\s*"([\s\S]*)/);
    if (!m) return null;
    const salvaged = m[1]
      .replace(/"\s*,?\s*"actions"[\s\S]*$/, '')
      .replace(/"[\s\n]*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
    return salvaged ? { answer_markdown: salvaged, actions: [] } : null;
  }
  if (!isRecord(value) || typeof value.answer_markdown !== 'string' || !value.answer_markdown.trim()) {
    return null;
  }

  // `actions` is OPTIONAL: the contract asks for an empty array but the
  // model sometimes omits the key entirely — that must not discard a
  // perfectly good answer (real actions come from the S4 selection stage).
  const rawActions = Array.isArray(value.actions) ? value.actions : [];
  const actions = rawActions
    .map((action) => parseAction(action, grounding_context))
    .filter((action): action is AiAction => action !== null)
    .slice(0, 5);
  return { answer_markdown: value.answer_markdown, actions };
}
