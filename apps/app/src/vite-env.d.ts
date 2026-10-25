// This file supplies the small browser declarations needed before app type packages are added.
declare module "react" {
  export type ReactElement = unknown;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): {
    render(element: unknown): void;
  };
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
