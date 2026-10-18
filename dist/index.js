import {
  avatarMotionEntries,
  avatarMotionEntry,
  motionCategories
} from "./chunk-ALAIKSVF.js";
import {
  AvatarLook,
  AvatarPresentationEvent,
  CORE_ANIMATIONS,
  ContentAnswers,
  DEFAULT_AVATAR_LOOK,
  EFFECTS,
  EXPRESSIONS,
  NOTIFICATION_TYPES,
  PACKAGE_WORK_BUDGET,
  SDK_VERSION,
  TOOL_DEFINITIONS,
  WORLD_PACKAGE_BYTES,
  WORLD_PACKAGE_COMMANDS,
  WorldDocument,
  WorldPackage,
  WorldSession,
  external_exports,
  findWearable,
  readWorldPackage,
  replayWorldPackage,
  streamingChatModel
} from "./chunk-S3IVW7O7.js";

// src/storage.ts
function browserStorage(storage, prefix2 = "genvr.world.") {
  return { read: async (id) => storage.getItem(prefix2 + id), write: async (id, data) => {
    storage.setItem(prefix2 + id, data);
  } };
}
async function saveWorld(session, storage) {
  await storage.write(session.export().id, session.serialize());
}
async function openWorld(id, storage, onEvent) {
  const data = await storage.read(id);
  if (!data) throw new Error("Saved world not found.");
  return new WorldSession(data, onEvent);
}

// src/genvr.ts
var GenvrError = class extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  status;
  details;
};
var GenvrClient = class _GenvrClient {
  constructor(baseUrl, fetcher = (input, init) => globalThis.fetch(input, init)) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Genvr endpoint requires HTTPS (or local HTTP).");
    if (url.username || url.password || url.search || url.hash) throw new Error("Endpoint must not contain credentials, query or hash.");
  }
  baseUrl;
  fetcher;
  /** Keep the token in the host's secure credential store, never in portable world files. */
  static linked(baseUrl, accessToken, fetcher = globalThis.fetch) {
    if (!/^gvr_link_[A-Za-z0-9_-]{43}$/.test(accessToken)) throw new Error("Invalid linked account token.");
    return new _GenvrClient(baseUrl, (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${accessToken}`);
      return fetcher(input, { ...init, credentials: "omit", headers });
    });
  }
  async #request(path, body, method = "POST") {
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      credentials: "include",
      ...body === void 0 ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    });
    const data = await response.json();
    if (!response.ok) throw new GenvrError(data.message ?? `Genvr returned ${response.status}.`, response.status, data);
    return data;
  }
  async readWorld(id) {
    const response = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/world`, void 0, "GET");
    if (!Array.isArray(response.terrain) || !response.terrain.every((row) => typeof row === "string")) throw new Error("Invalid world terrain response.");
    return { world: WorldDocument.parse(response.world), terrain: response.terrain };
  }
  /** Browse approved public catalog items. Availability is separate from purchase rights. */
  async catalogItems(options = {}) {
    if (options.limit !== void 0 && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200)) throw new Error("Invalid catalog limit.");
    if (options.q !== void 0 && options.q.length > 100) throw new Error("Catalog query is too long.");
    if (options.after !== void 0 && !/^[A-Za-z0-9._-]{1,128}$/.test(options.after)) throw new Error("Invalid catalog cursor.");
    const query = new URLSearchParams({ source: "user", limit: String(options.limit ?? 200), ...options.after ? { after: options.after } : {}, ...options.q ? { q: options.q } : {} });
    const data = await this.#request("/v1/catalog/items?" + query, void 0, "GET");
    if (!Array.isArray(data.items) || data.items.length > 200 || !(data.next === null || typeof data.next === "string")) throw new Error("Invalid catalog response.");
    return { items: data.items, next: data.next };
  }
  /** The server enforces approved/free or authenticated entitlement before issuing asset links. */
  async readItemPackage(id) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id) || id.includes("..")) throw new Error("Invalid item ID.");
    return this.#request(`/v1/items/${encodeURIComponent(id)}/package`, void 0, "GET");
  }
  async linkedIdentity() {
    const user = await this.#request("/v1/account-links/session", void 0, "GET");
    return { id: String(user.id), name: String(user.name) };
  }
  async disconnect() {
    await this.#request("/v1/account-links/disconnect");
  }
  /** Create a private draft once, then retain its ID for repeat uploads/recovery. */
  async createDraft(session) {
    if (session.export().base.sizeTier !== "small") throw new Error("Automatic draft creation supports small worlds; select an existing target for other tiers.");
    const created = await this.#request("/v1/experiences", { style: session.export().base.style, empty: true });
    return { id: String(created.id) };
  }
  async uploadWorld(session, target, itemMap = {}) {
    const saved = await this.#request(`/v1/experiences/${encodeURIComponent(target.id)}/import`, {
      baseVersion: target.baseVersion,
      package: session.export(),
      itemMap
    });
    return { id: target.id, version: Number(saved.version) };
  }
  /** Explicit user action, separate from AI generation and importing a private draft. */
  async publishWorld(id, options) {
    ContentAnswers.parse(options.content);
    return this.#request(`/v1/experiences/${encodeURIComponent(id)}/publish`, options);
  }
  /** Submit to the existing moderated store; this does not approve or list the item. */
  async submitItem(options) {
    const item = await this.#request("/v1/items/uploads", options);
    return { id: String(item.id) };
  }
};

