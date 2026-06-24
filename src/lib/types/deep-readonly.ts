/**
 * Recursively maps a type to its read-only equivalent.
 * - Arrays become ReadonlyArray (no push, splice, index assignment)
 * - Object properties become readonly
 * - Primitives are unchanged
 *
 * Type-only — erased at compile time. No runtime wrapper.
 * The underlying $state proxy is returned as-is, preserving Svelte 5 reactivity.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
