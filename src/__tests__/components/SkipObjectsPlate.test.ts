import { plateDocument } from '@/components/printers/SkipObjectsPlate';

const { runInNewContext } = require('vm') as {
  runInNewContext: (script: string, context: Record<string, unknown>) => unknown;
};
jest.mock('react-native-webview', () => ({ WebView: () => null }));

it('uses actual RGB object ids and ignores black background, transparency and off-canvas taps', () => {
  const image = 'data:image/png;base64,AAAA';
  const html = plateDocument(image, image);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  const postMessage = jest.fn();
  const data = new Uint8ClampedArray([0, 0, 0, 255, 2, 1, 0, 255]);
  const context = {
    drawImage: jest.fn(), putImageData: jest.fn(),
    getImageData: () => ({ data, width: 2, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(8) }),
  };
  const canvas = {
    width: 0, height: 0, onclick: (_event: { clientX: number; clientY: number }) => {},
    getContext: () => context, getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
  };
  class MockImage {
    naturalWidth = 2;
    naturalHeight = 1;
    complete = false;
    onload?: () => void;
    set src(_value: string) { this.complete = true; this.onload?.(); }
  }
  runInNewContext(script!, {
    Image: MockImage,
    document: { getElementById: () => canvas, createElement: () => ({ ...canvas }) },
    window: { ReactNativeWebView: { postMessage } },
  });
  canvas.onclick({ clientX: 160, clientY: 40 });
  expect(postMessage).toHaveBeenLastCalledWith('258');
  canvas.onclick({ clientX: 30, clientY: 40 });
  canvas.onclick({ clientX: 500, clientY: 40 });
  data[7] = 0;
  canvas.onclick({ clientX: 160, clientY: 40 });
  expect(postMessage).toHaveBeenCalledTimes(1);
});

it('does not embed external URLs or authentication credentials in the plate renderer', () => {
  expect(plateDocument('https://example.test?token=secret', 'data:image/png;base64,AAAA')).toBe('');
  const html = plateDocument('data:image/png;base64,AAAA', 'data:image/png;base64,BBBB');
  expect(html).toContain("default-src 'none'");
  expect(html).not.toContain('fetch(');
  expect(html).not.toContain('Authorization');
});
