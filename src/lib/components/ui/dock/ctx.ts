import { getContext, setContext } from 'svelte';
import type { MotionValue } from 'svelte-motion';

const DOCK_KEY = Symbol('dock');

type DockContext = {
	mouseX: MotionValue<number>;
	magnification: number;
	distance: number;
};

export function setDockContext(props: DockContext) {
	setContext(DOCK_KEY, props);
}

export function getDockContext() {
	return getContext<DockContext>(DOCK_KEY);
}
