export interface EconWindowManager {
  focusWindow?: (w: unknown) => void;
  openWindow?: (appId: string, options?: Record<string, unknown>) => void;
  closeWindow?: (windowId: string) => void;
}

export interface EconKernelClient {
  isConnected?: boolean;
  connect?: () => void;
  disconnect?: () => void;
  send?: (data: unknown) => void;
}

export type VercelAnalyticsFn = (event: string, properties?: Record<string, unknown>) => void;

declare global {
  interface Window {
    econWM?: EconWindowManager;
    kernelClient?: EconKernelClient;
    launchWindow?: (type: string) => void;
    startTour?: () => void;
    cycleTheme?: () => void;
    va?: VercelAnalyticsFn;
    ECONOS_KERNEL_WS_URL?: string;
    Chart?: unknown;
  }
}

export { };
