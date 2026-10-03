import { describe, expect, it } from 'vitest';
import { parseGuideResponse } from '$lib/components/ui/smart-guide/guide-response';

describe('parseGuideResponse', () => {
  it('parses markdown answers and generic navigate/tool actions', () => {
    const parsed = parseGuideResponse(JSON.stringify({
      answer_markdown: '1. Open **Users**.\n2. Select the role.',
      actions: [
        { kind: 'navigate', route: '/system/settings/users', label: 'Open users' },
        {
          kind: 'tool',
          tool: 'a_future_generic_mcp_tool',
          args: { entity: 'user_profile' },
          label: 'Inspect users',
        },
      ],
    }));

    expect(parsed).toEqual({
      answer_markdown: '1. Open **Users**.\n2. Select the role.',
      actions: [
        { kind: 'navigate', route: '/system/settings/users', label: 'Open users', query: undefined },
        {
          kind: 'tool',
          tool: 'a_future_generic_mcp_tool',
          args: { entity: 'user_profile' },
          label: 'Inspect users',
          page_route: undefined,
        },
      ],
    });
  });

  it('accepts a JSON code fence and caps actions at five', () => {
    const actions = Array.from({ length: 7 }, (_, i) => ({
      kind: 'navigate',
      route: `/system/settings/page-${i}`,
      label: `Page ${i}`,
    }));
    const parsed = parseGuideResponse(`\`\`\`json\n${JSON.stringify({ answer_markdown: 'Answer', actions })}\n\`\`\``);

    expect(parsed?.answer_markdown).toBe('Answer');
    expect(parsed?.actions).toHaveLength(5);
  });

  it('ignores invalid action entries without losing a valid answer', () => {
    const parsed = parseGuideResponse(JSON.stringify({
      answer_markdown: 'The docs explain the concept.',
      actions: [
        { kind: 'navigate', route: 'https://external.example', label: 'External' },
        { kind: 'navigate', route: '/api/v1/system/docs/search', label: 'API endpoint' },
        { kind: 'tool', tool: '', args: {}, label: 'Invalid tool' },
        { kind: 'tool', tool: 'get_entity', args: { entity: 'user_profile' }, label: 'Valid tool' },
      ],
    }));

    expect(parsed?.answer_markdown).toBe('The docs explain the concept.');
    expect(parsed?.actions).toEqual([
      {
        kind: 'tool',
        tool: 'get_entity',
        args: { entity: 'user_profile' },
        label: 'Valid tool',
        page_route: undefined,
      },
    ]);
  });

  it('keeps navigation actions only when their route is present in retrieved context', () => {
    const parsed = parseGuideResponse(
      JSON.stringify({
        answer_markdown: 'Open the users page.',
        actions: [
          { kind: 'navigate', route: '/system/settings/users', label: 'Open users' },
          { kind: 'navigate', route: '/system/settings/roles', label: 'Open roles' },
          {
            kind: 'tool',
            tool: 'update_entity',
            args: { entity: 'user_profile' },
            label: 'Update user',
            page_route: '/system/settings/roles',
          },
        ],
      }),
      'Retrieved route: /system/settings/users',
    );

    expect(parsed?.actions).toEqual([
      { kind: 'navigate', route: '/system/settings/users', label: 'Open users', query: undefined },
      {
        kind: 'tool',
        tool: 'update_entity',
        args: { entity: 'user_profile' },
        label: 'Update user',
        page_route: undefined,
      },
    ]);
  });

  it('rejects output that does not conform to the fixed response envelope', () => {
    expect(parseGuideResponse('plain prose')).toBeNull();
    expect(parseGuideResponse('{broken')).toBeNull();
  });

  it('accepts an answer envelope with missing actions (S4 owns actions)', () => {
    expect(parseGuideResponse('{"answer_markdown":"missing actions"}')).toEqual({
      answer_markdown: 'missing actions',
      actions: [],
    });
  });

  it('salvages answer_markdown from a max_tokens-truncated envelope', () => {
    const truncated = '{"answer_markdown":"Vai alla pagina utenti e clicca su Nuovo.\\nPoi compila","actions":[{"kind":"nav';
    expect(parseGuideResponse(truncated)).toEqual({
      answer_markdown: 'Vai alla pagina utenti e clicca su Nuovo.\nPoi compila',
      actions: [],
    });
  });
});
