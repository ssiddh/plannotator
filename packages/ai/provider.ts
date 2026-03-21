/**
 * Provider registry — manages available AI providers by name.
 *
 * The registry is a simple Map that consumers (servers, UI endpoints)
 * use to look up the active provider. Only one provider is typically
 * active at a time, but the registry supports multiple for testing
 * and future multi-provider scenarios.
 */

import type { AIProvider, AIProviderConfig } from "./types.ts";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = new Map<string, AIProvider>();

/** Register a provider instance. Replaces any existing provider with the same name. */
export function registerProvider(provider: AIProvider): void {
  providers.set(provider.name, provider);
}

/** Unregister and dispose a provider by name. No-op if not found. */
export function unregisterProvider(name: string): void {
  const provider = providers.get(name);
  if (provider) {
    provider.dispose();
    providers.delete(name);
  }
}

/** Get a registered provider by name. Returns undefined if not found. */
export function getProvider(name: string): AIProvider | undefined {
  return providers.get(name);
}

/** Get the first (and typically only) registered provider. */
export function getDefaultProvider(): AIProvider | undefined {
  const first = providers.values().next();
  return first.done ? undefined : first.value;
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return [...providers.keys()];
}

/** Dispose all providers and clear the registry. */
export function disposeAll(): void {
  for (const provider of providers.values()) {
    provider.dispose();
  }
  providers.clear();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type ProviderFactory = (config: AIProviderConfig) => Promise<AIProvider>;
const factories = new Map<string, ProviderFactory>();

/** Register a factory function for a provider type. */
export function registerProviderFactory(
  type: string,
  factory: ProviderFactory
): void {
  factories.set(type, factory);
}

/**
 * Create and register a provider from config.
 *
 * Uses the factory registered for `config.type` to instantiate the provider,
 * then registers it in the global registry.
 *
 * @throws If no factory is registered for the given type.
 */
export async function createProvider(config: AIProviderConfig): Promise<AIProvider> {
  const factory = factories.get(config.type);
  if (!factory) {
    throw new Error(
      `No AI provider factory registered for type "${config.type}". ` +
        `Available: ${[...factories.keys()].join(", ") || "(none)"}`
    );
  }
  const provider = await factory(config);
  registerProvider(provider);
  return provider;
}
