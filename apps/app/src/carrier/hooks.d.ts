// This file adds the few React and router declarations the carrier screens need on top of the
// temporary stubs in ../vite-env.d.ts. Delete it when real type packages are installed.
declare module "react" {
  export function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    dependencies: readonly unknown[],
  ): T;
  export function useEffect(
    effect: () => undefined | (() => void),
    dependencies?: readonly unknown[],
  ): void;
}

declare module "react-router" {
  export const Link: (props: {
    to: string;
    className?: string;
    children?: unknown;
  }) => unknown;
  export function useParams(): Record<string, string | undefined>;
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string;
  }
}
