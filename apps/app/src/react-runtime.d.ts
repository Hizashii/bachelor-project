import type ReactNamespace = require("react");

declare module "react" {
  export function createContext<T>(defaultValue: T): ReactNamespace.Context<T>;
  export function useContext<T>(context: ReactNamespace.Context<T>): T;
  export function useEffect(
    effect: ReactNamespace.EffectCallback,
    deps?: ReactNamespace.DependencyList,
  ): void;
  export function useMemo<T>(
    factory: () => T,
    deps: ReactNamespace.DependencyList,
  ): T;
}
