export class CoreRpcError extends Error {
  code?: string | number;
  method?: string;
  submissionUnknown: boolean;
}
export interface CoreSocket {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: any) => void, options?: { once?: boolean }): void;
  send(data: string): void;
  close(): void;
}
export class CoreClient {
  constructor(options: { createSocket: () => CoreSocket; timeoutMs?: number });
  ready: boolean;
  capabilities: { apiVersion?: string; methods: string[]; [key: string]: unknown };
  connect(): Promise<CoreClient['capabilities']>;
  request<T = unknown>(method: string, params?: object, options?: { onResult?: (result: T) => void; timeoutMs?: number }): Promise<T>;
  onNotification(listener: (method: string, params: any) => void): () => void;
  onClose(listener: () => void): () => void;
  close(): void;
}
