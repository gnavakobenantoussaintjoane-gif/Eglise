import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const globalWindow = window as unknown as Record<string, unknown>;

if (typeof globalWindow.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalWindow.IntersectionObserver = IntersectionObserverStub;
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver = IntersectionObserverStub;
}

if (typeof globalWindow.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalWindow.ResizeObserver = ResizeObserverStub;
  (globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}
