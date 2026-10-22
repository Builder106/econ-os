// Kernel location. ECONOS_KERNEL_WS_URL is baked in at build time (vite.config.mts).
// When it is empty, the desktop talks to the kernel that served it (the standalone image).

function sameOriginWs(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export const KERNEL_WS_URL: string = __KERNEL_WS_URL__ || sameOriginWs();

/** HTTP base for /healthz and /export, derived from the WebSocket URL. */
export const KERNEL_HTTP_BASE: string = (() => {
  const url = new URL(KERNEL_WS_URL);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = url.pathname.replace(/\/ws\/?$/, '');
  url.search = '';
  return url.toString().replace(/\/$/, '');
})();
