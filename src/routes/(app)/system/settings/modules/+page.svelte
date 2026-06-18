<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import Package from '@lucide/svelte/icons/package'
  import Upload from '@lucide/svelte/icons/upload'
  import Download from '@lucide/svelte/icons/download'
  import Trash2 from '@lucide/svelte/icons/trash-2';

  let uploadedFile = $state<File | null>(null);

  const installedModules = $state([
    { id: 1, name: 'CRM Module', version: '1.0.0', status: 'active' },
    { id: 2, name: 'Inventory Module', version: '2.1.0', status: 'active' },
    { id: 3, name: 'Billing Module', version: '0.5.0', status: 'inactive' }
  ]);

  function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      uploadedFile = target.files[0];
    }
  }

  function handleInstall() {
    if (uploadedFile) {
      // TODO: Implement module installation logic
      console.log('Installing module:', uploadedFile.name);
      uploadedFile = null;
    }
  }

  function handleDeleteModule(moduleId: number) {
    // TODO: Implement module deletion logic
    console.log('Deleting module:', moduleId);
  }
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.modules.title')}</h2>

  <!-- Upload Module -->
  <div class="space-y-4 rounded-lg border p-4">
    <h3 class="text-lg font-medium">{$t('shell.settings.modules.uploadModule')}</h3>
    
    <div>
      <label for="moduleFile" class="text-sm font-medium leading-none">{$t('shell.settings.modules.selectModuleFile')}</label>
      <Input
        id="moduleFile"
        type="file"
        accept=".zip,.tar.gz"
        onchange={handleFileUpload}
        class="mt-2"
      />
    </div>

    {#if uploadedFile}
      <div class="flex items-center gap-2 text-sm">
        <Package class="size-4" />
        <span>{uploadedFile.name}</span>
        <Badge variant="outline">{(uploadedFile.size / 1024).toFixed(2)} KB</Badge>
      </div>
      <Button onclick={handleInstall}>{$t('shell.settings.modules.installButton')}</Button>
    {/if}
  </div>

  <!-- Installed Modules List -->
  <div class="space-y-4 rounded-lg border p-4">
    <h3 class="text-lg font-medium">{$t('shell.settings.modules.installedModules')}</h3>
    
    <div class="space-y-2">
      {#each installedModules as module (module.id)}
        <div class="flex items-center justify-between rounded-lg border p-3">
          <div class="flex items-center gap-3">
            <Package class="size-5" />
            <div>
              <p class="font-medium">{module.name}</p>
              <p class="text-sm text-muted-foreground">{$t('shell.settings.modules.version')}: {module.version}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant={module.status === 'active' ? 'default' : 'secondary'}>
              {module.status === 'active' ? $t('shell.settings.modules.active') : $t('shell.settings.modules.inactive')}
            </Badge>
            <Button variant="ghost" size="icon" onclick={() => handleDeleteModule(module.id)}>
              <Trash2 class="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
