import {
  avatarMotionEntries,
  avatarMotionEntry,
  motionCategories
} from "./chunk-KOKFMLWZ.js";
import {
  AvatarLiveDisplay,
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
  StudioShareRequest,
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
} from "./chunk-ALQEDJO3.js";

// src/storage.ts
function browserStorage(storage, prefix2 = "genvr.world.") {
  return { read: async (id2) => storage.getItem(prefix2 + id2), write: async (id2, data) => {
    storage.setItem(prefix2 + id2, data);
  } };
}
async function saveWorld(session, storage) {
  await storage.write(session.export().id, session.serialize());
}
async function openWorld(id2, storage, onEvent) {
  const data = await storage.read(id2);
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
function worldShareUrl(webUrl, id2, invite) {
  const base = new URL(webUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)) || base.username || base.password || base.search || base.hash) throw new Error("Unsafe Genvr web URL.");
  const url = new URL(`${base.pathname.replace(/\/$/, "")}/places/${encodeURIComponent(id2)}`, base.origin);
  if (invite) url.searchParams.set("invite", invite);
  return url.href;
}
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
  async readWorld(id2) {
    const response = await this.#request(`/v1/experiences/${encodeURIComponent(id2)}/world`, void 0, "GET");
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
  async readItemPackage(id2) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id2) || id2.includes("..")) throw new Error("Invalid item ID.");
    return this.#request(`/v1/items/${encodeURIComponent(id2)}/package`, void 0, "GET");
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
  async publishWorld(id2, options) {
    ContentAnswers.parse(options.content);
    return this.#request(`/v1/experiences/${encodeURIComponent(id2)}/publish`, options);
  }
  /** Server-owned metadata, including isOwner/status/accessMode; no ownership is accepted from the host. */
  async experience(id2) {
    return this.#request(`/v1/experiences/${encodeURIComponent(id2)}`, void 0, "GET");
  }
  async setAccess(id2, access2) {
    return this.#request(`/v1/experiences/${encodeURIComponent(id2)}/access`, access2, "PUT");
  }
  /** Return to draft; access mode is retained. Set access to private separately before importing. */
  async unpublishWorld(id2) {
    return this.#request(`/v1/experiences/${encodeURIComponent(id2)}/unpublish`);
  }
  async createInvite(id2, options = {}) {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id2)}/invites`, options);
    if (typeof value.id !== "string" || typeof value.token !== "string" || typeof value.expiresAt !== "string" || !["player", "builder"].includes(String(value.role))) throw new Error("Invalid world invitation response.");
    return value;
  }
  /** Revoking an invite stops new acceptance; existing members retain their server-assigned role. */
  async revokeInvite(id2, inviteId) {
    await this.#request(`/v1/experiences/${encodeURIComponent(id2)}/invites/${encodeURIComponent(inviteId)}`, void 0, "DELETE");
  }
  async joinWorld(id2, options = {}) {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id2)}/join`, options);
    if (typeof value.allowed !== "boolean" || value.reason !== void 0 && typeof value.reason !== "string") throw new Error("Invalid join response.");
    return value;
  }
  async joinTicket(id2) {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id2)}/join-ticket`);
    if (typeof value.ticket !== "string" || typeof value.url !== "string" || typeof value.expiresIn !== "number" || value.expiresIn <= 0) throw new Error("Invalid join ticket response.");
    return value;
  }
  /** Submit to the existing moderated store; this does not approve or list the item. */
  async submitItem(options) {
    const item = await this.#request("/v1/items/uploads", options);
    return { id: String(item.id) };
  }
};

// src/account-link.ts
var ACCOUNT_LINK_SCOPES = ["worlds:read", "worlds:write", "worlds:publish", "worlds:join", "items:submit"];
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
  if (!wear.every((id2) => findWearable(id2))) throw new Error("Agent clothing is unavailable.");
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
  for (const id2 of runtime.remotePlayerIds()) if (id2.startsWith(prefix) && !wanted.has(id2)) runtime.removeRemotePlayer(id2);
  for (const row of placed) runtime.upsertRemotePlayer(row.id, row.state);
  return rows.length;
}

// src/avatar-presentation.ts
var PRESENTATION_ANIMATIONS = CORE_ANIMATIONS.map((row) => ({ id: row.manifest.id, label: row.manifest.name, clip: row.clip }));
var aliases = { expr_wave: "Wave", expr_think: "Think", expr_happy: "Cheer", expr_confident: "Salute", expr_wonder: "Cheer", expr_nod: "Clap", expr_shrug: "Stretch", talk: "Point", talk_explain: "Point", talk_calm: "Think", talk_excited: "Cheer", dance_hype: "Dance", dance: "Dance", run: "Run", walk: "Walk" };
function resolvePresentationAnimation(id2) {
  if (id2 === "idle") return id2;
  if (avatarMotionEntry(id2)) return id2;
  return PRESENTATION_ANIMATIONS.find((row) => row.id === id2 || row.clip === id2 || row.clip === aliases[id2])?.id ?? null;
}
var AvatarPresentation = class {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
  }
  runtime;
  options;
  #state = { display: AvatarLiveDisplay.parse({}), notifications: [], cards: [], effects: {}, lastAction: "", motions: [] };
  #listeners = /* @__PURE__ */ new Set();
  #timers = /* @__PURE__ */ new Map();
  #disposed = false;
  #serial = 0;
  #media = /* @__PURE__ */ new Set();
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
        const id2 = custom?.id ?? resolvePresentationAnimation(event.animation);
        if (!id2 || !rt.presentAnimation(target, id2)) return "Animation or target is unavailable.";
        this.#later(`animation:${target}`, event.duration, () => {
          rt.presentAnimation(target, "idle");
        });
      } else {
        if (!rt.presentExpression(target, event.expression)) return "The selected avatar has no supported facial controls, or the target is unavailable.";
        this.#later(`expression:${target}`, event.duration, () => {
          rt.presentExpression(target, "neutral");
        });
      }
    } else if (event.kind === "display") {
      const { kind: _kind, ...patch } = event;
      const display = AvatarLiveDisplay.parse({ ...this.#state.display, ...patch });
      if (["image", "video"].includes(display.background) && !display.media) return "Choose background media first.";
      this.#publish({ display });
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
      const id2 = `notice-${++this.#serial}`;
      const notification = { ...event.notification, id: id2 };
      notification.canReply = !!notification.canReply && !!this.options.actions?.reply;
      this.#publish({ notifications: [...this.#state.notifications.slice(-4), notification] });
      if (!notification.needsApproval) this.#later(id2, event.duration, () => this.dismiss(id2));
    } else if (event.kind === "card") {
      const id2 = `card-${++this.#serial}`;
      this.#publish({ cards: [...this.#state.cards.slice(-2), { ...event, id: id2 }] });
      this.#later(id2, event.duration, () => this.dismiss(id2));
    } else this.clear();
    this.#publish({ lastAction: event.kind });
    return null;
  };
  localMedia(file) {
    if (this.#disposed || this.options.enabled === false) throw new Error("Avatar presentation is disabled.");
    if (file.size > 20 * 1024 * 1024 || !/^(image|video)\//.test(file.type)) throw new Error("Choose image/video media smaller than 20 MB.");
    for (const url2 of this.#media) URL.revokeObjectURL(url2);
    this.#media.clear();
    const url = URL.createObjectURL(file);
    this.#media.add(url);
    return url;
  }
  async importMotion(target, label, data, slot) {
    if (this.#disposed || this.options.enabled === false) throw new Error("Avatar presentation is disabled.");
    const replacing = slot && this.#state.motions.some((row) => row.target === target && row.id === `motion:${slot}`);
    if (!replacing && this.#state.motions.length >= 32) throw new Error("At most 32 imported motions per viewport.");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(target) || data.byteLength > 16 * 1024 * 1024) throw new Error("Invalid motion input.");
    const rt = this.runtime();
    if (!rt?.importAvatarMotion) throw new Error("Motion import is unavailable in this viewport.");
    const id2 = slot ? `motion:${slot}` : `motion:${++this.#serial}`;
    if (!await rt.importAvatarMotion(target === "self" ? target : `host-agent:${target}`, id2, data)) throw new Error("Avatar target is unavailable.");
    if (!this.#disposed) this.#publish({ motions: [...this.#state.motions.filter((row) => row.target !== target || row.id !== id2), { target, id: id2, label: label.slice(0, 150) }], lastAction: "motion imported" });
  }
  dismiss = (id2) => {
    this.#cancel(id2);
    this.#publish({ notifications: this.#state.notifications.filter((row) => row.id !== id2), cards: this.#state.cards.filter((row) => row.id !== id2) });
  };
  async approve(id2) {
    const notice = this.#state.notifications.find((row) => row.id === id2);
    if (!notice?.needsApproval || !this.options.actions?.approve) throw new Error("No approval action is connected.");
    await this.options.actions.approve(notice);
    if (!this.#disposed) this.dismiss(id2);
  }
  async reply(id2, text) {
    const notice = this.#state.notifications.find((row) => row.id === id2);
    if (!notice?.canReply || !text.trim() || !this.options.actions?.reply) throw new Error("Reply is unavailable.");
    await this.options.actions.reply(notice, text.trim());
    if (!this.#disposed) this.#publish({ notifications: this.#state.notifications.map((row) => row.id === id2 ? { ...row, repliedWith: text.trim() } : row) });
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
    for (const url of this.#media) URL.revokeObjectURL(url);
    this.#media.clear();
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
  const changeAsset = async (id2, asset) => {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["assets", "metadata"], "readwrite");
      if (asset) {
        tx.objectStore("assets").put(asset);
        tx.objectStore("metadata").put(asset.metadata);
      } else {
        tx.objectStore("assets").delete(id2);
        tx.objectStore("metadata").delete(id2);
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
    async get(id2) {
      const row = await run("assets", "readonly", (store) => store.get(id2));
      return row ? { ...row, metadata: UserAvatarMetadata.parse(row.metadata) } : null;
    },
    async put(asset) {
      const metadata = UserAvatarMetadata.parse(asset.metadata);
      if (!(asset.data instanceof ArrayBuffer) || asset.data.byteLength < 24 || asset.data.byteLength > USER_AVATAR_BYTES || new DataView(asset.data).getUint32(0, true) !== 1179937895) throw new Error("Invalid local avatar GLB.");
      await changeAsset(metadata.id, { metadata, data: asset.data });
    },
    async remove(id2) {
      await changeAsset(id2);
    },
    async assignment(project, target) {
      return await run("assignments", "readonly", (store) => store.get(key(project, target))) ?? null;
    },
    async assign(project, target, id2) {
      if (id2) {
        const asset = await run("assets", "readonly", (store) => store.get(id2));
        if (asset?.metadata.kind !== "character") throw new Error("Choose a character from your library.");
      }
      if (id2) await run("assignments", "readwrite", (store) => store.put(id2, key(project, target)));
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

// src/avatar-live-embed.ts
var AVATAR_LIVE_LAYOUTS = [
  { id: "large", name: "Large screen", width: 960, height: 600 },
  { id: "desktop", name: "Desktop window", width: 720, height: 520 },
  { id: "browser", name: "Browser panel", width: 540, height: 420 },
  { id: "compact", name: "Compact window", width: 380, height: 360 },
  { id: "banner", name: "Website banner", width: 960, height: 260 },
  { id: "circle", name: "Circle widget", width: 480, height: 280 },
  { id: "watch", name: "Watch circle", width: 360, height: 220 }
];
function avatarLiveEmbed(baseUrl, projectId, layout, display) {
  const preset = AVATAR_LIVE_LAYOUTS.find((row) => row.id === layout);
  if (!preset) throw new Error("Unknown Avatar Live layout.");
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Expected a public HTTP URL without credentials.");
  if (display) {
    const state = AvatarLiveDisplay.parse({ ...display, layout });
    for (const key of ["background", "color", "framing"]) url.searchParams.set(key, state[key]);
    if (state.media) url.searchParams.set("media", state.media);
    if (state.worldId) url.searchParams.set("worldId", state.worldId);
    if (state.worldSpot) url.searchParams.set("worldSpot", JSON.stringify(state.worldSpot));
  }
  url.searchParams.set("avatar-live", preset.id);
  url.searchParams.set("project", projectId);
  const escaped = url.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return { id: `avatar-live-${preset.id}`, url: url.href, localOnly: Boolean(display?.media?.startsWith("blob:")) || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), iframe: `<iframe title="Avatar Live" src="${escaped}" width="${preset.width}" height="${preset.height}" allow="autoplay" style="border:0;max-width:100%" loading="lazy"></iframe>` };
}

// src/publication-tools.ts
var id = external_exports.string().min(1).max(128);
var access = external_exports.discriminatedUnion("mode", [external_exports.object({ mode: external_exports.enum(["private", "public", "invite", "friends"]) }).strict(), external_exports.object({ mode: external_exports.literal("password"), password: external_exports.string().min(4).max(64) }).strict()]);
var schemas = {
  genvr_link_start: external_exports.object({ clientName: external_exports.string().min(1).max(80), scopes: external_exports.array(external_exports.enum(ACCOUNT_LINK_SCOPES)).min(1).max(ACCOUNT_LINK_SCOPES.length).optional() }).strict(),
  genvr_link_poll: external_exports.object({}).strict(),
  genvr_identity: external_exports.object({}).strict(),
  genvr_disconnect: external_exports.object({}).strict(),
  genvr_create_draft: external_exports.object({ localId: id, confirm: external_exports.literal(true) }).strict(),
  genvr_upload_world: external_exports.object({ localId: id, id, baseVersion: external_exports.number().int().min(0), confirm: external_exports.literal(true), itemMap: external_exports.record(external_exports.string(), external_exports.string()).optional() }).strict(),
  genvr_read_world: external_exports.object({ id }).strict(),
  genvr_experience: external_exports.object({ id }).strict(),
  genvr_publish_world: external_exports.object({ id, title: external_exports.string().trim().min(1).max(60), description: external_exports.string().max(1e3).optional(), type: external_exports.enum(["game", "event", "social"]), access: external_exports.discriminatedUnion("mode", [external_exports.object({ mode: external_exports.enum(["public", "invite", "friends"]) }).strict(), external_exports.object({ mode: external_exports.literal("password"), password: external_exports.string().min(4).max(64) }).strict()]), content: ContentAnswers, confirm: external_exports.literal(true) }).strict(),
  genvr_set_access: external_exports.object({ id, access, confirm: external_exports.literal(true) }).strict(),
  genvr_unpublish_world: external_exports.object({ id, confirm: external_exports.literal(true) }).strict(),
  genvr_create_invite: external_exports.object({ id, role: external_exports.literal("player").default("player"), expiresInHours: external_exports.number().int().min(1).max(720).default(72), confirm: external_exports.literal(true) }).strict(),
  genvr_revoke_invite: external_exports.object({ id, inviteId: id, confirm: external_exports.literal(true) }).strict(),
  genvr_share_url: external_exports.object({ id, invite: external_exports.string().max(128).optional() }).strict(),
  genvr_join_world: external_exports.object({ id, password: external_exports.string().max(64).optional(), invite: external_exports.string().max(128).optional() }).strict(),
  genvr_join_ticket: external_exports.object({ id }).strict()
};
var descriptions = {
  genvr_link_start: "Start browser account consent. Return the user code/page; never ask for a password. No uploads.",
  genvr_link_poll: "Poll the pending browser consent after its interval. Tokens stay in process memory and are never returned.",
  genvr_identity: "Read the actual linked account identity.",
  genvr_disconnect: "Revoke this process account link.",
  genvr_create_draft: "Explicitly create one private server draft for the current local-file world. Confirm owner intent; retain the returned ID. No automatic retry.",
  genvr_upload_world: "Explicitly upload the selected local-file world to an existing owned private draft with optimistic baseVersion. No private library scan or asset submission.",
  genvr_read_world: "Read a permitted server world/version without replacing the local project.",
  genvr_experience: "Read server world ownership/status/access metadata.",
  genvr_publish_world: "Publish an owned draft after explicit owner confirmation, access choice and content questionnaire.",
  genvr_set_access: "Change owned world access after explicit confirmation; private excludes ordinary players.",
  genvr_unpublish_world: "Return owned world to draft; also set access private before reimporting.",
  genvr_create_invite: "Create a revocable player invite. Builder invitations grant editing and are only available through the host UI.",
  genvr_revoke_invite: "Revoke an invite for new acceptances; existing members retain access.",
  genvr_share_url: "Build a website share URL. It does not grant access or publish anything.",
  genvr_join_world: "Ask the server to join as the linked account under existing access rules.",
  genvr_join_ticket: "Request a short-lived realtime ticket. Server access rules still apply."
};
var PUBLICATION_MUTATION_TOOLS = /* @__PURE__ */ new Set(["genvr_create_draft", "genvr_upload_world", "genvr_publish_world", "genvr_set_access", "genvr_unpublish_world", "genvr_create_invite", "genvr_revoke_invite"]);
var PUBLICATION_TOOLS = Object.entries(schemas).map(([name, schema]) => ({ name, description: descriptions[name], inputSchema: external_exports.toJSONSchema(schema, { target: "draft-7" }) }));
var GenvrPublicationTools = class {
  constructor(options = {}) {
    this.options = options;
    if (options.apiUrl && options.accessToken) this.#client = GenvrClient.linked(options.apiUrl, options.accessToken, options.fetcher);
  }
  options;
  #client;
  #pending;
  #nextPoll = 0;
  capabilities() {
    return { configured: Boolean(this.options.apiUrl), linked: Boolean(this.#client), mutations: Boolean(this.options.allowMutations), localFileWorldOnly: true };
  }
  /** Tools to list: mutations are hidden unless the host opted in. */
  tools() {
    return PUBLICATION_TOOLS.filter((tool) => this.options.allowMutations || !PUBLICATION_MUTATION_TOOLS.has(tool.name));
  }
  handles(name) {
    return Object.hasOwn(schemas, name);
  }
  async call(name, args, session) {
    if (!this.handles(name)) throw new Error("Unknown publication tool.");
    if (!this.options.allowMutations && PUBLICATION_MUTATION_TOOLS.has(name)) throw new Error("World publication changes are disabled. The host must set GENVR_MCP_PUBLICATION=1 after providing its own user approval.");
    schemas[name].parse(args);
    if (name === "genvr_share_url") {
      const v = schemas.genvr_share_url.parse(args);
      if (!this.options.webUrl) throw new Error("Configure GENVR_WEB_URL.");
      return { url: worldShareUrl(this.options.webUrl, v.id, v.invite) };
    }
    if (!this.options.apiUrl) throw new Error("Configure GENVR_API_URL for account publication.");
    const link = new GenvrAccountLink(this.options.apiUrl, this.options.fetcher);
    if (name === "genvr_link_start") {
      const v = schemas.genvr_link_start.parse(args);
      if (this.#client) throw new Error("Already linked; disconnect explicitly before changing accounts.");
      const scopes = v.scopes ?? (this.options.allowMutations ? ["worlds:read", "worlds:write", "worlds:publish", "worlds:join"] : ["worlds:read", "worlds:join"]);
      this.#pending = await link.start(v.clientName, scopes);
      this.#nextPoll = (this.options.now?.() ?? Date.now()) + this.#pending.interval * 1e3;
      const { deviceCode: _secret, ...visible } = this.#pending;
      return visible;
    }
    if (name === "genvr_link_poll") {
      if (!this.#pending) throw new Error("Start account linking first.");
      const now = this.options.now?.() ?? Date.now();
      if (now < this.#nextPoll) throw new Error("Wait for the account link polling interval.");
      this.#nextPoll = now + this.#pending.interval * 1e3;
      const result = await link.poll(this.#pending);
      if (result.status === "pending") return result;
      this.#client = GenvrClient.linked(this.options.apiUrl, result.account.accessToken, this.options.fetcher);
      this.#pending = void 0;
      return { status: "linked", scopes: result.account.scopes, expiresAt: result.account.expiresAt };
    }
    const client = this.#client;
    if (!client) throw new Error("Link a Genvr account first.");
    if (name === "genvr_identity") return client.linkedIdentity();
    if (name === "genvr_disconnect") {
      await client.disconnect();
      this.#client = void 0;
      return { disconnected: true };
    }
    if (name === "genvr_create_draft" || name === "genvr_upload_world") {
      const v = name === "genvr_create_draft" ? schemas.genvr_create_draft.parse(args) : schemas.genvr_upload_world.parse(args);
      if (!session || session.export().id !== v.localId) throw new Error("Open the exact intended local-file world first; live viewport projects are not implicitly uploaded.");
      if (name === "genvr_create_draft") return client.createDraft(session);
      const upload = v;
      return client.uploadWorld(session, upload, upload.itemMap);
    }
    if (name === "genvr_read_world") return client.readWorld(schemas.genvr_read_world.parse(args).id);
    if (name === "genvr_experience") return client.experience(schemas.genvr_experience.parse(args).id);
    if (name === "genvr_publish_world") {
      const v = schemas.genvr_publish_world.parse(args);
      return client.publishWorld(v.id, { title: v.title, type: v.type, content: v.content, access: v.access, ...v.description !== void 0 ? { description: v.description } : {} });
    }
    if (name === "genvr_set_access") {
      const v = schemas.genvr_set_access.parse(args);
      return client.setAccess(v.id, v.access);
    }
    if (name === "genvr_unpublish_world") return client.unpublishWorld(schemas.genvr_unpublish_world.parse(args).id);
    if (name === "genvr_create_invite") {
      const v = schemas.genvr_create_invite.parse(args);
      return client.createInvite(v.id, { role: v.role, expiresInHours: v.expiresInHours });
    }
    if (name === "genvr_revoke_invite") {
      const v = schemas.genvr_revoke_invite.parse(args);
      await client.revokeInvite(v.id, v.inviteId);
      return { revoked: true };
    }
    if (name === "genvr_join_world") {
      const { id: id2, ...v } = schemas.genvr_join_world.parse(args);
      return client.joinWorld(id2, { ...v.password !== void 0 ? { password: v.password } : {}, ...v.invite !== void 0 ? { invite: v.invite } : {} });
    }
    return client.joinTicket(schemas.genvr_join_ticket.parse(args).id);
  }
};
export {
  ACCOUNT_LINK_SCOPES,
  AVATAR_LIVE_LAYOUTS,
  AvatarLiveDisplay,
  AvatarPresentation,
  AvatarPresentationEvent,
  EFFECTS,
  EXPRESSIONS,
  GenvrAccountLink,
  GenvrClient,
  GenvrError,
  GenvrPublicationTools,
  NOTIFICATION_TYPES,
  PACKAGE_WORK_BUDGET,
  PRESENTATION_ANIMATIONS,
  PUBLICATION_MUTATION_TOOLS,
  PUBLICATION_TOOLS,
  SDK_VERSION,
  StudioAgent,
  StudioAgents,
  StudioShareRequest,
  TOOL_DEFINITIONS,
  USER_AVATAR_BYTES,
  UserAvatarMetadata,
  WORLD_PACKAGE_BYTES,
  WORLD_PACKAGE_COMMANDS,
  WorldPackage,
  WorldSession,
  avatarDigest,
  avatarLiveEmbed,
  browserStorage,
  browserUserAvatarStorage,
  openWorld,
  readWorldPackage,
  replayWorldPackage,
  resolvePresentationAnimation,
  saveWorld,
  streamingChatModel,
  studioAgentLook,
  syncStudioAgents,
  worldShareUrl
};
//# sourceMappingURL=index.js.map
