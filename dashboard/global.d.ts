export type EconJsonValue = string | number | boolean | null | { [key: string]: EconJsonValue } | EconJsonValue[];

export interface WindowOpenOptions {
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  [key: string]: EconJsonValue | undefined;
}

export interface EconWindowManager {
  createWindow: (id: string, title: string, x: number, y: number, width: number, height: number, contentHTML: string) => HTMLElement;
  focusWindow?: (w: HTMLElement) => void;
  openWindow?: (appId: string, options?: WindowOpenOptions) => void;
  closeWindow?: (windowId: string) => void;
}

export interface EconKernelClient {
  state?: EconJsonValue;
  subscribe: (callback: (state: EconJsonValue, connected: boolean) => void) => () => void;
  onEvent: (callback: (event: EconJsonValue) => void) => () => void;
  onAdminChange: (callback: (isAdmin: boolean) => void) => () => void;
  sendCommand: (line: string) => Promise<EconAckMessage>;
}

export interface EconAckMessage {
  output?: string;
  error?: string;
  ok?: boolean;
  id?: string;
}

export type VercelAnalyticsFn = (
  event: string,
  properties?: Record<string, EconJsonValue>,
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
  config: Record<string, EconJsonValue>,
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
