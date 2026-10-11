import {
  ContentAnswers,
  PACKAGE_WORK_BUDGET,
  SDK_VERSION,
  TOOL_DEFINITIONS,
  WORLD_PACKAGE_BYTES,
  WORLD_PACKAGE_COMMANDS,
  WorldDocument,
  WorldPackage,
  WorldSession,
  readWorldPackage,
  replayWorldPackage,
  streamingChatModel
} from "./chunk-TR5JHFWL.js";

// src/storage.ts
function browserStorage(storage, prefix = "genvr.world.") {
  return { read: async (id) => storage.getItem(prefix + id), write: async (id, data) => {
    storage.setItem(prefix + id, data);
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
export {
  ACCOUNT_LINK_SCOPES,
  GenvrAccountLink,
  GenvrClient,
  GenvrError,
  PACKAGE_WORK_BUDGET,
  SDK_VERSION,
  TOOL_DEFINITIONS,
  WORLD_PACKAGE_BYTES,
  WORLD_PACKAGE_COMMANDS,
  WorldPackage,
  WorldSession,
  browserStorage,
  openWorld,
  readWorldPackage,
  replayWorldPackage,
  saveWorld,
  streamingChatModel
};
//# sourceMappingURL=index.js.map
