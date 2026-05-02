<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { DateFormatter, getLocalTimeZone, today, CalendarDate } from "@internationalized/date";
  import { cn } from "$lib/utils";

  let { value = $bindable() } = $props();
  let isOpen = $state(false);

  const df = new DateFormatter("it-IT", { dateStyle: "long" });

  // Range dati
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  const currentYear = today(getLocalTimeZone()).year;
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 50 + i);

  // Funzione per aggiornare la data in modo sicuro
  function updateDate(part: 'day' | 'month' | 'year', val: number) {
    if (!value) {
      value = today(getLocalTimeZone());
    }
    try {
      value = value.set({ [part]: val });
    } catch (e) {
      // Gestione mesi corti (es. 31 Febbraio -> 28 Febbraio)
      if (part === 'month' || part === 'year') {
         value = new CalendarDate(value.year, value.month, 1).set({ [part]: val });
      }
    }
  }
</script>

<Popover.Root bind:open={isOpen}>
  <Popover.Trigger>
    <Button variant="outline" class="h-14 w-full justify-start text-lg border-2 px-4 shadow-sm hover:border-primary/50 transition-all">
      <span class="mr-3 text-xl opacity-50">📅</span>
      <span class="font-medium">{value ? df.format(value.toDate(getLocalTimeZone())) : 'Seleziona data'}</span>
    </Button>
  </Popover.Trigger>

  <Popover.Content class="w-[320px] p-0 shadow-2xl border-border rounded-2xl overflow-hidden" align="start">
    <!-- Header Minimal Shadcn -->
    <div class="bg-muted/30 p-3 text-center border-b text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
      Scorri per selezionare
    </div>

    <div class="relative flex h-[280px] bg-background">
      <!-- EFFETTO SFUMATURA (Overlay) -->
      <div class="pointer-events-none absolute inset-0 z-10 h-full w-full shadow-[inset_0_40px_30px_-20px_rgba(255,255,255,1),inset_0_-40px_30px_-20px_rgba(255,255,255,1)] dark:shadow-[inset_0_40px_30px_-20px_rgba(9,9,11,1),inset_0_-40px_30px_-20px_rgba(9,9,11,1)]"></div>
      
      <!-- LINEA DI SELEZIONE CENTRALE -->
      <div class="pointer-events-none absolute top-1/2 left-0 h-12 w-full -translate-y-1/2 border-y border-primary/10 bg-primary/5 z-0"></div>

      <!-- COLONNA GIORNO -->
      <div class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20">
        <div class="py-[116px]"> <!-- Padding per centrare il primo/ultimo elemento -->
          {#each days as d}
            <button
              class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.day === d ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
              onclick={() => updateDate('day', d)}>
              {d}
            </button>
          {/each}
        </div>
      </div>

      <!-- COLONNA MESE -->
      <div class="flex-[1.5] overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 border-x border-border/50">
        <div class="py-[116px]">
          {#each months as m, i}
            <button
              class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all px-1 text-center", value?.month === i + 1 ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
              onclick={() => updateDate('month', i + 1)}>
              {m}
            </button>
          {/each}
        </div>
      </div>

      <!-- COLONNA ANNO -->
      <div class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20">
        <div class="py-[116px]">
          {#each years as y}
            <button
              class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.year === y ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
              onclick={() => updateDate('year', y)}>
              {y}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Footer buttons -->
    <div class="p-3 border-t bg-muted/10 flex gap-2">
      <Button variant="ghost" class="flex-1 h-10" onclick={() => (isOpen = false)}>Annulla</Button>
      <Button class="flex-1 h-10 shadow-lg shadow-primary/20" onclick={() => (isOpen = false)}>Ok</Button>
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  /* Nasconde la scrollbar ma mantiene lo scroll attivo */
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  /* Supporto per lo scroll smooth */
  .overflow-y-auto {
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }
</style>