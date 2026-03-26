/**
 * ConfigStore — Unified config resolver for Plannotator
 *
 * Singleton that resolves settings with precedence:
 *   server config file > cookie > default
 *
 * Works both inside and outside React. React components subscribe
 * via useSyncExternalStore (see useConfig.ts).
 *
 * Server-synced settings automatically write back to ~/.plannotator/config.json
 * via a debounced POST /api/config.
 */

import { SETTINGS, type SettingName, type SettingsMap } from './settings';

type Listener = () => void;

/** Infer the value type from a SettingDef */
type SettingValue<K extends SettingName> = SettingsMap[K] extends { defaultValue: infer D }
  ? D extends (...args: unknown[]) => infer R ? R : D
  : never;

class ConfigStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<Listener>();
  private version = 0;
  private pendingServerWrites: Record<string, unknown> = {};
  private serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initialize from server config payload.
   * Call once after fetching /api/plan or /api/diff.
   *
   * For each registered setting, resolves:
   *   server value > cookie value > default value
   */
  init(serverConfig?: Record<string, unknown>): void {
    for (const [name, def] of Object.entries(SETTINGS)) {
      const fromServer = def.serverKey && def.fromServer && serverConfig
        ? def.fromServer(serverConfig)
        : undefined;
      const fromCookie = def.fromCookie();
      const defaultVal = typeof def.defaultValue === 'function'
        ? (def.defaultValue as () => unknown)()
        : def.defaultValue;
      const resolved = fromServer ?? fromCookie ?? defaultVal;
      this.values.set(name, resolved);

      // Sync server value to cookie so offline/portal fallback works
      if (fromServer !== undefined) {
        def.toCookie(resolved as never);
      }
    }
    this.notify();
  }

  /** Get a resolved config value. Works outside React. */
  get<K extends SettingName>(key: K): SettingValue<K> {
    if (this.values.has(key)) {
      return this.values.get(key) as SettingValue<K>;
    }

    // Before init or for lazy access: read directly from cookie/default
    const def = SETTINGS[key];
    const fromCookie = def.fromCookie();
    if (fromCookie !== undefined) return fromCookie as SettingValue<K>;
    const defaultVal = typeof def.defaultValue === 'function'
      ? (def.defaultValue as () => unknown)()
      : def.defaultValue;
    return defaultVal as SettingValue<K>;
  }

  /** Set a config value. Writes cookie (sync), queues server write-back if applicable. */
  set<K extends SettingName>(key: K, value: SettingValue<K>): void {
    const def = SETTINGS[key];
    this.values.set(key, value);
    def.toCookie(value as never);

    if (def.serverKey && def.toServer) {
      Object.assign(this.pendingServerWrites, def.toServer(value as never));
      this.scheduleServerSync();
    }

    this.notify();
  }

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Snapshot version for useSyncExternalStore. */
  getVersion(): number {
    return this.version;
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private scheduleServerSync(): void {
    if (this.serverSyncTimer) clearTimeout(this.serverSyncTimer);
    this.serverSyncTimer = setTimeout(() => {
      const payload = { ...this.pendingServerWrites };
      this.pendingServerWrites = {};
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {}); // best-effort
    }, 300);
  }
}

export const configStore = new ConfigStore();
export type { SettingValue };
