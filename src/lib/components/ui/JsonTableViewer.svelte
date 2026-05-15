<script lang="ts">
  import * as Table from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import JsonTableViewer from "./JsonTableViewer.svelte";

  // Riceve l'oggetto extra dinamico come prop
  let { data } = $props<{ data: any }>();

  // Funzione helper per capire se dobbiamo mostrare un expander
  function isObject(val: any): boolean {
    return val !== null && typeof val === "object";
  }
</script>

<Table.Root class="w-full border rounded-md overflow-hidden">
  <Table.Header class="bg-muted/50">
    <Table.Row>
      <Table.Head class="w-[30%] font-semibold">Proprietà</Table.Head>
      <Table.Head class="font-semibold">Valore / Dettaglio</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each Object.entries(data) as [key, value]}
      <Table.Row class="align-top">
        <!-- Nome della chiave JSON -->
        <Table.Cell class="font-mono text-sm font-medium pt-3 text-foreground/80">
          {key}
        </Table.Cell>

        <!-- Valore della chiave -->
        <Table.Cell class="p-1">
          {#if isObject(value)}
            <!-- Se è un oggetto o array, mostriamo un badge con il tipo -->
            <div class="py-2 px-2">
              <Badge variant="outline" class="font-mono font-normal text-[10px] mb-2">
                {Array.isArray(value) ? `Array [${value.length}]` : "Object {}"}
              </Badge>
              <!-- CHIAMATA RICORSIVA: Il componente richiama se stesso -->
              <div class="pl-4 border-l-2 border-primary/20 mt-2">
                <JsonTableViewer data={value} />
              </div>
            </div>
          {:else}
            <!-- Se è un dato primitivo, lo stampiamo direttamente -->
            <span class="text-sm font-mono break-all inline-block pt-2 px-2">
              {#if typeof value === "boolean"}
                <Badge variant={value ? "default" : "destructive"}>{value}</Badge>
              {:else if value === null || value === undefined}
                <span class="text-muted-foreground italic">null</span>
              {:else}
                {value}
              {/if}
            </span>
          {/if}
        </Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
