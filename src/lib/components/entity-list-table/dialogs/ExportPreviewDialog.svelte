<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import * as Dock from '$lib/components/ui/dock';
  import * as Resizable from '$lib/components/ui/resizable';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Window } from '$lib/components/ui/window';
  import BsFiletypeHtml from '~icons/bi/filetype-html';
  import BsFiletypePdf from '~icons/bi/filetype-pdf';
  import BsEnvelopeAt from '~icons/bi/envelope-at';

  interface ExportPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    previewMode: 'html' | 'pdf' | 'email';
    onPreviewModeChange: (mode: 'html' | 'pdf' | 'email') => void;
    htmlPreviewContent: string;
    pdfBlobUrl: string | null;
    emailHtmlContent: string;
    isEmailPreparing: boolean;
    emailCopied: boolean;
    onGeneratePdfPreview: () => void;
    onPrepareEmailHtml: () => void;
    onCopyHtmlToClipboard: () => void;
    onCopyEmailHtmlToClipboard: () => void;
    onClose: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    previewMode,
    onPreviewModeChange,
    htmlPreviewContent,
    pdfBlobUrl,
    emailHtmlContent,
    isEmailPreparing,
    emailCopied,
    onGeneratePdfPreview,
    onPrepareEmailHtml,
    onCopyHtmlToClipboard,
    onCopyEmailHtmlToClipboard,
    onClose
  }: ExportPreviewDialogProps = $props();
</script>

<DialogBordered bind:open={open} color="primary" class="!w-[95vw] !h-[95vh] !max-w-none !max-h-none !p-0 flex flex-col [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:!p-4" showCloseButton={false}>
  <Dialog.Header class="pb-4 shrink-0">
    <Dialog.Title>{$t('common.htmlPreviewTitle')}</Dialog.Title>
  </Dialog.Header>

  <!-- Navigation dock -->
  <div class="relative shrink-0">
    <Dock.Root class="!absolute -top-12 left-1/2 -translate-x-1/2 z-10 !bg-primary/10 !border-primary/20 dark:!bg-primary/10" magnification={70} distance={120}>
      <Dock.Icon
        onclick={() => onPreviewModeChange('html')}
        tooltip="HTML view"
        selected={previewMode === 'html'}
      >
        <BsFiletypeHtml class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={onGeneratePdfPreview}
        tooltip="PDF view"
        selected={previewMode === 'pdf'}
      >
        <BsFiletypePdf class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={onPrepareEmailHtml}
        tooltip="Email"
        selected={previewMode === 'email'}
      >
        <BsEnvelopeAt class="w-6 h-6" />
      </Dock.Icon>
    </Dock.Root>
  </div>

  <!-- Preview content -->
  <div class="flex-1 overflow-hidden bg-background min-h-0 rounded-md relative">
    {#if previewMode === 'html'}
      <iframe
        srcdoc={htmlPreviewContent}
        class="w-full h-full border-0"
        title="HTML Preview"
        sandbox="allow-scripts"
      ></iframe>
    {:else if previewMode === 'pdf' && pdfBlobUrl}
      <iframe
        src={pdfBlobUrl}
        class="w-full h-full border-0"
        title="PDF Preview"
      ></iframe>
    {:else if previewMode === 'pdf'}
      <div class="flex items-center justify-center h-full">
        <p class="text-muted-foreground">Generating PDF...</p>
      </div>
    {:else if previewMode === 'email'}
      <div class="w-full h-full">
        {#if isEmailPreparing}
          <div class="flex items-center justify-center h-full">
            <p class="text-muted-foreground">Preparing email HTML...</p>
          </div>
        {:else}
          <Window
            class="!aspect-auto h-full w-full flex flex-col"
            contentClass="flex-1 min-h-0 !p-0"
          >
            <div class="flex h-full w-full overflow-hidden bg-background">
              <Resizable.PaneGroup direction="horizontal">
                <!-- PANNELLO SINISTRO: Elenco Mail (30% larghezza) -->
                <Resizable.Pane defaultSize={30} minSize={20}>
                  <ScrollArea class="h-full border-r p-4 bg-muted/20">
                    <h3 class="text-sm font-semibold mb-4 px-2 tracking-tight text-muted-foreground">Mailbox</h3>
                    <div class="space-y-2">
                      <!-- Item Mail Attivo (skeleton evidenziato) -->
                      <div class="p-3 space-y-2 border rounded-lg bg-card shadow-sm border-primary/50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                      
                      <!-- Skeleton per altre mail -->
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-2/3" />
                        <Skeleton class="h-3 w-1/3" />
                      </div>
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                    </div>
                  </ScrollArea>
                </Resizable.Pane>

                <Resizable.Handle withHandle />

                <!-- PANNELLO DESTRO: Area di Contenuto (Preview) -->
                <Resizable.Pane defaultSize={70}>
                  <div class="flex flex-col h-full bg-background min-h-0">
                    
                    <!-- Header dell'email (To, Subject) -->
                    <div class="p-4 border-b space-y-3 bg-card shrink-0">
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">A:</span> 
                        <span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">recipient@example.com</span>
                      </div>
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">Subject:</span>
                        <Skeleton class="h-4 flex-1" />
                      </div>
                    </div>

                    <!-- Area dell'IFrame -->
                    <div class="flex-1 bg-muted/10 relative h-full min-h-0">
                      <!-- L'iframe che ospita l'HTML puro del foglio e della tabella -->
                      <iframe 
                        title="Email Preview"
                        srcdoc={emailHtmlContent}
                        class="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin"
                      ></iframe>
                    </div>

                  </div>
                </Resizable.Pane>
                
              </Resizable.PaneGroup>
            </div>
          </Window>
        {/if}
      </div>
    {/if}
  </div>
  
  <Dialog.Footer class="gap-2 shrink-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onClose}
    >
      {$t('common.close')}
    </Button>
    {#if previewMode === 'email'}
      <Button onclick={onCopyEmailHtmlToClipboard} disabled={isEmailPreparing || !emailHtmlContent}>
        {#if emailCopied}
          Copied!
        {:else}
          Copy HTML to Clipboard
        {/if}
      </Button>
    {:else if previewMode === 'pdf'}
      <Button disabled={!pdfBlobUrl}>
        Scarica PDF
      </Button>
    {:else}
      <Button onclick={onCopyHtmlToClipboard} disabled={previewMode !== 'html'}>
        {$t('common.copyHtml')}
      </Button>
    {/if}
  </Dialog.Footer>
</DialogBordered>
