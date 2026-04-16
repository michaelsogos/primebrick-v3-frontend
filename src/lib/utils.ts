import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type WithElementRef<Props, El extends HTMLElement = HTMLElement> = Props & {
  ref?: El | null;
};

type ChildSnippet = import('svelte').Snippet;

export type WithoutChild<T> = Omit<T, 'child'> & { child?: ChildSnippet };

export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'> & {
  children?: ChildSnippet;
  child?: ChildSnippet;
};

