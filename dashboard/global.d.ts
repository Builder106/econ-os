export interface WindowOpenOptions {
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface EconWindowManager {
  focusWindow?: (w: HTMLElement) => void;
  openWindow?: (appId: string, options?: WindowOpenOptions) => void;
  closeWindow?: (windowId: string) => void;
}

export interface EconKernelClient {
  isConnected?: boolean;
  connect?: () => void;
  disconnect?: () => void;
  send?: (data: string | ArrayBufferView | Blob | Record<string, string | number | boolean | null>) => void;
}

export type VercelAnalyticsFn = (
  event: string,
  properties?: Record<string, string | number | boolean | null>,
) => void;

export interface EconChartInstance {
  data: {
    labels: (number | string)[];
    datasets: Array<{
      label?: string;
      data: number[];
      borderColor?: string;
      backgroundColor?: string;
      tension?: number;
      fill?: boolean;
    }>;
  };
  update: (mode?: string) => void;
}

export type EconChartConstructor = new (
  ctx: CanvasRenderingContext2D | null,
  config: Record<string, string | number | boolean | null | object>,
) => EconChartInstance;

declare global {
  interface Window {
    econWM?: EconWindowManager;
    kernelClient?: EconKernelClient;
    launchWindow?: (type: string) => void;
    startTour?: () => void;
    cycleTheme?: () => void;
    va?: VercelAnalyticsFn;
    ECONOS_KERNEL_WS_URL?: string;
    Chart?: EconChartConstructor;
  }
}

export { };
