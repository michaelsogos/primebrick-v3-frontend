import { getContext, setContext } from 'svelte';

const WHEEL_CTX_KEY = Symbol('wheel-ctx');

export class WheelState {
	translateY = $state(0);
	isDragging = $state(false);
	loop = $state(false);
	totalCount = $state(0);
}

export function setWheelContext(props: {
	onSelect: (val: string) => void;
	selectedValue: () => string | undefined;
	register: () => void;
	unregister: () => void;
}) {
	const state = new WheelState();
	setContext(WHEEL_CTX_KEY, { ...props, state });
	return state;
}

export function getWheelContext() {
	return getContext<{
		onSelect: (val: string) => void;
		selectedValue: () => string | undefined;
		register: () => void;
		unregister: () => void;
		state: WheelState;
	}>(WHEEL_CTX_KEY);
}
