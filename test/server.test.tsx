import { EventEmitter } from 'events';
import { JSDOM } from 'jsdom';
import React, { ReactNode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { SSRProvider, useSSR } from '../src';

class StreamReader extends EventEmitter {
  writable = true;
  private chunks: Buffer[] = [];
  constructor(private cb: (s: string) => void) {
    super();
  }
  write(chunk: Uint8Array | string) {
    this.chunks.push(Buffer.from(chunk));
    return true;
  }
  end() {
    this.cb(Buffer.concat(this.chunks).toString('utf8'));
    return this;
  }
}

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
      return 200;
    },
    { key: 'Component02' }
  );
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
  const { data } = useSSR<number>(async () => 100, { key: 'Component04' });
  return <div id="data4">{data}</div>;
};

const render = (element: ReactNode) =>
  new Promise<string>((resolve, reject) => {
    const stream = renderToPipeableStream(element, {
      onError(error) {
        reject(error);
      },
      onAllReady() {
        stream.pipe(
          new StreamReader((html) => {
            resolve(html);
          })
        );
      },
    });
  });

it('SSR', async () => {
  const stream = await render(
    <SSRProvider>
      <Component01 />
      <Component02 />
      <Component03 />
    </SSRProvider>
  );
  const document = new JSDOM(stream).window.document;
  expect(document.getElementById('data1')?.innerHTML).toBe('100');
  expect(document.getElementById('data2')?.innerHTML).toBe('200');
  expect(document.getElementById('data3')?.innerHTML).toBe('error');
  expect(stream).toMatchSnapshot();
});

it('SSR2', async () => {
  const stream = await render(
    <SSRProvider>
      <Component04 />
      <Component04 />
      <Component04 />
    </SSRProvider>
  );
  const document = new JSDOM(stream).window.document;
  expect(document.getElementById('data4')?.innerHTML).toBe('100');
  expect(stream).toMatchSnapshot();
});
