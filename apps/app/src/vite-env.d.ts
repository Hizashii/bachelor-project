// This file supplies the small browser declarations needed before app type packages are added.
declare module "react" {
  export type ReactElement = unknown;
  export type ReactNode = unknown;
  export function useState<T>(
    initialValue: T,
  ): [T, (value: T | ((currentValue: T) => T)) => void];
  export function useMemo<T>(
    factory: () => T,
    dependencies: readonly unknown[],
  ): T;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): {
    render(element: unknown): void;
  };
}

declare module "react-router" {
  export const BrowserRouter: (props: { children?: unknown }) => unknown;
  export const Navigate: (props: { to: string; replace?: boolean }) => unknown;
  export const NavLink: (props: {
    to: string;
    className?: string;
    children?: unknown;
    "aria-label"?: string;
  }) => unknown;
  export const Link: (props: {
    to: string;
    className?: string;
    children?: unknown;
  }) => unknown;
  export const Route: (props: { path: string; element: unknown }) => unknown;
  export const Routes: (props: { children?: unknown }) => unknown;
  export function useLocation(): { pathname: string };
  export function useNavigate(): (to: string) => void;
}

declare module "*.css";

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, properties: unknown): unknown;
  export function jsxs(type: unknown, properties: unknown): unknown;
  export const Fragment: unknown;
}

declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}
