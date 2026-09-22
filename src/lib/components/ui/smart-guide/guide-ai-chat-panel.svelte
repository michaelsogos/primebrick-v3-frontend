<script lang="ts">
  /**
   * GuideAiChatPanel — thin wrapper binding the shared AiChatPanel to the
   * User Guide assistant (useGuideAi). All chrome (model loading, messages,
   * composer, selectors, source citations) comes from the shared panel —
   * this file only declares identity and the composable factory.
   */
  import AiChatPanel from '$lib/components/ui/smart-ai/ai-chat-panel.svelte';
  import { useGuideAi } from './use-guide-ai.svelte';
</script>

<AiChatPanel
  assistant_id="guide"
  i18n_ns="app.smart.guide.ai"
  topic_key="app.smart.guide.ai.topic"
  testid_prefix="smart-guide-ai"
  create_composable={(id) => useGuideAi(id)}
/>
