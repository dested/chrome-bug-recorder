/**
 * Runs in the page's MAIN world so it can see the app's own console output and
 * network calls (an isolated content script can't). Everything it observes is
 * forwarded to the content script via postMessage and attached to whichever note
 * you record next. Deliberately dependency-free and paranoid about not breaking
 * the host page.
 */
(() => {
  if (window.__gripeTap) return;
  window.__gripeTap = true;

  const TAG = 'gripe:page-event';
  const MAX_LEN = 2000;

  const send = (level, message, detail) => {
    try {
      window.postMessage(
        {
          source: TAG,
          level,
          message: String(message).slice(0, MAX_LEN),
          detail: detail ? String(detail).slice(0, MAX_LEN) : undefined,
          ts: Date.now(),
        },
        '*',
      );
    } catch {
      /* never let telemetry break the page */
    }
  };

  const stringify = (value) => {
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  };

  const format = (args) => Array.from(args).map(stringify).join(' ');

  for (const level of ['error', 'warn']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function (...args) {
      send(level, format(args));
      return original.apply(this, args);
    };
  }

  window.addEventListener('error', (event) => {
    if (event.error) send('error', event.error.stack || event.message);
    else send('error', `${event.message} (${event.filename}:${event.lineno})`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    send('error', `Unhandled promise rejection: ${stringify(event.reason)}`);
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
      return originalFetch.apply(this, args).then(
        (response) => {
          if (!response.ok) send('network', `${response.status} ${response.statusText} — ${url}`);
          return response;
        },
        (error) => {
          send('network', `fetch failed — ${url}`, stringify(error));
          throw error;
        },
      );
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener('load', () => {
      if (this.status >= 400) send('network', `${this.status} ${this.statusText} — ${method} ${url}`);
    });
    this.addEventListener('error', () => send('network', `request failed — ${method} ${url}`));
    return originalOpen.call(this, method, url, ...rest);
  };
})();
