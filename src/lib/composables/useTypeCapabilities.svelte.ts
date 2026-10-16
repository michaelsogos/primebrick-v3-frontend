/**
 * useTypeCapabilities — singleton cache for the per-type capability matrix.
 *
 * The canonical definition lives in `@primebrick/sdk` (`TYPE_CAPABILITIES`)
 * and is served by the BE via `GET /api/v1/entities/config_entry/meta`.
 * Fetched once lazily — the matrix is static design data.
 *
 * Until the fetch resolves, `capabilitiesFor()` returns a permissive
 * fallback (all rules shown) so the form never flickers/hides sections.
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { fetchConfigEntryMeta } from '$lib/api';
import type { ConfigEntryType, TypeCapabilities, TypeCapabilitiesMap } from '$lib/api-types';

/**
 * Conservative fallback while the meta fetch is in flight: only the
 * unconditional `required` toggle renders — type-specific sections appear
 * once the matrix resolves (never show a wrong section, e.g. regex on boolean).
 */
const FALLBACK: TypeCapabilities = {
  validation: { required: true, unsigned: false, regex: false },
  widget: {},
};

interface CapabilitiesCache {
  map: TypeCapabilitiesMap | null;
  loading: boolean;
  error: string | null;
  fetched: boolean;
}

// svelte-ignore state_referenced_locally — module-level singleton, intentionally shared.
const _state = $state<CapabilitiesCache>({ map: null, loading: false, error: null, fetched: false });

let _promise: Promise<void> | null = null;

async function load(): Promise<void> {
  _state.loading = true;
  _state.error = null;
  const p = (async () => {
    try {
      const meta = await fetchConfigEntryMeta();
      _state.map = meta.type_capabilities ?? {};
      _state.fetched = true;
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to load type capabilities';
    } finally {
      _state.loading = false;
      _promise = null;
    }
  })();
  _promise = p;
  return p;
}

export function useTypeCapabilities() {
  function ensureLoaded(): Promise<void> {
    if (_state.fetched || _state.loading || _promise) return _promise ?? Promise.resolve();
    return load();
  }

  return {
    get state(): DeepReadonly<CapabilitiesCache> {
      return _state as DeepReadonly<CapabilitiesCache>;
    },
    ensureLoaded,
    /**
     * Capabilities for one config type. Returns the permissive fallback
     * while the meta is loading; an empty record after a successful fetch
     * if the BE doesn't know the type.
     */
    capabilitiesFor(type: ConfigEntryType): TypeCapabilities {
      if (!_state.fetched) return FALLBACK;
      return _state.map?.[type] ?? { validation: { required: true, unsigned: false, regex: false }, widget: {} };
    },
  };
}
