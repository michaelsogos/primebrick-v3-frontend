import { describe, it, expect, vi } from 'vitest';
import {
	resolvePageForPath,
	extractTemplateParams,
} from '$lib/navigation/page-resolver';
import type { ModuleInfo } from '$lib/api-types';

// Keep the REAL routesCensusFromModules — the resolver must exercise the
// actual census flattening (routes + nav leaves, access-filtered payload);
// only the network seam is stubbed.
vi.mock('$lib/api', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/api')>()),
	fetchModules: vi.fn(),
}));

const aiModule: ModuleInfo = {
	id: 'ai',
	name: 'AI',
	enabled: true,
	part_of: 'system',
	route_prefixes: ['/system/ai'],
	nav: [
		{ id: 'console', label_key: 'ai.nav.console', href: '/system/ai/console', default: true },
		{ id: 'docs', label_key: 'ai.nav.docs', href: '/system/ai/docs-index' },
	],
	routes: [
		{
			route: '/system/ai/console',
			kind: 'page',
			component_url: '/ws/ai/api/v1/module-assets/ai-pages.js',
			component_format: 'esm-mount',
		},
		{
			route: '/system/ai/docs-index',
			kind: 'page',
			component_url: '/ws/ai/api/v1/module-assets/ai-pages.js',
			component_format: 'esm-mount',
		},
	] as ModuleInfo['routes'],
};

const emailsenderModule: ModuleInfo = {
	id: 'emailsender',
	name: 'Emailsender',
	enabled: true,
	part_of: 'system',
	route_prefixes: ['/system/emailsender'],
	nav: [
		{ id: 'providers', label_key: 'emailsender.nav.providers', href: '/system/emailsender/providers', default: true },
	],
	routes: [
		{ route: '/system/emailsender/providers' },
		{
			route: '/system/emailsender/providers/create',
			kind: 'page',
			component_url: '/ws/emailsender/api/v1/module-assets/emailsender-pages.js',
			component_format: 'esm-mount',
		},
		{
			route: '/system/emailsender/providers/[uuid]',
			kind: 'page',
			component_url: '/ws/emailsender/api/v1/module-assets/emailsender-pages.js',
			component_format: 'esm-mount',
		},
	] as ModuleInfo['routes'],
};

const settingsModule: ModuleInfo = {
	id: 'settings',
	name: 'Settings',
	enabled: true,
	part_of: 'system',
	is_reserved: true,
	is_default: true,
	route_prefixes: ['/system/settings'],
	nav: [
		{ id: 'profile', label_key: 'tabs.profile', href: '/system/settings/profile', default: true },
		{ id: 'users', label_key: 'tabs.users', href: '/system/settings/users' },
	],
	routes: [
		{ route: '/system/settings/profile' },
		{ route: '/system/settings/users' },
	] as ModuleInfo['routes'],
};

const jobModule: ModuleInfo = {
	id: 'job',
	name: 'Job',
	enabled: true,
	part_of: 'system',
	route_prefixes: ['/system/job'],
	nav: [
		{ id: 'schedules', label_key: 'job.nav.schedules', href: '/system/job/job-schedules', default: true },
		// Host-rendered leaf — static page exists but no component_url decl.
		{ id: 'rules', label_key: 'job.nav.rules', href: '/system/job/rules' },
	],
	routes: [{ route: '/system/job/job-schedules' }] as ModuleInfo['routes'],
};

// Access-filtered OUT — the payload keeps prefixes but no leaves/routes.
const webhookModule: ModuleInfo = {
	id: 'webhook',
	name: 'Webhook',
	enabled: true,
	part_of: 'system',
	route_prefixes: ['/system/webhook'],
	accessible: false,
	nav: [],
	nav_hidden: [{ id: 'hooks', label_key: 'webhook.nav.hooks', href: '/system/webhook/hooks' }],
};

// A second part_of:system root family member with no is_default — used to
// prove the root rule falls back to the first enabled+accessible module.
const crmModule: ModuleInfo = {
	id: 'crm',
	name: 'CRM',
	enabled: true,
	part_of: 'crm',
	is_default: true,
	route_prefixes: ['/crm'],
	nav: [{ id: 'customers', label_key: 'crm.nav.customers', href: '/crm/customers', default: true }],
	routes: [{ route: '/crm/customers' }] as ModuleInfo['routes'],
};

const MODULES: ModuleInfo[] = [
	settingsModule,
	aiModule,
	emailsenderModule,
	jobModule,
	webhookModule,
	crmModule,
];