// src/account-link.ts
var ACCOUNT_LINK_SCOPES = ["worlds:read", "worlds:write", "worlds:publish", "items:submit"];
var GenvrAccountLink = class {
  constructor(apiUrl, fetcher = (input, init) => globalThis.fetch(input, init)) {
    this.apiUrl = apiUrl;
    this.fetcher = fetcher;
    const url = new URL(apiUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) || url.username || url.password || url.search || url.hash)
      throw new Error("Account link endpoint requires HTTPS or local HTTP, without credentials.");
  }
  apiUrl;
  fetcher;
  async #request(path, body) {
    const response = await this.fetcher(`${this.apiUrl.replace(/\/$/, "")}/v1/account-links/${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return { response, data };
  }
  async start(clientName, scopes = ["worlds:read", "worlds:write"]) {
    const { response, data } = await this.#request("start", { clientName, scopes });
    if (!response.ok) throw new Error(data.message ?? "Unable to start account link.");
    if (typeof data.deviceCode !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.deviceCode) || typeof data.userCode !== "string" || !/^[A-F0-9]{6}-[A-F0-9]{6}$/.test(data.userCode) || typeof data.verificationUri !== "string" || !Number.isFinite(data.expiresIn) || !(data.expiresIn > 0 && data.expiresIn <= 600) || !Number.isFinite(data.interval) || !(data.interval >= 5)) throw new Error("Invalid account link response.");
    const verification = new URL(data.verificationUri);
    if (verification.username || verification.password || verification.protocol !== "https:" && !(verification.protocol === "http:" && ["localhost", "127.0.0.1"].includes(verification.hostname))) throw new Error("Unsafe account link page.");
    return data;
  }
  /** Poll no faster than request.interval seconds; pending is not an error or permission to publish. */
  async poll(request) {
    const { response, data } = await this.#request("token", { deviceCode: request.deviceCode });
    if (response.status === 400 && data.error === "authorization_pending") return { status: "pending" };
    if (!response.ok) throw new Error(data.error ?? data.message ?? "Account link failed.");
    if (typeof data.accessToken !== "string" || !data.accessToken.startsWith("gvr_link_") || data.tokenType !== "Bearer" || !Array.isArray(data.scopes) || !data.scopes.every((s) => ACCOUNT_LINK_SCOPES.includes(s)) || typeof data.grantId !== "string" || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error("Invalid linked account response.");
    return { status: "linked", account: data };
  }
};

// src/studio-agents.ts
var StudioAgent = external_exports.object({
  id: external_exports.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  name: external_exports.string().trim().min(1).max(200),
  avatar: external_exports.number().int().min(0).max(7)
}).strict();
var StudioAgents = external_exports.array(StudioAgent).max(200).superRefine((rows, context) => {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) context.addIssue({ code: "custom", message: "Duplicate agent ID." });
});
var colors = ["#4263eb", "#2b8a3e", "#d48806", "#8950c6"];
function studioAgentLook(preset) {
  if (!Number.isInteger(preset) || preset < 0 || preset > 7) throw new Error("Unknown agent avatar.");
  const wear = [`genvr.core.clothing.${preset < 4 ? "hoodie" : "jacket"}`, "genvr.core.clothing.boots"];
  if (!wear.every((id) => findWearable(id))) throw new Error("Agent clothing is unavailable.");
  return AvatarLook.parse({ ...DEFAULT_AVATAR_LOOK, body: "classic", shirt: colors[preset % 4], wear });
}
var prefix = "host-agent:";
function syncStudioAgents(runtime, input, localLooks = /* @__PURE__ */ new Map()) {
  const rows = StudioAgents.parse(input).sort((a, b) => a.id.localeCompare(b.id));
  const wanted = new Set(rows.map((row) => prefix + row.id));
  const placed = rows.map((row, index) => {
    const x = runtime.localPlayer.x + (index % 5 - Math.min(rows.length - 1, 4) / 2) * 2;
    const z = runtime.localPlayer.z + 4 + Math.floor(index / 5) * 2;
    const y = runtime.terrainHeightAt(x, z);
    if (!Number.isFinite(y)) throw new Error("Agent ground is unavailable.");
    return { id: prefix + row.id, state: { name: row.name, x, y, z, yaw: Math.PI, clip: "Idle", look: JSON.stringify(localLooks.get(row.id) ?? studioAgentLook(row.avatar)) } };
  });
  for (const id of runtime.remotePlayerIds()) if (id.startsWith(prefix) && !wanted.has(id)) runtime.removeRemotePlayer(id);
  for (const row of placed) runtime.upsertRemotePlayer(row.id, row.state);
  return rows.length;
}

// src/avatar-presentation.ts
var PRESENTATION_ANIMATIONS = CORE_ANIMATIONS.map((row) => ({ id: row.manifest.id, label: row.manifest.name, clip: row.clip }));
var aliases = { expr_wave: "Wave", expr_think: "Think", expr_happy: "Cheer", expr_confident: "Salute", expr_wonder: "Cheer", expr_nod: "Clap", expr_shrug: "Stretch", talk: "Point", talk_explain: "Point", talk_calm: "Think", talk_excited: "Cheer", dance_hype: "Dance", dance: "Dance", run: "Run", walk: "Walk" };
function resolvePresentationAnimation(id) {
  if (id === "idle") return id;
  if (avatarMotionEntry(id)) return id;
  return PRESENTATION_ANIMATIONS.find((row) => row.id === id || row.clip === id || row.clip === aliases[id])?.id ?? null;
}
var AvatarPresentation = class {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
  }
  runtime;
  options;
  #state = { notifications: [], cards: [], effects: {}, lastAction: "", motions: [] };
  #listeners = /* @__PURE__ */ new Set();
  #timers = /* @__PURE__ */ new Map();
  #disposed = false;
  #serial = 0;
  snapshot = () => this.#state;
  describe = () => "Shared library: " + avatarMotionEntries().map((row) => `${row.id} (${row.name}, ${motionCategories(row.name, row.category).join("/")})`).join("; ") + "; Imported motion IDs: " + this.#state.motions.map((row) => `${row.id} (${row.label}, target ${row.target})`).join("; ");
  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #publish(next) {
    this.#state = { ...this.#state, ...next };
    for (const listener of this.#listeners) listener();
  }
  #later(key, duration, task) {
    this.#cancel(key);
    this.#timers.set(key, setTimeout(() => {
      this.#timers.delete(key);
      if (!this.#disposed) task();
    }, duration));
  }
  #cancel(key) {
    const timer = this.#timers.get(key);
    if (timer) clearTimeout(timer);
    this.#timers.delete(key);
  }
  execute = (input) => {
    if (this.#disposed || this.options.enabled === false) return "Avatar presentation is disabled.";
    const parsed = AvatarPresentationEvent.safeParse(input);
    if (!parsed.success) return "Invalid avatar presentation event.";
    const event = parsed.data, rt = this.runtime();
    if (event.kind === "animation" || event.kind === "expression") {
      const target = event.target === "self" ? "self" : `host-agent:${event.target}`;
      if (!rt) return "Avatar is not ready.";
      if (event.kind === "animation") {
        const custom = this.#state.motions.find((row) => row.target === event.target && row.id === event.animation);
        const id = custom?.id ?? resolvePresentationAnimation(event.animation);
        if (!id || !rt.presentAnimation(target, id)) return "Animation or target is unavailable.";
        this.#later(`animation:${target}`, event.duration, () => {
          rt.presentAnimation(target, "idle");
        });
      } else {
        if (!rt.presentExpression(target, event.expression)) return "The selected avatar has no supported facial controls, or the target is unavailable.";
        this.#later(`expression:${target}`, event.duration, () => {
          rt.presentExpression(target, "neutral");
        });
      }
    } else if (event.kind === "effect") {
      const effects = { ...this.#state.effects };
      this.#cancel(`effect:${event.effect}`);
      if (event.enabled) {
        effects[event.effect] = event.intensity;
        this.#later(`effect:${event.effect}`, event.duration, () => {
          const next = { ...this.#state.effects };
          delete next[event.effect];
          this.#publish({ effects: next });
        });
      } else delete effects[event.effect];
      this.#publish({ effects });
    } else if (event.kind === "notification") {
      const id = `notice-${++this.#serial}`;
      const notification = { ...event.notification, id };
      notification.canReply = !!notification.canReply && !!this.options.actions?.reply;
      this.#publish({ notifications: [...this.#state.notifications.slice(-4), notification] });
      if (!notification.needsApproval) this.#later(id, event.duration, () => this.dismiss(id));
    } else if (event.kind === "card") {
      const id = `card-${++this.#serial}`;
      this.#publish({ cards: [...this.#state.cards.slice(-2), { ...event, id }] });
      this.#later(id, event.duration, () => this.dismiss(id));
    } else this.clear();
    this.#publish({ lastAction: event.kind });
    return null;
  };
  async importMotion(target, label, data, slot) {
    if (this.#disposed || this.options.enabled === false) throw new Error("Avatar presentation is disabled.");
    const replacing = slot && this.#state.motions.some((row) => row.target === target && row.id === `motion:${slot}`);
    if (!replacing && this.#state.motions.length >= 32) throw new Error("At most 32 imported motions per viewport.");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(target) || data.byteLength > 16 * 1024 * 1024) throw new Error("Invalid motion input.");
    const rt = this.runtime();
    if (!rt?.importAvatarMotion) throw new Error("Motion import is unavailable in this viewport.");
    const id = slot ? `motion:${slot}` : `motion:${++this.#serial}`;
    if (!await rt.importAvatarMotion(target === "self" ? target : `host-agent:${target}`, id, data)) throw new Error("Avatar target is unavailable.");
    if (!this.#disposed) this.#publish({ motions: [...this.#state.motions.filter((row) => row.target !== target || row.id !== id), { target, id, label: label.slice(0, 150) }], lastAction: "motion imported" });
  }
  dismiss = (id) => {
    this.#cancel(id);
    this.#publish({ notifications: this.#state.notifications.filter((row) => row.id !== id), cards: this.#state.cards.filter((row) => row.id !== id) });
  };
  async approve(id) {
    const notice = this.#state.notifications.find((row) => row.id === id);
    if (!notice?.needsApproval || !this.options.actions?.approve) throw new Error("No approval action is connected.");
    await this.options.actions.approve(notice);
    if (!this.#disposed) this.dismiss(id);
  }
  async reply(id, text) {
    const notice = this.#state.notifications.find((row) => row.id === id);
    if (!notice?.canReply || !text.trim() || !this.options.actions?.reply) throw new Error("Reply is unavailable.");
    await this.options.actions.reply(notice, text.trim());
    if (!this.#disposed) this.#publish({ notifications: this.#state.notifications.map((row) => row.id === id ? { ...row, repliedWith: text.trim() } : row) });
  }
  clear() {
    for (const [key, timer] of this.#timers) {
      clearTimeout(timer);
      if (key.startsWith("animation:")) this.runtime()?.presentAnimation(key.slice(10), "idle");
      if (key.startsWith("expression:")) this.runtime()?.presentExpression(key.slice(11), "neutral");
    }
    this.#timers.clear();
    this.#publish({ notifications: [], cards: [], effects: {} });
  }
  dispose() {
    this.clear();
    this.#disposed = true;
    this.#listeners.clear();
  }
};

// src/user-avatar-library.ts
var USER_AVATAR_BYTES = 64 * 1024 * 1024;
var UserAvatarMetadata = external_exports.object({
  id: external_exports.string().regex(/^user\.mixamo\.[a-f0-9]{64}\.(character|motion)$/),
  kind: external_exports.enum(["character", "motion"]),
  name: external_exports.string().min(1).max(150),
  originalFile: external_exports.string().min(1).max(300),
  sha256: external_exports.string().regex(/^[a-f0-9]{64}$/),
  importedAt: external_exports.string().datetime(),
  source: external_exports.literal("user-import"),
  provider: external_exports.literal("mixamo"),
  sourcePage: external_exports.literal("https://www.mixamo.com/"),
  bundled: external_exports.literal(false),
  thumbnail: external_exports.string().max(15e4).regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/).optional(),
  height: external_exports.number().min(0.3).max(4).optional(),
  joints: external_exports.array(external_exports.object({ name: external_exports.string().min(1).max(64), parent: external_exports.string().nullable(), at: external_exports.tuple([external_exports.number(), external_exports.number(), external_exports.number()]) })).max(128).optional(),
  duration: external_exports.number().positive().max(120).optional()
}).strict();
function browserUserAvatarStorage(scope, factory = indexedDB) {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(scope)) throw new Error("Invalid user library scope.");
  let opening = null;
  const listeners = /* @__PURE__ */ new Set();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`genvr-user-avatars-v1:${scope}`);
  const publish = () => {
    for (const listener of listeners) listener();
  };
  if (channel) channel.onmessage = () => publish();
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = factory.open(`genvr-user-avatars-v1:${scope}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("assets", { keyPath: "metadata.id" });
      request.result.createObjectStore("metadata", { keyPath: "id" });
      request.result.createObjectStore("assignments");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
    request.onblocked = () => {
      opening = null;
      reject(new Error("Close another tab using this avatar library."));
    };
  });
  const run = async (store, mode, task) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, mode), request = task(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("User library storage failed."));
    });
  };
  const key = (project, target) => JSON.stringify([project, target]);
  const changeAsset = async (id, asset) => {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["assets", "metadata"], "readwrite");
      if (asset) {
        tx.objectStore("assets").put(asset);
        tx.objectStore("metadata").put(asset.metadata);
      } else {
        tx.objectStore("assets").delete(id);
        tx.objectStore("metadata").delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Library write failed."));
    });
    publish();
    channel?.postMessage("changed");
  };
  return {
    async list() {
      return (await run("metadata", "readonly", (store) => store.getAll())).map((row) => UserAvatarMetadata.parse(row)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(id) {
      const row = await run("assets", "readonly", (store) => store.get(id));
      return row ? { ...row, metadata: UserAvatarMetadata.parse(row.metadata) } : null;
    },
    async put(asset) {
      const metadata = UserAvatarMetadata.parse(asset.metadata);
      if (!(asset.data instanceof ArrayBuffer) || asset.data.byteLength < 24 || asset.data.byteLength > USER_AVATAR_BYTES || new DataView(asset.data).getUint32(0, true) !== 1179937895) throw new Error("Invalid local avatar GLB.");
      await changeAsset(metadata.id, { metadata, data: asset.data });
    },
    async remove(id) {
      await changeAsset(id);
    },
    async assignment(project, target) {
      return await run("assignments", "readonly", (store) => store.get(key(project, target))) ?? null;
    },
    async assign(project, target, id) {
      if (id) {
        const asset = await run("assets", "readonly", (store) => store.get(id));
        if (asset?.metadata.kind !== "character") throw new Error("Choose a character from your library.");
      }
      if (id) await run("assignments", "readwrite", (store) => store.put(id, key(project, target)));
      else await run("assignments", "readwrite", (store) => store.delete(key(project, target)));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      channel?.close();
      listeners.clear();
      void opening?.then((db) => db.close());
      opening = null;
    }
  };
}
async function avatarDigest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}
export {
  ACCOUNT_LINK_SCOPES,
  AvatarPresentation,
  AvatarPresentationEvent,
  EFFECTS,
  EXPRESSIONS,
  GenvrAccountLink,
  GenvrClient,
  GenvrError,
  NOTIFICATION_TYPES,
  PACKAGE_WORK_BUDGET,
  PRESENTATION_ANIMATIONS,
  SDK_VERSION,
  StudioAgent,
  StudioAgents,
  TOOL_DEFINITIONS,
  USER_AVATAR_BYTES,
  UserAvatarMetadata,
  WORLD_PACKAGE_BYTES,
  WORLD_PACKAGE_COMMANDS,
  WorldPackage,
  WorldSession,
  avatarDigest,
  browserStorage,
  browserUserAvatarStorage,
  openWorld,
  readWorldPackage,
  replayWorldPackage,
  resolvePresentationAnimation,
  saveWorld,
  streamingChatModel,
  studioAgentLook,
  syncStudioAgents
};
//# sourceMappingURL=index.js.map
