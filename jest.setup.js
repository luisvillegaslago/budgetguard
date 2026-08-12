import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

// Polyfill for jose/next-auth in jsdom environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// jsdom does not implement window.scrollTo
window.scrollTo = jest.fn();

// jsdom does not implement Blob.text() (used by the invoice CSV import)
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function text() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom does not implement matchMedia. Report a desktop-like environment — a fine
// pointer with hover — which is what jsdom emulates.
window.matchMedia = (query) => ({
  matches: /hover: hover|pointer: fine/.test(query),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// jsdom does not implement ResizeObserver (used by AnimatedHeight)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
