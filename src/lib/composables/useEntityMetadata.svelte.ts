import { apiFetch } from '$lib/api';
import { toast } from '$lib/errors/toast';
import type { AuditField } from './useAuditBox';

export interface EntityMetadata {
  auditingColumns?: AuditField[];
  entity?: string;
  titleKey?: string;
  updatePageTitle?: string;
  uid?: string;
  list?: any;
  stickyColumns?: any[];
  defaultSort?: any;
  pageSizeOptions?: number[];
  searchPlaceholderKey?: string;
}

export interface UseEntityMetadataOptions {
  endpoint: string;
  entityName: string;
  onError?: (error: any) => void;
}

export interface UseEntityMetadataResult {
  meta: EntityMetadata | null;
  loading: boolean;
  error: string | null;
  loadMetadata: () => Promise<void>;
}

export function useEntityMetadata(options: UseEntityMetadataOptions): UseEntityMetadataResult {
  const { endpoint, entityName } = options;
  
  let meta = $state<EntityMetadata | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadMetadata() {
    loading = true;
    error = null;
    
    try {
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        
        // Code Guardrail: Check if metadata becomes null after loading
        if (!data || !data.auditingColumns || data.auditingColumns.length === 0) {
          console.error('[METADATA PARSING ERROR] Metadata loaded but auditingColumns is null or empty:', {
            endpoint,
            entity: entityName,
            response: data,
            timestamp: new Date().toISOString()
          });
          
          // RFC ERROR TOAST - Metadata parsing error
          toast.error('Metadata parsing error: auditingColumns is null or empty', {
            description: `Endpoint: ${endpoint}, Entity: ${entityName}`
          });
          
          meta = data; // Still set meta even if empty
        } else {
          meta = data;
        }
      } else {
        // Code Guardrail: Metadata endpoint error
        console.error('[METADATA ENDPOINT ERROR] Failed to load metadata:', {
          endpoint,
          entity: entityName,
          status: res.status,
          statusText: res.statusText,
          timestamp: new Date().toISOString()
        });
        
        // RFC ERROR TOAST - Metadata endpoint error
        toast.error(`Failed to load metadata: ${res.status} ${res.statusText}`, {
          description: `Endpoint: ${endpoint}, Entity: ${entityName}`
        });
        
        error = `Failed to load metadata: ${res.status} ${res.statusText}`;
      }
    } catch (err) {
      // Code Guardrail: Network/other error
      console.error('[METADATA NETWORK ERROR] Failed to load entity metadata:', {
        endpoint,
        entity: entityName,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString()
      });
      
      // RFC ERROR TOAST - Network error
      toast.error(`Network error: ${err instanceof Error ? err.message : String(err)}`, {
        description: `Endpoint: ${endpoint}, Entity: ${entityName}`
      });
      
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  return {
    get meta() { return meta; },
    get loading() { return loading; },
    get error() { return error; },
    loadMetadata
  };
}
