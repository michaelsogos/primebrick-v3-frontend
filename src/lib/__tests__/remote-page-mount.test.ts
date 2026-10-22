import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Component } from 'svelte';
import RemotePageMount from '../components/remote-page/RemotePageMount.svelte';
import { RemoteLoadError, type RemoteLoadResult } from '../components/remote-page/remote-loader';
import { registerHostSection } from '../components/remote-page/host-sections';
import type { ModulePageHost, PageRouteDeclaration, PageSectionDecl } from '@primebrick/ui';
import { getFallbackDict, mergeModuleDict } from '../i18n';
import { DEFAULT_LANG } from '../i18n/languages';
import Counter from './Counter.svelte';
import Echo from './Echo.svelte';
import HostSectionEcho from './HostSectionEcho.svelte';

beforeAll(() => {
	// t() returns the raw key when the dict is empty — merge the fallback so
	// the assertions see real copy.
	mergeModuleDict(DEFAULT_LANG, getFallbackDict());
});

const DECL: PageRouteDeclaration = {
	route: '/system/job/job-schedules/create',
	kind: 'page',
	component_url: '/ws/job/api/v1/module-assets/jobs-page.js',
	component_format: 'esm-mount',
};

function okLoader(mod: RemoteLoadResult['mod']): () => Promise<RemoteLoadResult> {
	return async () => ({ mod });
}

function failLoader(kind: RemoteLoadError['kind'], status?: number): () => Promise<RemoteLoadResult> {
	return async () => {
		throw new RemoteLoadError(kind, `fake ${kind} failure`, status);
	};
}

