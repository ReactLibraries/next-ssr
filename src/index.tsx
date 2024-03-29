'use client';

import React, {
  ReactNode,
  useContext,
  useId,
  useRef,
  useCallback,
  useSyncExternalStore,
  createContext,
} from 'react';

const DATA_NAME = '__NEXT_DATA_PROMISE__';

type StateType<T> = {
  data?: T;
  error?: unknown;
  isLoading: boolean;
  fetcher: () => Promise<T>;
  promise?: Promise<T>;
};
type Render = () => void;
type ContextType = {
  values: { [key: string]: StateType<unknown> };
  promises: Set<Promise<unknown>>;
  finished: boolean;
  renderMap: Map<string | number, Set<Render>>;
};

/**
 * Context for asynchronous data management
 */
const promiseContext = createContext<ContextType>(undefined as never);

/**
 * Rendering event propagation
 */
const render = (renderMap: Map<string | number, Set<Render>>, key: string | number) =>
  renderMap.get(key)?.forEach((render) => render());

/**
 * Asynchronous data loading
 */
const loader = <T,>(key: string | number, context: ContextType, fetcher?: () => Promise<T>) => {
  const { promises, values, renderMap } = context;
  const _fetcher = fetcher ?? values[key]?.fetcher;
  if (!_fetcher) throw new Error('Empty by fetcher');
  const value: StateType<T> = {
    data: values[key]?.data as T,
    error: undefined,
    isLoading: true,
    fetcher: _fetcher as () => Promise<T>,
  };
  values[key] = value;
  render(renderMap, key);
  const promise = _fetcher();
  value.promise = promise as Promise<T>;
  if (typeof window === 'undefined') {
    promises.add(promise);
  }
  promise
    .then((v) => {
      values[key] = {
        data: v,
        error: undefined,
        isLoading: false,
        fetcher: _fetcher,
      };
      render(renderMap, key);
    })
    .catch((error) => {
      values[key] = {
        data: undefined,
        error,
        isLoading: false,
        fetcher: _fetcher,
      };
      render(renderMap, key);
    });
  return promise;
};

/**
 * hook for re-loading
 */
export const useReload = (key: string | number) => {
  const context = useContext(promiseContext);
  return useCallback(() => {
    loader(key, context);
  }, [context, key]);
};

/**
 * Asynchronous data acquisition hook for SSR
 */
export const useSSR = <T,>(
  fetcher: () => Promise<T>,
  { key }: { key?: string | number } = {}
): StateType<T> & { reload: () => void } => {
  const context = useContext(promiseContext);
  const { values, renderMap } = context;
  const id = useId();
  const cacheKey = key ?? id;

  const value = useSyncExternalStore(
    (callback) => {
      const renderSet = renderMap.get(cacheKey) ?? new Set<Render>();
      renderMap.set(cacheKey, renderSet);
      renderSet.add(callback);
      return () => renderSet.delete(callback);
    },
    () => values[cacheKey] as StateType<T>,
    () => values[cacheKey] as StateType<T>
  );

  const reload = useCallback(() => {
    return loader(cacheKey, context, fetcher);
  }, [cacheKey, context, fetcher]);
  if (!value) {
    const promise = reload();
    if (typeof window === 'undefined') {
      throw promise;
    }
  } else if (value.isLoading) {
    if (typeof window === 'undefined') throw value.promise;
  } else if (!value.fetcher) {
    value.fetcher = fetcher;
  }

  return { ...value, reload };
};

/**
 * Transfer of SSR data to clients
 */
const DataRender = () => {
  const context = useContext(promiseContext);
  if (typeof window === 'undefined' && !context.finished) {
    let length: number;
    while ((length = context.promises.size)) {
      throw Promise.allSettled(context.promises).then(() => {
        if (length === context.promises.size) {
          context.promises.clear();
        }
      });
    }
  }
  return (
    <script
      id={DATA_NAME}
      type="application/json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(context.values) }}
    />
  );
};

/**
 * Context data initialization hook
 */
const useContextValue = () => {
  const refContext = useRef<ContextType>({
    values: {},
    promises: new Set(),
    finished: false,
    renderMap: new Map<string, Set<Render>>(),
  });
  if (typeof window !== 'undefined' && !refContext.current.finished) {
    const node = document.getElementById(DATA_NAME);
    if (node) refContext.current.values = JSON.parse(node.innerHTML);
    refContext.current.finished = true;
  }
  return refContext.current;
};

/**
 * Provider for asynchronous data management
 */
export const SSRProvider = ({ children }: { children: ReactNode }) => {
  const value = useContextValue();
  return (
    <promiseContext.Provider value={value}>
      {children}
      <DataRender />
    </promiseContext.Provider>
  );
};
