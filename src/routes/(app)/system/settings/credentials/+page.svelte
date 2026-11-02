<script lang="ts">
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import ChangePasswordCard from '$lib/components/auth/ChangePasswordCard.svelte';
  import PasskeyEnrollment from '$lib/components/auth/PasskeyEnrollment.svelte';
  import MfaManagement from '$lib/components/auth/MfaManagement.svelte';
</script>

<AppPageScaffold>

  <div class="min-h-0 flex-1 overflow-auto p-4">
    <div class="space-y-6">
      <ChangePasswordCard />
      <PasskeyEnrollment />
      <MfaManagement />
    </div>
  </div>
</AppPageScaffold>
