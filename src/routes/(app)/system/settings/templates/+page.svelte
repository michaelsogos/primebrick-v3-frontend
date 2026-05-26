<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { FileText, Mail, FileSpreadsheet, Code2, Upload, Download, Trash2, Plus } from 'lucide-svelte';

  let uploadedFile = $state<File | null>(null);
  let selectedType = $state<'pdf' | 'email' | 'excel' | 'html'>('pdf');

  const templates = $state([
    { id: 1, name: 'Invoice PDF', type: 'pdf', fileName: 'invoice.pdf' },
    { id: 2, name: 'Welcome Email', type: 'email', fileName: 'welcome.html' },
    { id: 3, name: 'Product List Excel', type: 'excel', fileName: 'products.xlsx' },
    { id: 4, name: 'Report HTML', type: 'html', fileName: 'report.html' }
  ]);

  const templateTypes = [
    { id: 'pdf', label: 'PDF', icon: FileText },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'excel', label: 'Excel', icon: FileSpreadsheet },
    { id: 'html', label: 'HTML', icon: Code2 }
  ];

  function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      uploadedFile = target.files[0];
    }
  }

  function handleUpload() {
    if (uploadedFile) {
      // TODO: Implement template upload logic
      console.log('Uploading template:', uploadedFile.name, 'Type:', selectedType);
      uploadedFile = null;
    }
  }

  function handleDeleteTemplate(templateId: number) {
    // TODO: Implement template deletion logic
    console.log('Deleting template:', templateId);
  }

  function handleDownloadTemplate(templateId: number) {
    // TODO: Implement template download logic
    console.log('Downloading template:', templateId);
  }

  const filteredTemplates = $derived(templates.filter(t => t.type === selectedType));
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.templates.title')}</h2>

  <!-- Template Type Selector -->
  <div class="flex gap-2">
    {#each templateTypes as type (type.id)}
      {@const Icon = type.icon}
      <Button
        variant={selectedType === type.id ? 'default' : 'outline'}
        onclick={() => selectedType = type.id}
      >
        <Icon class="mr-2 size-4" />
        {type.label}
      </Button>
    {/each}
  </div>

  <!-- Upload Template -->
  <div class="space-y-4 rounded-lg border p-4">
    <h3 class="text-lg font-medium">{$t('shell.settings.templates.uploadTemplate')}</h3>
    
    <div>
      <label for="templateFile" class="text-sm font-medium leading-none">{$t('shell.settings.templates.selectTemplateFile')}</label>
      <Input
        id="templateFile"
        type="file"
        accept=".pdf,.html,.xlsx,.xls"
        onchange={handleFileUpload}
        class="mt-2"
      />
    </div>

    {#if uploadedFile}
      <div class="flex items-center gap-2 text-sm">
        <Upload class="size-4" />
        <span>{uploadedFile.name}</span>
        <Badge variant="outline">{(uploadedFile.size / 1024).toFixed(2)} KB</Badge>
      </div>
      <Button onclick={handleUpload}>{$t('shell.settings.templates.uploadButton')}</Button>
    {/if}
  </div>

  <!-- Templates List -->
  <div class="space-y-4 rounded-lg border p-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-medium">{$t('shell.settings.templates.templatesList')}</h3>
      <Button variant="outline" size="sm">
        <Plus class="mr-2 size-4" />
        {$t('shell.settings.templates.createTemplate')}
      </Button>
    </div>
    
    <div class="space-y-2">
      {#each filteredTemplates as template (template.id)}
        {@const Icon = templateTypes.find(t => t.id === template.type)?.icon || FileText}
        <div class="flex items-center justify-between rounded-lg border p-3">
          <div class="flex items-center gap-3">
            <Icon class="size-5" />
            <div>
              <p class="font-medium">{template.name}</p>
              <p class="text-sm text-muted-foreground">{template.fileName}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="icon" onclick={() => handleDownloadTemplate(template.id)}>
              <Download class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onclick={() => handleDeleteTemplate(template.id)}>
              <Trash2 class="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
