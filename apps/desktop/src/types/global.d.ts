type ApiResult<T = unknown> = { ok: boolean; status: number; data: T; error?: string };

interface NexusBridge {
  isDesktop: true;
  platform: string;
  api: {
    request<T = unknown>(opts: {
      method: string;
      path: string;
      body?: Record<string, unknown>;
      form?: Record<string, string>;
      timeout?: number;
    }): Promise<ApiResult<T>>;
    logout(): Promise<{ ok: boolean }>;
    hasSession(): Promise<boolean>;
  };
  notify(title: string, body: string): Promise<void>;
  badge(count: number): Promise<void>;
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
  };
  system: {
    info(): Promise<{ platform: string; version: string; apiBase: string }>;
    openExternal(url: string): Promise<void>;
    onDndToggle(cb: () => void): () => void;
    onNotification(cb: (data: { title: string; body: string }) => void): () => void;
  };
  meet: {
    subscribe(roomId: string, cb: (data: unknown) => void): () => void;
  };
}

declare global {
  interface Window {
    nexus: NexusBridge;
  }
}

export {};
