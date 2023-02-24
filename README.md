# next-ssr

## overview

Library for easy SSR of data obtained from asynchronous in Next.js.

Very easy. You do not need the following.  
 ~~`getServerSideProps`~~ , ~~`getInitialProps`~~ , ~~`React Server Components`~~.

## usage

`<SSRProvider>` in combination with `useSSR`.

```ts
import { SSRProvider, useSSR } from 'next-ssr';
```

```tsx
<SSRProvider>{/*Components containing useSSR.*/}</SSRProvider>
```

```ts
// data:  Data received from fetch.
// error: Errors thrown by fetch.
// reload: Used when re-calling fetch.
// isLoading: `true` if loading.
const {data,error,reload,isLoading} = useSSR<T>(
  // Process to return Proimise<T>.
  ()=>fetch(...),
  // key: If omitted, the value of useId() is used.
  //      However, note that nesting causes malfunctions.
  {
    key: "key-value"
  }
);
```

## Easiest example.

Asynchronous data is rendered as-is in components on the server.

- pages/simple.tsx

```tsx
import { SSRProvider, useSSR } from 'next-ssr';

/**
 * Components for displaying weather information
 */
const Test = () => {
  // The return value of async is SSRed.
  const { data } = useSSR(async () => new Date().toLocaleString('en-US', { timeZone: 'UTC' }));
  return <div>{data}</div>;
};

/**
 * Page display components
 */

const Page = () => {
  return (
    <SSRProvider>
      <Test />
    </SSRProvider>
  );
};
export default Page;
```

## Samples of performing fetch.

- pages/index.tsx

```tsx
import { SSRProvider, useSSR } from 'next-ssr';

export interface WeatherType {
  publishingOffice: string;
  reportDatetime: string;
  targetArea: string;
  headlineText: string;
  text: string;
}

/**
 * Data obtained from the JMA website.
 */
const fetchWeather = (id: number): Promise<WeatherType> =>
  fetch(`https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${id}.json`)
    .then((r) => r.json())
    .then(
      // Additional weights (500 ms)
      (r) => new Promise((resolve) => setTimeout(() => resolve(r), 500))
    );

/**
 * Components for displaying weather information
 */
const Weather = ({ code }: { code: number }) => {
  const { data, reload, isLoading } = useSSR<WeatherType>(() => fetchWeather(code), { key: code });
  if (!data) return <div>loading</div>;
  const { targetArea, reportDatetime, headlineText, text } = data;
  return (
    <div style={isLoading ? { background: 'gray', position: 'relative' } : undefined}>
      {isLoading && (
        <div style={{ position: 'absolute', color: 'white', top: '50%', left: '50%' }}>loading</div>
      )}
      <h1>{targetArea}</h1>
      <button onClick={reload}>Reload</button>
      <div>
        {new Date(reportDatetime).toLocaleString('ja-JP', {
          timeZone: 'JST',
        })}
      </div>
      <div>{headlineText}</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
};

/**
 * Page display components
 */
const Page = () => {
  return (
    <SSRProvider>
      <a href="https://github.com/SoraKumo001/next-use-ssr">Source Code</a>
      <hr />
      {/* Chiba  */}
      <Weather code={120000} />
      {/* Tokyo */}
      <Weather code={130000} />
      {/* Kanagawa */}
      <Weather code={140000} />
    </SSRProvider>
  );
};
export default Page;
```