describe('resolvePageForPath — declared remote routes', () => {
	it('exact remote route resolves to remote + decl', () => {
		const r = resolvePageForPath('/system/ai/console', MODULES);
		expect(r.kind).toBe('remote');
		if (r.kind === 'remote') {
			expect(r.decl.route).toBe('/system/ai/console');
			expect(r.decl.component_url).toContain('ai-pages.js');
			expect(r.params).toEqual({});
		}
	});

	it('template remote route extracts [param] segments', () => {
		const r = resolvePageForPath('/system/emailsender/providers/9f8c-uuid', MODULES);
		expect(r.kind).toBe('remote');
		if (r.kind === 'remote') {
			expect(r.decl.route).toBe('/system/emailsender/providers/[uuid]');
			expect(r.params).toEqual({ uuid: '9f8c-uuid' });
		}
	});

	it('exact decl beats a same-length template — create is not a uuid', () => {
		const r = resolvePageForPath('/system/emailsender/providers/create', MODULES);
		expect(r.kind).toBe('remote');
		if (r.kind === 'remote') {
			expect(r.decl.route).toBe('/system/emailsender/providers/create');
			expect(r.params).toEqual({});
		}
	});
});

describe('resolvePageForPath — namespace roots', () => {
	it('module bare prefix redirects to the declared default leaf', () => {
		expect(resolvePageForPath('/system/ai', MODULES)).toEqual({
			kind: 'redirect',
			href: '/system/ai/console',
		});
		expect(resolvePageForPath('/system/settings', MODULES)).toEqual({
			kind: 'redirect',
			href: '/system/settings/profile',
		});
	});

	it('module prefix without default falls back to the first leaf', () => {
		const noDefault: ModuleInfo = {
			...jobModule,
			nav: [
				{ id: 'a', label_key: 'x', href: '/system/job/aaa' },
				{ id: 'b', label_key: 'x', href: '/system/job/bbb' },
			],
		};
		expect(resolvePageForPath('/system/job', [noDefault])).toEqual({
			kind: 'redirect',
			href: '/system/job/aaa',
		});
	});

	it('part_of root redirects to the is_default module default leaf', () => {
		expect(resolvePageForPath('/system', MODULES)).toEqual({
			kind: 'redirect',
			href: '/system/settings/profile',
		});
		expect(resolvePageForPath('/crm', MODULES)).toEqual({
			kind: 'redirect',
			href: '/crm/customers',
		});
	});

	it('part_of root without is_default lands on the first enabled+accessible module', () => {
		const modules = MODULES.map((m) =>
			m.id === 'settings' ? { ...m, is_default: false } : m,
		);
		// First part_of:'system' module in payload order wins (settings is
		// still first here — exclude it to prove ordering matters).
		const r = resolvePageForPath('/system', modules.filter((m) => m.id !== 'settings'));
		expect(r).toEqual({ kind: 'redirect', href: '/system/ai/console' });
	});

	it('prefix of an access-filtered module is denied — no leaves survive', () => {
		const r = resolvePageForPath('/system/webhook', MODULES);
		expect(r.kind).toBe('denied');
	});
});

describe('resolvePageForPath — contract drift + unknown', () => {
	it('declared route without component_url surfaces a contract error', () => {
		const r = resolvePageForPath('/system/settings/users', MODULES);
		expect(r.kind).toBe('error');
		if (r.kind === 'error') {
			expect(r.error_kind).toBe('contract');
			expect(r.detail).toContain('component_url');
		}
	});

	it('nav leaf without a route decl is the same contract error', () => {
		const r = resolvePageForPath('/system/job/rules', MODULES);
		expect(r.kind).toBe('error');
		if (r.kind === 'error') expect(r.error_kind).toBe('contract');
	});

	it('path under a filtered module resolves not-found — indistinguishable', () => {
		expect(resolvePageForPath('/system/webhook/hooks', MODULES).kind).toBe('not-found');
	});

	it('unowned path resolves not-found', () => {
		expect(resolvePageForPath('/nonexistent/place', MODULES).kind).toBe('not-found');
	});
});

describe('extractTemplateParams', () => {
	it('pairs positionally with routePatternMatches', () => {
		expect(extractTemplateParams('/a/[x]/b/[y]', '/a/1/b/2')).toEqual({ x: '1', y: '2' });
		expect(extractTemplateParams('/a/b', '/a/b')).toEqual({});
	});
});
