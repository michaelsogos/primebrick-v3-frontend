import type { TooltipPriority } from '$lib/components/ui/tooltip';

/**
 * Shared help shape for field-label tooltips — the single hint channel.
 * Consumed by `FormLabelWithPriorityHelp`, `PrimeField` (`help` prop,
 * pre-mapped variant) and `SwitchField` (`tooltip*` props mirror it).
 */
export interface FieldHelp {
	/** Translated tooltip body. Omit for a marker-only trigger. */
	text?: string;
	/** Priority/severity — drives trigger icon and tooltip chrome. */
	priority?: TooltipPriority;
	/** Translated tooltip title. */
	title?: string;
	/** i18n key for the muted italic qualifier next to the icon. */
	labelKey?: string;
}
