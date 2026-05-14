import { getContext, setContext } from 'svelte';

const CHOICEBOX_KEY = Symbol('choicebox');

type ChoiceboxContext = {
	activeValue: () => string | undefined;
	setActive: (v: string) => void;
};

export function setChoiceboxContext(props: ChoiceboxContext) {
	setContext(CHOICEBOX_KEY, props);
}

export function getChoiceboxContext() {
	return getContext<ChoiceboxContext>(CHOICEBOX_KEY);
}