describe('RemotePageMount', () => {
	it('shows a loading state while the chunk downloads', async () => {
		let release!: (r: RemoteLoadResult) => void;
		const pending = new Promise<RemoteLoadResult>((res) => (release = res));
		render(RemotePageMount, { props: { decl: DECL, loader: () => pending } });

		expect(await screen.findByTestId('remote-page-loading')).toBeInTheDocument();
		release({ mod: { mountPage: () => undefined } });
		await waitFor(() =>
			expect(screen.queryByTestId('remote-page-loading')).not.toBeInTheDocument(),
		);
	});

	it('mounts the remote page via mountPage and passes a plain ctx', async () => {
		let seenEl: HTMLElement | null = null;
		let seenCtx: ModulePageHost | null = null;
		const mountPage = (el: HTMLElement, ctx: ModulePageHost) => {
			seenEl = el;
			seenCtx = ctx;
			el.innerHTML = '<div data-testid="remote-inner">jobs remote</div>';
			return undefined;
		};
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({ mountPage }) } });

		expect(await screen.findByTestId('remote-inner')).toBeInTheDocument();
		expect(seenEl).not.toBeNull();
		expect(seenCtx).toMatchObject({ host_version: 1, nav: DECL });
		expect(typeof seenCtx!.api).toBe('function');
		expect(typeof seenCtx!.i18n.t).toBe('function');
		expect(typeof seenCtx!.notify).toBe('function');
	});

	it('binds ctx.api to the owning service /ws/<code> base', async () => {
		const fetchSpy = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		let seenCtx: ModulePageHost | null = null;
		const mountPage = (_el: HTMLElement, ctx: ModulePageHost) => {
			seenCtx = ctx;
			return undefined;
		};
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({ mountPage }) } });
		await waitFor(() => expect(seenCtx).not.toBeNull());

		await seenCtx!.api('/api/v1/entities/job_schedule');
		const calledWith = fetchSpy.mock.calls[0]?.[0];
		expect(String(calledWith)).toContain('/ws/job/api/v1/entities/job_schedule');
		vi.unstubAllGlobals();
	});

	it('mounts a default-component export as the fallback path', async () => {
		render(RemotePageMount, {
			props: { decl: DECL, loader: okLoader({ default: Counter as Component }) },
		});
		expect(await screen.findByText('Count: 0')).toBeInTheDocument();
	});

	it('renders an in-content http error panel — never the full-page error', async () => {
		render(RemotePageMount, { props: { decl: DECL, loader: failLoader('http', 404) } });
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'http');
		expect(screen.getByTestId('remote-page-error-detail')).toHaveTextContent('HTTP 404');
		expect(screen.getByTestId('remote-page-retry')).toBeInTheDocument();
		// In-content only — the system full-page error component is absent.
		expect(screen.queryByTestId('error-page')).not.toBeInTheDocument();
	});

	it('distinguishes network/unreachable from asset errors', async () => {
		render(RemotePageMount, { props: { decl: DECL, loader: failLoader('network') } });
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'network');
	});

	it('surfaces integrity mismatches as their own kind', async () => {
		render(RemotePageMount, { props: { decl: DECL, loader: failLoader('integrity') } });
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'integrity');
	});

	it('reports a contract error when neither mount export exists', async () => {
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({}) } });
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'contract');
	});

	it('reports a mount error when mountPage throws', async () => {
		const mountPage = () => {
			throw new Error('boom in remote');
		};
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({ mountPage }) } });
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'mount');
	});

	it('retries after failure and mounts on success', async () => {
		const user = userEvent.setup();
		let calls = 0;
		const loader = async (): Promise<RemoteLoadResult> => {
			calls++;
			if (calls === 1) throw new RemoteLoadError('http', 'gone', 404);
			return {
				mod: {
					mountPage: (el: HTMLElement) => {
						el.innerHTML = '<div data-testid="remote-inner">recovered</div>';
						return undefined;
					},
				},
			};
		};
		render(RemotePageMount, { props: { decl: DECL, loader } });
		expect(await screen.findByTestId('remote-page-error')).toBeInTheDocument();

		await user.click(screen.getByTestId('remote-page-retry'));
		expect(await screen.findByTestId('remote-inner')).toBeInTheDocument();
		expect(screen.queryByTestId('remote-page-error')).not.toBeInTheDocument();
		expect(calls).toBe(2);
	});

	it('ctx.mount_host mounts a host component as a separate root with reactive updates', async () => {
		let handle: { update: (p: Record<string, unknown>) => void; destroy: () => void | Promise<void> } | null =
			null;
		const mountPage = (el: HTMLElement, ctx: ModulePageHost) => {
			const slot = document.createElement('div');
			slot.dataset.testid = 'host-slot';
			el.appendChild(slot);
			handle = ctx.mount_host!(Echo, slot, { value: 'initial' });
			return undefined;
		};
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({ mountPage }) } });

		const slot = await screen.findByTestId('host-slot');
		expect(slot).toHaveTextContent('initial');
		expect(screen.getByTestId('echo-value')).toBeInTheDocument();

		// The imperative channel pushes props into the host root reactively.
		handle!.update({ value: 'pushed' });
		await waitFor(() => expect(screen.getByTestId('echo-value')).toHaveTextContent('pushed'));
	});

	it('ctx.mount_host destroy() tears down the host root', async () => {
		let handle: { destroy: () => void | Promise<void> } | null = null;
		const mountPage = (el: HTMLElement, ctx: ModulePageHost) => {
			const slot = document.createElement('div');
			el.appendChild(slot);
			handle = ctx.mount_host!(Echo, slot, { value: 'doomed' });
			return undefined;
		};
		render(RemotePageMount, { props: { decl: DECL, loader: okLoader({ mountPage }) } });

		await screen.findByText('doomed');
		await handle!.destroy();
		await waitFor(() => expect(screen.queryByText('doomed')).not.toBeInTheDocument());
	});

	it('disposes the mounted instance on unmount', async () => {
		const dispose = vi.fn();
		const { unmount } = render(RemotePageMount, {
			props: { decl: DECL, loader: okLoader({ mountPage: () => dispose }) },
		});
		await waitFor(() =>
			expect(screen.getByTestId('remote-page-content')).not.toHaveClass('hidden'),
		);
		expect(dispose).not.toHaveBeenCalled();
		unmount();
		await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
	});
});

