<script lang="ts">
  import * as Table from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import JsonTableViewer from "./JsonTableViewer.svelte";

  // Riceve i dati e un flag opzionale per capire se è un nodo annidato
  let { data, isNested = false } = $props<{ data: any; isNested?: boolean }>();

  function isObject(val: any): boolean {
    return val !== null && typeof val === "object";
  }

  // Verifica se una chiave è un indice numerico di un array
  function isNumeric(val: string): boolean {
    return !isNaN(Number(val));
  }
</script>

{#if !isNested}
  <!-- LIVELLO RADICE: Usa la vera tabella di shadcn per la struttura principale -->
  <Table.Root class="w-full border rounded-md table-fixed">
    <Table.Header class="bg-muted/50">
      <Table.Row>
        <Table.Head class="w-[25%] font-semibold">Proprietà</Table.Head>
        <Table.Head class="w-[75%] font-semibold">Valore / Dettaglio</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each Object.entries(data) as [key, value]}
        <Table.Row class="align-top border-b last:border-0 hover:bg-transparent">
          <!-- Chiave di primo livello -->
          <Table.Cell class="font-mono text-sm font-semibold text-foreground/90 select-none truncate pt-3">
            {key}
          </Table.Cell>
          
          <!-- Valore di primo livello -->
          <Table.Cell class="p-2">
            {#if isObject(value)}
              <div class="flex flex-col gap-1.5 w-full">
                <Badge variant="secondary" class="font-mono text-[10px] w-fit pointer-events-none">
                  {Array.isArray(value) ? `Array [${value.length}]` : "Object {}"}
                </Badge>
                <!-- Avvia la ricorsione usando il layout CSS flessibile -->
                <div class="pl-3 border-l-2 border-muted mt-1 w-full">
                  <JsonTableViewer data={value} isNested={true} />
                </div>
              </div>
            {:else}
              <div class="font-mono text-sm break-all pt-1 px-1 text-foreground/80">
                {#if typeof value === "boolean"}
                  <Badge variant={value ? "default" : "destructive"}>{value}</Badge>
                {:else if value === null || value === undefined}
                  <span class="text-muted-foreground italic text-xs">null</span>
                {:else}
                  {value}
                {/if}
              </div>
            {/if}
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
{:else}
  <!-- LIVELLO ANNIDATO (RICORSIVO): Layout a griglia CSS per non rompere le colonne -->
  <div class="flex flex-col gap-2 w-full text-sm">
    {#each Object.entries(data) as [key, value]}
      <div class="grid grid-cols-[auto_1fr] gap-x-3 items-start w-full py-0.5">
        
        <!-- Etichetta della chiave interna -->
        <div class="font-mono text-xs text-muted-foreground min-w-[60px] pt-1">
          {#if isNumeric(key)}
            <!-- Trasforma l'indice 0, 1, 2 in un badge di indice riga -->
            <Badge variant="outline" class="text-[10px] px-1 py-0 bg-muted/30 font-normal text-muted-foreground/70">
              Item {key}
            </Badge>
          {:else}
            {key}:
          {/if}
        </div>

        <!-- Valore interno -->
        <div class="w-full">
          {#if isObject(value)}
            <div class="flex flex-col gap-1 w-full">
              <Badge variant="outline" class="font-mono text-[9px] w-fit text-muted-foreground/60 scale-95 origin-left pointer-events-none">
                {Array.isArray(value) ? `Array [${value.length}]` : "Object {}"}
              </Badge>
              <div class="pl-3 border-l-2 border-muted/60 w-full">
                <!-- Richiamo ricorsivo profondo -->
                <JsonTableViewer data={value} isNested={true} />
              </div>
            </div>
          {:else}
            <div class="font-mono text-xs break-all text-foreground/90 pt-0.5">
              {#if typeof value === "boolean"}
                <Badge variant={value ? "default" : "destructive"} class="text-[10px] px-1 py-0">{value}</Badge>
              {:else if value === null || value === undefined}
                <span class="text-muted-foreground italic text-[11px]">null</span>
              {:else}
                {value}
              {/if}
            </div>
          {/if}
        </div>

      </div>
    {/each}
  </div>
{/if}
