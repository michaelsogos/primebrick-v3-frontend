import { type VariantProps, tv } from '@primebrick/ui/vendor/tailwind-variants';

export const loadingBarVariants = tv({
	base: "w-full overflow-hidden rounded-full relative",
	variants: {
		size: {
			xs: "h-0.5",
			sm: "h-1",
		},
		variant: {
			muted: "bg-muted",
		},
	},
	defaultVariants: {
		size: "xs",
		variant: "muted",
	},
});

export type LoadingBarSize = VariantProps<typeof loadingBarVariants>["size"];
export type LoadingBarVariant = VariantProps<typeof loadingBarVariants>["variant"];
