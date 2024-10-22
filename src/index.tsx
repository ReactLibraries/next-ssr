"use client";

import React, {
  ReactNode,
  useContext,
  useId,
  useRef,
  useCallback,
  useSyncExternalStore,
  createContext,
  useEffect,
  FC,
} from "react";

const DATA_NAME = "__NEXT_DATA_PROMISE__";
const isServerSide = typeof window === "undefined";

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
  resolve: () => void;
  finished: boolean;
  promise: Promise<void>;
  renderMap: Map<string | number, Set<Render>>;
  isDataRender?: boolean;
};

/**
 * Context for asynchronous data management
 */
const promiseContext = createContext<ContextType>(undefined as never);

/**
 * Rendering event propagation
 */
const render = (
  renderMap: Map<string | number, Set<Render>>,
  key: string | number
) => renderMap.get(key)?.forEach((render) => render());

/**
 * Asynchronous data loading
 */
const loader = <T,>(
  key: string | number,
  context: ContextType,
  fetcher?: () => Promise<T>
) => {
  const { promises, values, renderMap } = context;
  const _fetcher = fetcher ?? values[key]?.fetcher;
  if (!_fetcher) throw new Error("Empty by fetcher");
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
  if (isServerSide) {
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
    if (isServerSide) {
      throw promise;
    }
  } else if (value.isLoading) {
    if (isServerSide) throw value.promise;
  } else if (!value.fetcher) {
    value.fetcher = fetcher;
  }

  return { ...value, reload };
};

/**
 * Transfer of SSR data to clients
 */
const DataRender = () => {
  const ssrContext = useContext(promiseContext);
  if (isServerSide && !ssrContext.finished) {
    let length: number;
    while ((length = ssrContext.promises.size)) {
      throw Promise.allSettled(ssrContext.promises).then(() => {
        if (length === ssrContext.promises.size) {
          ssrContext.promises.clear();
        }
      });
    }
  }
  ssrContext.finished = true;
  ssrContext.resolve();
  return (
    <script
      id={DATA_NAME}
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(ssrContext.values).replace(/</g, "\\u003c"),
      }}
    />
  );
};
export const SSRDataRender = () => {
  const ssrContext = useContext(promiseContext);
  if (ssrContext.isDataRender) return null;
  ssrContext.isDataRender = true;
  return <DataRender />;
};
/**
 * Context data initialization hook
 */
const useContextValue = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const refContext = useRef<ContextType>({
    values: {},
    promises: new Set(),
    finished: false,
    renderMap: new Map<string, Set<Render>>(),
    resolve,
    promise,
  });
  if (!isServerSide && !refContext.current.finished) {
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
    <SSRHeadProvider>
      <promiseContext.Provider value={value}>
        {children}
        <SSRDataRender />
      </promiseContext.Provider>
    </SSRHeadProvider>
  );
};

export const SSRWait = ({ children }: { children: ReactNode }) => {
  const ssrContext = useContext(promiseContext);
  if (isServerSide) {
    if (!ssrContext.finished) {
      throw ssrContext.promise;
    }
  }
  return children;
};

//---------------------

const HEAD_DATA_NAME = "__REMIX_HEAD_VALUE__";

export type HeadContextType<T = ReactNode[]> = {
  state: T;
  storeChanges: Set<() => void>;
  dispatch: (callback: (state: T) => T) => void;
  subscribe: (onStoreChange: () => void) => () => void;
  promise: Promise<void>;
  resolve: () => void;
  finished: boolean;
};

export const useCreateHeadContext = <T,>(initState: () => T) => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const context = useRef<HeadContextType<T>>({
    state: initState(),
    storeChanges: new Set(),
    dispatch: (callback) => {
      context.state = callback(context.state);
      context.storeChanges.forEach((storeChange) => storeChange());
    },
    subscribe: (onStoreChange) => {
      context.storeChanges.add(onStoreChange);
      return () => {
        context.storeChanges.delete(onStoreChange);
      };
    },
    promise,
    resolve,
    finished: false,
  }).current;
  return context;
};

const HeadContext = createContext<
  HeadContextType<{ type: string; props: Record<string, unknown> }[][]>
>(undefined as never);

const Wait = () => {
  const context = useContext(HeadContext);
  if (!context.finished) {
    context.finished = true;
    context.resolve();
  }
  return null;
};

const SSRHeadProvider = ({ children }: { children: ReactNode }) => {
  const context = useCreateHeadContext<
    { type: string; props: Record<string, unknown> }[][]
  >(() => {
    if (typeof window !== "undefined") {
      return [
        JSON.parse(
          document.querySelector(`script#${HEAD_DATA_NAME}`)?.textContent ??
            "{}"
        ),
      ];
    }
    return [[]];
  });
  return (
    <HeadContext.Provider value={context}>
      {children}
      <Wait />
    </HeadContext.Provider>
  );
};

export const SSRHeadRoot: FC = () => {
  return (
    <SSRWait>
      <HeadRoot />
    </SSRWait>
  );
};

const HeadRoot: FC = () => {
  const context = useContext(HeadContext);
  if (isServerSide && !context.finished) {
    throw context.promise;
  }
  const state = useSyncExternalStore(
    context.subscribe,
    () => context.state,
    () => context.state
  );
  useEffect(() => {
    context.dispatch(() => {
      return [];
    });
  }, [context]);
  const heads = state.flat();
  return (
    <>
      <script
        id={HEAD_DATA_NAME}
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(heads).replace(/</g, "\\u003c"),
        }}
      />
      {heads.map(({ type: Tag, props }, index) => (
        <Tag key={`HEAD${Tag}${index}`} {...props} />
      ))}
    </>
  );
};

export const SSRHead: FC<{ children: ReactNode }> = ({ children }) => {
  const context = useContext(HeadContext);
  useEffect(() => {
    const value = extractInfoFromChildren(children);
    context.dispatch((heads) => [...heads, value]);
    return () => {
      context.dispatch((heads) => heads.filter((head) => head !== value));
    };
  }, [children, context]);

  if (isServerSide) {
    context.dispatch((heads) => [...heads, extractInfoFromChildren(children)]);
  }
  return null;
};

const extractInfoFromChildren = (
  children: ReactNode
): { type: string; props: Record<string, unknown> }[] =>
  React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement(child)) {
      if (child.type === React.Fragment) {
        return extractInfoFromChildren(child.props.children);
      }
      if (typeof child.type === "string") {
        return [{ type: child.type, props: child.props }];
      }
    }
    return [];
  });
