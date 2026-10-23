<script lang="ts">
	/**
	 * DEV-ONLY harness — runtime .svelte source compilation spike.
	 * Mounts real source files compiled in-browser via svelte/compiler,
	 * without touching the existing remote-page implementation.
	 */
	import {
		loadSourceModule,
		mountReport,
		loadCompiler,
		type LoaderReport,
	} from '$lib/dev/runtime-source-loader';

	const TARGETS = [
		{ id: 'probe', label: 'probe (trivial)', url: '/src/lib/dev/rc-probe.svelte', props: { label: 'rc-probe' } },
		{ id: 'gauge', label: 'ScoreGauge (real)', url: '/@fs/D:/git/primebrick/primebrick-v3-ui/src/lib/components/ai/ScoreGauge.svelte', props: { value: 3.7, label: 'POWER' } },
	];

	let logs = $state<string[]>([]);
	let report = $state<LoaderReport | null>(null);
	let busy = $state(false);
	let compilerInfo = $state('');
	let target = $state<HTMLDivElement | undefined>();

	function log(s: string) {
		logs = [...logs, s];
	}

	async function checkCompiler() {
		try {
			const c = await loadCompiler();
			compilerInfo = `compiler loaded — VERSION=${(c as { VERSION?: string }).VERSION ?? '?'} compile=${typeof c.compile} compileModule=${typeof c.compileModule}`;
		} catch (e) {
			compilerInfo = `COMPILER LOAD FAILED: ${e}`;
		}
	}

	async function run(id: string) {
		const t = TARGETS.find((x) => x.id === id)!;
		if (!target) return;
		busy = true;
		logs = [];
		report = null;
		target.innerHTML = '';
		try {
			const rep = await loadSourceModule(t.url);
			report = rep;
			log(`compiled ${rep.modules.length} module(s) — total ${rep.totalMs.toFixed(1)}ms`);
			for (const m of rep.modules) {
				log(`  [${m.kind}] ${m.url.split('/').pop()} — ${m.compileMs.toFixed(1)}ms, css=${m.css ? m.css.length + 'b' : 'none'}`);
				for (const s of m.specifiers) log(`      ← ${s}`);
			}
			const renamed = new Set(rep.renamedImports.map((r) => r.from));
			if (renamed.size) log(`host-env ← ${[...renamed].join(', ')}`);
			if (rep.failed.length) {
				for (const f of rep.failed) log(`FAIL [${f.stage}] ${f.url}\n    ${f.error}`);
				return;
			}
			await mountReport(rep, target, t.props);
			log('MOUNTED ✓');
		} catch (e) {
			log(`ERROR ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
		} finally {
			busy = false;
		}
	}
</script>

<div class="p-6 space-y-4 max-w-4xl">
	<h1 class="text-lg font-bold">runtime-compile spike</h1>

	<div class="flex gap-2 items-center flex-wrap">
		<button class="px-3 py-1.5 rounded bg-muted text-sm" onclick={checkCompiler}>check compiler</button>
		{#each TARGETS as t (t.id)}
			<button class="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm" disabled={busy} onclick={() => run(t.id)}>
				{t.label}
			</button>
		{/each}
	</div>

	{#if compilerInfo}<p class="text-xs font-mono text-muted-foreground">{compilerInfo}</p>{/if}

	<div bind:this={target} class="border border-dashed border-violet-500 rounded p-4 min-h-24"></div>

	<pre class="text-[11px] font-mono bg-muted/40 rounded p-3 whitespace-pre-wrap max-h-96 overflow-auto">{logs.join('\n')}</pre>
</div>
