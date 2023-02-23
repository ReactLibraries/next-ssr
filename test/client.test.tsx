/**
 * @jest-environment jest-environment-jsdom
 */

import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { SSRProvider, useReload, useSSR } from '../src';

let prev;
beforeEach(() => {
  prev = global.IS_REACT_ACT_ENVIRONMENT;
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = prev;
});

const Component01 = () => {
  const { data } = useSSR<number>(async () => {
    return 100;
  });
  return <div id="data1">{data}</div>;
};

const Component02 = () => {
  const { data } = useSSR<number>(
    async () => {
      return data ? data + 100 : 200;
    },
    { key: 'Component02' }
  );
  const refetch = useReload('Component02');
  useEffect(() => {
    refetch();
  }, [refetch]);
  return <div id="data2">{data}</div>;
};

const Component03 = () => {
  const { error } = useSSR<number>(
    async () => {
      throw 'error';
    },
    { key: 'Component03' }
  );
  return <div id="data3">{String(error)}</div>;
};

const Component04 = () => {
  const refetch = useReload('error');
  useEffect(() => {
    try {
      refetch();
    } catch (_) {}
  }, [refetch]);
  return <div id="data4">data4</div>;
};

it('Client', async () => {
  const container = document.createElement('div');
  container.innerHTML = `<div id="data1">100</div><div id="data2">200</div><div id="data3">error</div><script id="__NEXT_DATA_PROMISE__" type="application/json">{":R5:":{"data":100,"isLoading":false},"Component02":{"data":200,"isLoading":false},"Component03":{"error":"error","isLoading":false}}</script>`;
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SSRProvider>
        <Component01 />
        <Component02 />
        <Component03 />
        <Component04 />
      </SSRProvider>
    );
  });
  expect(container.childNodes).toMatchSnapshot();
  await act(() => {
    root.unmount();
  });
  container.remove();
});
