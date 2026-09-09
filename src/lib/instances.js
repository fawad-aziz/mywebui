const PREFIX = 'localchat';
export const REGISTRY_KEY = `${PREFIX}:instances`;
export const INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Each browser tab is a separate instance. sessionStorage is scoped per tab,
 * so this returns a stable id per tab (survives reloads, new id per new tab).
 */
export function getInstanceId() {
  try {
    const session = globalThis.sessionStorage;
    let id = session.getItem(`${PREFIX}:instance`);
    if (!id) {
      id = crypto.randomUUID();
      session.setItem(`${PREFIX}:instance`, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable — fall back to one shared instance.
    return 'shared';
  }
}

/** Namespace a storage key with an instance id. */
export function namespacedKey(key, instanceId) {
  return `${key}:${instanceId}`;
}

/** Record that this instance is alive so pruneStaleInstances keeps it. */
export function touchInstance(store, instanceId) {
  try {
    const raw = store.getItem(REGISTRY_KEY);
    const registry = raw ? JSON.parse(raw) : {};
    registry[instanceId] = Date.now();
    store.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Storage full or unavailable — instance tracking is best-effort.
  }
}

/** Remove data of instances that have not been seen within the TTL. */
export function pruneStaleInstances(store, instanceId, baseKeys) {
  try {
    const raw = store.getItem(REGISTRY_KEY);
    if (!raw) return;
    const registry = JSON.parse(raw);
    const now = Date.now();
    for (const [id, lastSeen] of Object.entries(registry)) {
      if (id !== instanceId && now - lastSeen > INSTANCE_TTL_MS) {
        delete registry[id];
        for (const key of baseKeys) store.removeItem(namespacedKey(key, id));
      }
    }
    store.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * One-time migration to per-tab instances: when no instance registry exists
 * yet (first run after per-tab instances shipped), copy the legacy shared
 * keys into this tab's namespace.
 */
export function migrateLegacyKeys(store, instanceId, baseKeys) {
  try {
    if (store.getItem(REGISTRY_KEY)) return;
    for (const key of baseKeys) {
      const legacy = store.getItem(key);
      if (legacy !== null) store.setItem(namespacedKey(key, instanceId), legacy);
    }
  } catch {
    // Best-effort migration.
  }
}