describe('RemotePageMount — sectioned layout', () => {
	const SECTIONED_DECL: PageRouteDeclaration = {
		...DECL,
		page_props: {
			layout: {
				columns: '280px 1fr',
				sections: [
					{ id: 'side', source: 'remote:mountSide', col: 1 },
					{ id: 'main', source: 'remote:mountMain', col: 2, props: { value: 'main-prop' } },
				],
			},
		},
	};

	it('mounts each remote:* section into its own grid cell with (el, ctx, section)', async () => {
		const calls: Array<{ id: string; ctx: ModulePageHost }> = [];
		const mod = {
			mountSide: (el: HTMLElement, ctx: ModulePageHost, s: PageSectionDecl) => {
				calls.push({ id: s.id, ctx });
				el.innerHTML = `<div data-testid="sec-${s.id}">side</div>`;
			},
			mountMain: (el: HTMLElement, ctx: ModulePageHost, s: PageSectionDecl) => {
				calls.push({ id: s.id, ctx });
				el.innerHTML = `<div data-testid="sec-${s.id}">${String(s.props?.value)}</div>`;
			},
		};
		render(RemotePageMount, { props: { decl: SECTIONED_DECL, loader: okLoader(mod) } });

		expect(await screen.findByTestId('remote-page-sections')).toBeInTheDocument();
		expect(await screen.findByTestId('sec-side')).toBeInTheDocument();
		expect(await screen.findByTestId('sec-main')).toHaveTextContent('main-prop');
		expect(calls.map((c) => c.id).sort()).toEqual(['main', 'side']);
		expect(calls[0].ctx).toMatchObject({ host_version: 1, nav: SECTIONED_DECL });
		// mountPage path is NOT used for sectioned decls
		expect(screen.queryByTestId('remote-page-content')).not.toBeInTheDocument();
		// grid container carries the declared columns
		expect(screen.getByTestId('remote-page-sections')).toHaveStyle(
			'grid-template-columns:280px 1fr',
		);
	});

	it('isolates a missing remote export to the failing cell', async () => {
		const mod = {
			mountMain: (el: HTMLElement) => {
				el.innerHTML = '<div data-testid="sec-main">ok</div>';
			},
			// mountSide absent
		};
		render(RemotePageMount, { props: { decl: SECTIONED_DECL, loader: okLoader(mod) } });

		expect(await screen.findByTestId('sec-main')).toBeInTheDocument();
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'contract');
		expect(panel).toHaveTextContent("mountSide");
	});

	it('mounts a host:* section from the registry', async () => {
		registerHostSection('echo', HostSectionEcho);
		const decl: PageRouteDeclaration = {
			...DECL,
			page_props: {
				layout: {
					sections: [{ id: 'h', source: 'host:echo', props: { value: 'from-host' } }],
				},
			},
		};
		render(RemotePageMount, {
			props: { decl, loader: okLoader({ mountPage: () => undefined }) },
		});
		expect(await screen.findByTestId('host-section-h')).toHaveTextContent('from-host');
	});

	it('renders host-only descriptor pages without any chunk fetch', async () => {
		registerHostSection('echo', HostSectionEcho);
		const loader = vi.fn(okLoader({ mountPage: () => undefined }));
		const decl: PageRouteDeclaration = {
			route: '/system/job/dashboard',
			kind: 'page',
			// no component_url — descriptor page
			page_props: {
				layout: { sections: [{ id: 'only', source: 'host:echo' }] },
			},
		};
		render(RemotePageMount, { props: { decl, loader } });
		expect(await screen.findByTestId('host-section-only')).toBeInTheDocument();
		expect(loader).not.toHaveBeenCalled();
	});

	it('remote:* sections on a chunkless decl get a per-cell contract panel', async () => {
		const decl: PageRouteDeclaration = {
			route: '/system/job/mixed',
			kind: 'page',
			page_props: {
				layout: {
					sections: [
						{ id: 'r', source: 'remote:mountR' },
						{ id: 'h', source: 'host:echo' },
					],
				},
			},
		};
		render(RemotePageMount, { props: { decl, loader: okLoader({}) } });
		expect(await screen.findByTestId('host-section-h')).toBeInTheDocument();
		const panel = await screen.findByTestId('remote-page-error');
		expect(panel).toHaveAttribute('data-error-kind', 'contract');
	});
});
