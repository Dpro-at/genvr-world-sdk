import { Client, type Room } from '@colyseus/sdk';
import type { FilmTakeEvent, FilmVoiceEvent } from '@genvr/contracts';
import { filmRoom } from './film-room';
import {
  MAX_COMMAND_BYTES,
  ProductGrantState,
  type AvatarLook,
  type ChatChannel,
  type ChatMessage,
  type CommandPayload,
  type GameWireEvent,
  type InGameReport,
  type RideRefusal,
} from '@genvr/contracts';
import { normalizeAvatarLook } from '@genvr/core-library';
import type { GenvrRuntime, RemotePlayerState } from '@genvr/runtime';
import { api } from './api';
import { getAvatarLook, subscribeAvatarLook } from './avatar-look';
import { setInviteRoom } from './invite';
import { readGame, rememberNames, type GameSnapshot, type GameStateView } from './game-view';
import { rideChange, teleportAction, type SeatRow } from './ride-view';

export type { GamePlayerSnapshot, GameSnapshot } from './game-view';

/** How often the local pose is sent to the room (the server patches at the same rate). */
const SEND_INTERVAL_MS = 50;

/**
 * `reconnecting`: a working connection dropped; it comes back by itself.
 * `replaced`: the same account opened this place in another tab or device; this page stays out
 * of the room (reloading it takes the place back).
 */
export type MultiplayerStatus = 'connecting' | 'online' | 'offline' | 'reconnecting' | 'replaced';

/** Same 3x ceiling as the runtime and room; preserve independently expiring effects. */
export function combinedProductSpeed(rule: { factor: number; until: number }, speed: import('@genvr/contracts').ProductReceipt | null, now: number) {
  const ruleActive = rule.until === 0 || rule.until > now;
  const expiry = speed?.expiresAt ? Date.parse(speed.expiresAt) : 0;
  const productFactor = speed?.benefit.kind === 'speed' && expiry > now ? speed.benefit.factor : 1;
  const deadlines = [ruleActive ? rule.until : 0, productFactor > 1 ? expiry : 0].filter((at) => at > now);
  return { factor: Math.min(3, (ruleActive ? rule.factor : 1) * productFactor), until: deadlines.length ? Math.min(...deadlines) : 0 };
}

/** A player in the room, for the People tab of the system menu. */
export interface RoomPlayer {
  id: string;
  name: string;
  role: string;
  self: boolean;
  /** The player's avatar look (P3-23), for portraits. */
  look: AvatarLook;
}

export interface MultiplayerSession {
  /** True while edits go through the room (co-building); false means save directly. */
  readonly building: boolean;
  /** The room this session is in (P3-10, invite links); null while away or alone. */
  readonly roomId: string | null;
  /** Sends a local edit to the room (only while `building`). */
  sendCommand(command: CommandPayload, id: string): void;
  /** Chat and safety (P3-09); ignored while offline. */
  /** `global` reaches every room of the place (P3-19). */
  sendChat(text: string, channel?: ChatChannel): void;
  setBlocked(sessionId: string, blocked: boolean): void;
  report(report: InGameReport): void;
  /** Places or digs blocks with the avatar's hands (decision 109); false while offline. */
  sendPlayerBlocks(blocks: Array<[number, number, number, number]>): boolean;
  /** The block in the avatar's hand (0 for none), shown to others; sent again after a reconnect. */
  sendHeldBlock(block: number): void;
  /**
   * Uses the held game tool (a strike) facing `yaw` (P9-12); the room judges who it reaches. `target` is
   * the player this device thinks it hits (the room counts claims it cannot confirm).
   */
  sendAttack(yaw: number, target?: string | null): void;
  /** A builder starts or stops testing the place's game from the studio (P9-12); sent again after a reconnect. */
  setTesting(on: boolean): void;
  refreshSandbox(mode?: 'sandbox' | 'stripe-test'): boolean;
  /**
   * Asks to get on an item (movement modes); the room seats the player or says why not
   * (`RideHandlers.onRefused`). Without a room the player rides on this device alone.
   */
  ride(instanceId: string): void;
  /** Asks to get off the item ridden (without a room, gets off on this device). */
  leaveRide(): void;
  /** Server time minus this device's time, in ms (0 until the room says), for the game's clocks. */
  readonly serverOffset: number;
  leave(): void;
}

/** The place's game (P9-12): the synced state and the room's announcements. */
export interface GameHandlers {
  /** The game changed (health, scores, phase); null while not in a room. */
  onGame(snapshot: GameSnapshot | null): void;
  /** `self`: this client's own session id in the room (known from the join, before any game row). */
  onGameEvent(event: GameWireEvent, self: string): void;
}

/** Riding (movement modes): what the room says about it. */
export interface RideHandlers {
  /** The room would not let the player get on, and why. */
  onRefused(reason: RideRefusal): void;
}

/** A line of the place's script log (P2-10), as the room sends it to owners and builders only. */
export interface ScriptLogMessage {
  at: number;
  /** The script's name ('' for a line about the place's scripts as a whole). */
  script: string;
  level: 'log' | 'error' | 'refused' | 'strike' | 'off' | 'start';
  text: string;
  line?: number;
}

/** The place's scripts (P2-10): their log, live, for the studio's Output (builders only; players get nothing). */
export interface ScriptHandlers {
  onLog(line: ScriptLogMessage): void;
}

/** Building with the avatar's hands (decision 109): what the room says about it. */
export interface HandsHandlers {
  /** Whether this player may build here, their share, and how many blocks they have. */
  onBuilding(state: { allowed: boolean; share: number; used: number }): void;
  /** The room refused a place or dig (another player's block, the share is used up, ...). */
  onRefused(message: string): void;
}

/** Chat and safety events from the room (task P3-09). */
export interface SocialHandlers {
  onChatStatus(enabled: boolean): void;
  onHistory(messages: ChatMessage[]): void;
  onMessage(message: ChatMessage): void;
  /** A short note for the local player (slow down, hidden numbers, report failed). */
  onNotice(message: string): void;
  /** Sessions in the room this player blocked (on join, and after each change). */
  onBlocked(sessionId: string, blocked: boolean): void;
  onReported(target: InGameReport['target']): void;
}

/** Co-building hooks (task P3-08). */
export interface BuildingOptions {
  /** Owner or builder of the place. */
  canBuild: boolean;
  /** Version of the world this page has (loaded plus saved directly). */
  version(): number;
  /**
   * Edits now go through the room (with the function that sends them) or, with null, directly to
   * the API again.
   */
  onBuilding(send: ((command: CommandPayload, id: string) => void) | null): void;
  /** The room refused an edit (shown to the player). */
  onRejected(message: string): void;
  /**
   * The place changed outside the room, or the room lost edits (a restart before saving): reload
   * it. `unsaved` are this page's own edits not known to be saved, oldest first, to apply again.
   */
  onResync(unsaved: CommandPayload[]): void;
  /** The owner changed this player's role (P3-22); null means removed from the place. */
  onRoleChanged(role: 'owner' | 'builder' | 'player' | null): void;
  /** The safety team closed the place or suspended this account: the room sent the player out. */
  onRemoved(message: string): void;
}

type PlayerView = RemotePlayerState & { role?: string };

/** A look from the room (JSON); anything unreadable shows the default look. */
function readLook(json: string | undefined): AvatarLook {
  try {
    return normalizeAvatarLook(json ? JSON.parse(json) : {});
  } catch {
    return normalizeAvatarLook({});
  }
}

/**
 * How long an exit spot (`teleport` without an epoch) that came while riding waits for the row to say
 * the player got off before it is applied anyway (the room patches 20 times a second).
 */
const RIDE_TELEPORT_WAIT_MS = 250;

/** Test toggles are sent at least this far apart (the room allows 2 a second, P9-12). */
const TEST_TOGGLE_GAP_MS = 600;

/** Look changes wait this long, so dragging a color picker sends one change. */
const LOOK_DELAY_MS = 400;
interface PlaceStateView {
  /** Avatars near this player only (interest management, P3-12). */
  players?: { forEach(callback: (player: PlayerView, id: string) => void): void; size: number };
  /** Everyone in the room: name and role. */
  roster?: {
    forEach(callback: (entry: { name: string; role: string; look?: string }, id: string) => void): void;
  };
  /** The place's game (P9-12); missing on older servers. */
  game?: GameStateView;
  /** Ridden items away from where they were placed (movement modes); missing on older servers. */
  rides?: {
    forEach(callback: (pose: { x: number; y: number; z: number; yaw: number }, id: string) => void): void;
  };
}

/** Waits between reconnect attempts after a dropped connection (then every 15 s). */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Joins the realtime room of a place (task P3-07): asks the API for a join ticket (the API checks
 * access), connects to the room, streams the local pose, and mirrors other players into the
 * runtime. Everything is best effort: without the realtime server the place still works solo.
 * When a connection that worked drops, it reconnects by itself; builders keep their edits: edits
 * the room had not confirmed, and edits made while away, are sent again after the room's own
 * missed edits (P3-08 follow-up).
 * `targetRoomId` (P3-10, an invite link): join that room of the place first; when it is full,
 * gone, or of another place, join any room. After a dropped connection it tries its own room
 * again first.
 */
export async function joinPlace(
  experienceId: string,
  runtime: GenvrRuntime,
  onStatus: (status: MultiplayerStatus, players: RoomPlayer[]) => void,
  build?: BuildingOptions,
  social?: SocialHandlers,
  targetRoomId?: string,
  hands?: HandsHandlers,
  gameHandlers?: GameHandlers,
  rideHandlers?: RideHandlers,
  scriptHandlers?: ScriptHandlers,
  productHandlers?: { onState(grants: import('@genvr/contracts').ProductGrantState): void; onNotice(message: string): void },
): Promise<MultiplayerSession> {
  let room: Room | null = null;
  // R and falling out: while in a room, the room puts the player back (owner, 2026-10-07); alone, this device does.
  runtime.setRespawnRequest(() => {
    if (!room) return false;
    room.send('respawn-request', {});
    return true;
  });
  /** The block in the avatar's hand, told to every room this session joins (decision 109). */
  let held = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let building = false;
  let currentRoomId: string | null = null;
  /** Newest room version this page has seen (for catching up after a reconnect). */
  let version = build?.version() ?? 0;
  /** Our edits the room applied but has not saved yet, by room version. */
  let unsaved: Array<{ version: number; command: CommandPayload }> = [];
  /** Numbers place and dig requests (the room answers refusals by id). */
  let nextBlocks = 0;
  /** Testing the game from the studio (P9-12), told to every room this session joins. */
  let testing = false;
  /** What the joined room was last told, and when; the room takes 2 toggles a second at most. */
  let testingSent = false;
  let testingSentAt = 0;
  let testingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tells the room the latest Test state, spaced out so the last change always gets through. */
  const sendTesting = () => {
    testingTimer = null;
    if (!room || testingSent === testing) return;
    const wait = testingSentAt + TEST_TOGGLE_GAP_MS - Date.now();
    if (wait > 0) {
      testingTimer = setTimeout(sendTesting, wait);
      return;
    }
    testingSent = testing;
    testingSentAt = Date.now();
    room.send('test', { on: testing });
  };
  /** Server time minus this device's time (the room's `time` message). */
  let serverOffset = 0;
  let productGrants: import('@genvr/contracts').ProductGrantState = { skin: null, speed: null };
  let ruleSpeed = { factor: 1, until: 0 };
  let speedTimer: ReturnType<typeof setTimeout> | null = null;
  const applySpeed = () => {
    if (speedTimer) clearTimeout(speedTimer);
    speedTimer = null;
    const now = Date.now() + serverOffset;
    const { factor, until: next } = combinedProductSpeed(ruleSpeed, testing ? productGrants.speed : null, now);
    runtime.setSpeedFactor(factor, next ? next - serverOffset : 0);
    if (next) speedTimer = setTimeout(applySpeed, Math.max(1, next - now + 10));
  };
  const clearProducts = () => {
    productGrants = { skin: null, speed: null };
    productHandlers?.onState(productGrants);
    ruleSpeed = { factor: 1, until: 0 };
    applySpeed();
  };
  /** The own row's ride and seat as last seen (movement modes). */
  let ownSeat: SeatRow = { ride: '', seat: 0 };
  /** The newest ride correction applied (sent with every move; a new connection starts at 0). */
  let moveEpoch = 0;
  /**
   * A `teleport` that came while riding: an exit spot (the row soon says the player got off) or a
   * correction of the ridden item (the row stays); decided by the row, or after a short wait.
   */
  let pendingTeleport: { x: number; y: number; z: number; yaw: number } | null = null;
  let teleportTimer: ReturnType<typeof setTimeout> | null = null;
  const clearTeleport = () => {
    pendingTeleport = null;
    if (teleportTimer) clearTimeout(teleportTimer);
    teleportTimer = null;
  };
  /** Off any item on this device (the room is gone). */
  const endRideHere = () => {
    clearTeleport();
    ownSeat = { ride: '', seat: 0 };
    if (runtime.riding) runtime.endRide();
  };

  // One command per message. One the room could never take is refused here, with the reason,
  // instead of closing the connection and being resent on every reconnect with everything after it
  // stuck behind it (2026-09-29).
  /** The joined room's resync, set once joined (a refused command can leave the page behind). */
  let resyncRoom = () => undefined as void;
  // The room takes at most 30 edits a second from one person (PlaceRoom.commandsPerSecond) and refuses the rest,
  // which undoes them here. A burst (a whole real place, a pasted row, the assistant's work) is sent in order and
  // evenly, one edit every 50 ms (20 a second): bursts of 25 still reached the room closer together than they left,
  // and one was refused (2026-10-06). A single edit still goes at once.
  const SEND_GAP_MS = 50;
  const outbox: Array<{ target: Room; id: string; command: CommandPayload }> = [];
  let lastSent = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // A busy page fires timers late (a big build drawing at 1 fps): edits that fell behind go together, at most 6 at
  // once, instead of one per late timer. Any one second then holds at most 6 + 19 = 25 edits, under the room's 30.
  const SEND_CATCH_UP = 6;
  const flush = () => {
    flushTimer = null;
    const now = Date.now();
    const due = Math.min(SEND_CATCH_UP, Math.floor((now - lastSent) / SEND_GAP_MS));
    if (due < 1) {
      flushTimer = setTimeout(flush, lastSent + SEND_GAP_MS - now);
      return;
    }
    let sent = 0;
    while (outbox.length && sent < due) {
      const next = outbox.shift()!;
      // A room left since: its edits are still pending in the runtime and are sent again after the next join.
      if (next.target !== room) continue;
      next.target.send('command', { id: next.id, command: next.command });
      sent += 1;
    }
    // Spread from now on; a long pause never adds up to more than one catch-up batch.
    if (sent) lastSent = now;
    if (outbox.length) flushTimer = setTimeout(flush, SEND_GAP_MS);
  };
  // Edits still waiting here live only in this page: leaving it now would lose them (a real-place build lost 173
  // trees to a reload), so the browser asks first.
  const guardLeave = (event: BeforeUnloadEvent) => {
    if (!outbox.length) return;
    event.preventDefault();
    event.returnValue = '';
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', guardLeave);
  const sendCommand = (target: Room | null, id: string, command: CommandPayload) => {
    if (!target) return;
    if (JSON.stringify(command).length > MAX_COMMAND_BYTES) {
      if (runtime.rejectCommand(id).resync) resyncRoom();
      build?.onRejected(
        'That change is too big to share with the room. Undo it and make it in smaller parts.',
      );
      return;
    }
    outbox.push({ target, id, command });
    if (!flushTimer) flush();
  };
  const setBuilding = (active: boolean) => {
    if (building === active) return;
    building = active;
    runtime.setCollaborative(active);
    // While reconnecting `room` is null: edits stay pending in the runtime and are sent later.
    build?.onBuilding(active ? (command, id) => sendCommand(room, id, command) : null);
  };
  const clearPlayers = () => {
    for (const id of runtime.remotePlayerIds()) runtime.removeRemotePlayer(id);
  };
  // The player changes their look (P3-23): everyone in the room sees it.
  let lookTimer: ReturnType<typeof setTimeout> | null = null;
  const stopLook = subscribeAvatarLook(() => {
    if (lookTimer) clearTimeout(lookTimer);
    lookTimer = setTimeout(() => room?.send('look', getAvatarLook()), LOOK_DELAY_MS);
  });
  const leave = () => {
    setInviteRoom(experienceId, null);
    closed = true;
    stopLook();
    if (lookTimer) clearTimeout(lookTimer);
    if (timer) clearInterval(timer);
    timer = null;
    if (retry) clearTimeout(retry);
    retry = null;
    if (testingTimer) clearTimeout(testingTimer);
    testingTimer = null;
    setBuilding(false);
    clearPlayers();
    gameHandlers?.onGame(null);
    endRideHere();
    // The rules' speed belongs to the room: without one, normal speed.
    runtime.setSpeedFactor(1);
    clearProducts();
    void room?.leave();
    room = null;
    filmRoom.connect(null);
    runtime.setRespawnRequest(null);
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', guardLeave);
  };
  const session = (): MultiplayerSession => ({
    get building() {
      return building;
    },
    get roomId() {
      return currentRoomId;
    },
    sendCommand(command, id) {
      sendCommand(room, id, command);
    },
    sendChat(text, channel = 'here') {
      room?.send('chat', { text, channel });
    },
    setBlocked(sessionId, blocked) {
      room?.send(blocked ? 'block' : 'unblock', { sessionId });
    },
    report(report) {
      room?.send('report', report);
    },
    sendPlayerBlocks(blocks) {
      if (!room) return false;
      nextBlocks += 1;
      room.send('player-blocks', { id: `b${nextBlocks}`, blocks });
      return true;
    },
    sendHeldBlock(block) {
      if (block === held) return;
      held = block;
      room?.send('hand', { block });
    },
    sendAttack(yaw, target) {
      room?.send('attack', target ? { kind: 'melee', yaw, target } : { kind: 'melee', yaw });
    },
    setTesting(on) {
      testing = on;
      if (!on) { productGrants = { skin: null, speed: null }; productHandlers?.onState(productGrants); applySpeed(); }
      if (!testingTimer) sendTesting();
    },
    refreshSandbox(mode: 'sandbox' | 'stripe-test' = 'sandbox') {
      if (!room || !testing) return false;
      room.send('sandbox-refresh', { mode });
      return true;
    },
    ride(instanceId) {
      if (room) room.send('ride', { instanceId });
      else runtime.startRide(instanceId, 1);
    },
    leaveRide() {
      if (room) room.send('leave-ride', {});
      else runtime.endRide();
    },
    get serverOffset() {
      return serverOffset;
    },
    leave,
  });

  /** Joins the room; false when the realtime server or the ticket is not available. */
  const connect = async (preferRoomId?: string): Promise<boolean> => {
    const { data } = await api
      .POST('/v1/experiences/{id}/join-ticket', { params: { path: { id: experienceId } } })
      .catch(() => ({ data: undefined }));
    if (!data || closed) return false;
    let joined: Room;
    try {
      const start = runtime.localPlayer;
      const options = {
        experienceId,
        ticket: data.ticket,
        position: [start.x, start.y, start.z],
        look: getAvatarLook(),
        ...(build?.canBuild ? { version } : {}),
      };
      const client = new Client(data.url);
      if (preferRoomId) {
        // Invite links and reconnects: that room first, any room of the place when it fails.
        joined = await client
          .joinById(preferRoomId, options)
          .catch(() => client.joinOrCreate('place', options));
      } else {
        joined = await client.joinOrCreate('place', options);
      }
    } catch {
      return false;
    }
    if (closed) {
      void joined.leave();
      return false;
    }
    room = joined;
    currentRoomId = joined.roomId;
    moveEpoch = 0;
    setInviteRoom(experienceId, joined.roomId);
    wire(joined);
    if (held) joined.send('hand', { block: held });
    // A new room knows nothing of Test yet.
    testingSent = false;
    testingSentAt = 0;
    if (testingTimer) clearTimeout(testingTimer);
    sendTesting();
    if (build?.canBuild) setBuilding(true);
    return true;
  };

  /** A dropped connection: try again with growing waits until it works or the page leaves. */
  const reconnect = (attempt: number) => {
    if (closed) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    retry = setTimeout(() => {
      retry = null;
      void connect(currentRoomId ?? undefined).then((ok) => {
        if (!ok) reconnect(attempt + 1);
      });
    }, delay);
  };

  const wire = (current: Room) => {
    const self = current.sessionId;
    // The People list changes only when someone joins or leaves; moves must not re-render the page.
    let rosterKey = '';
    let gameKey = '';
    // Names of everyone seen in this room: a player who left keeps their game row (and a name).
    const knownNames = new Map<string, string>();
    current.onStateChange((state: PlaceStateView) => {
      const seen = new Set<string>();
      const list: RoomPlayer[] = [];
      const names = new Map<string, string>();
      state.roster?.forEach((entry, id) => {
        names.set(id, entry.name);
        list.push({ id, name: entry.name, role: entry.role, self: id === self, look: readLook(entry.look) });
      });
      // The game's rows; a player's tool shows in their avatar's hand, and the knocked out fall.
      const tools = new Map<string, string>();
      const down = new Set<string>();
      if (state.game) {
        const game = readGame(state.game, rememberNames(knownNames, names), self);
        for (const player of game.players) if (player.present) tools.set(player.id, player.tool);
        if (game.on && game.phase === 'playing')
          for (const player of game.players) if (!player.alive) down.add(player.id);
        // Moves change nothing here: only a changed game re-renders the page.
        const key = JSON.stringify(game);
        if (key !== gameKey) {
          gameKey = key;
          gameHandlers?.onGame(game);
        }
      }
      state.players?.forEach((player, id) => {
        if (id === self) {
          // The room seats and unseats this player (movement modes).
          const now: SeatRow = { ride: player.ride ?? '', seat: player.seat ?? 0 };
          const change = rideChange(ownSeat, now);
          ownSeat = now;
          if (change === 'end') {
            const exit = pendingTeleport ?? { x: player.x, y: player.y, z: player.z, yaw: player.yaw };
            clearTeleport();
            runtime.endRide(exit);
          } else if (change === 'start') {
            clearTeleport();
            // Riding is off here (building, side view): get off again, so the room agrees.
            if (!runtime.startRide(now.ride, now.seat)) current.send('leave-ride', {});
          }
          return;
        }
        seen.add(id);
        runtime.upsertRemotePlayer(id, {
          name: player.name,
          x: player.x,
          y: player.y,
          z: player.z,
          yaw: player.yaw,
          clip: player.clip,
          look: player.look,
          hand: player.hand,
          tool: tools.get(id) ?? '',
          down: down.has(id),
          ride: player.ride ?? '',
          seat: player.seat ?? 0,
        });
      });
      for (const id of runtime.remotePlayerIds()) if (!seen.has(id)) runtime.removeRemotePlayer(id);
      // Items away from where they were placed (movement modes).
      const rides: Array<{ instanceId: string; x: number; y: number; z: number; yaw: number }> = [];
      state.rides?.forEach((pose, instanceId) =>
        rides.push({ instanceId, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }),
      );
      runtime.applyRidePoses(rides);
      const key = list
        .map((player) => `${player.id}:${player.name}:${player.role}:${JSON.stringify(player.look)}`)
        .join('|');
      if (key === rosterKey) return;
      rosterKey = key;
      onStatus('online', list);
    });
    // The server refused a move (too fast): go back to the last position it accepted.
    current.onMessage('correction', (at: { x: number; y: number; z: number }) => runtime.teleportPlayer(at));
    // The place's game (P9-12): the server clock, respawns, and hits, deaths and the winner.
    current.onMessage('time', (message: { now: number }) => {
      serverOffset = message.now - Date.now();
      // The sea's waves run on the room's clock too (Tidewater sea): the same wave on every device.
      runtime.setServerOffset(serverOffset);
      applySpeed();
    });
    // A game's spawn spot: never inside a house or an item (owner, 2026-10-07).
    current.onMessage('respawn', (at: { x: number; y: number; z: number }) => runtime.teleportPlayer(at, { free: true }));
    // Riding (movement modes): refusals, exit spots and corrections, and the rules' speed.
    current.onMessage('ride-refused', (message: { reason: RideRefusal }) =>
      rideHandlers?.onRefused(message.reason),
    );
    current.onMessage('teleport', (message: { x: number; y: number; z: number; yaw: number; epoch?: number }) => {
      const { x, y, z, yaw } = message;
      const pose = { x, y, z, yaw };
      const next = teleportAction(message, Boolean(runtime.riding), moveEpoch);
      moveEpoch = next.epoch;
      if (next.action === 'place') {
        runtime.teleportPlayer(pose);
        return;
      }
      if (next.action === 'correct') {
        // A correction of the ridden item: at once, so the moves from here carry the new epoch.
        clearTeleport();
        runtime.rideCorrection(pose);
        return;
      }
      // An exit spot: the row decides (got off); still riding shortly after, it is applied anyway.
      clearTeleport();
      pendingTeleport = pose;
      teleportTimer = setTimeout(() => {
        teleportTimer = null;
        if (pendingTeleport === pose && runtime.riding) runtime.rideCorrection(pose);
        pendingTeleport = null;
      }, RIDE_TELEPORT_WAIT_MS);
    });
    current.onMessage('speed', (message: { factor: number; until: number }) => {
      ruleSpeed = message;
      applySpeed();
    });
    current.onMessage('sandbox-state', (message: { grants: unknown }) => {
      if (room !== current || !testing) return;
      const parsed = ProductGrantState.safeParse(message.grants);
      if (!parsed.success) return;
      productGrants = parsed.data;
      productHandlers?.onState(productGrants);
      applySpeed();
    });
    current.onMessage('sandbox-notice', (message: { message: string }) => productHandlers?.onNotice(message.message));
    current.onMessage('game-event', (event: GameWireEvent) => gameHandlers?.onGameEvent(event, self));
    // The place's scripts (P2-10): log lines for builders; the states reach Place settings through the API.
    // Live actors (FILM-11): takes and voices go through the room.
    current.onMessage('film-take', (event: FilmTakeEvent) => filmRoom.receivedTake(event));
    current.onMessage('film-voice', (event: FilmVoiceEvent) => filmRoom.receivedVoice(event));
    filmRoom.connect({ self: current.sessionId, take: (message) => current.send('film-take', message), voice: (message) => current.send('film-voice', message) });
    current.onMessage('script-log', (line: ScriptLogMessage) => scriptHandlers?.onLog(line));
    current.onMessage('script-status', () => undefined);
    // Co-building: edits in the room's order. Ours are confirmed, others' applied on top.
    const resync = () => {
      const mine = [
        ...unsaved.map((entry) => entry.command),
        ...runtime.pendingCommands().map((p) => p.command),
      ];
      unsaved = [];
      setBuilding(false);
      build?.onResync(mine);
    };
    const confirmOwn = (entry: Applied) => {
      runtime.confirmCommand(entry.id);
      unsaved.push({ version: entry.version, command: entry.command });
    };
    current.onMessage('saved', (message: { version: number }) => {
      unsaved = unsaved.filter((entry) => entry.version > message.version);
    });
    type Applied = { version: number; id: string; author: string; command: CommandPayload };
    const pendingIds = () => new Set(runtime.pendingCommands().map((pending) => pending.id));
    current.onMessage('applied', (entry: Applied) => {
      version = Math.max(version, entry.version);
      if (entry.author === self || pendingIds().has(entry.id)) confirmOwn(entry);
      else if (runtime.applyRemoteCommand(entry.command).resync) resync();
    });
    current.onMessage('catchup', (message: { commands: Applied[] }) => {
      // Our own edits from before a dropped connection come back here: confirm them by id.
      const mine = pendingIds();
      for (const entry of message.commands) {
        version = Math.max(version, entry.version);
        if (mine.has(entry.id)) confirmOwn(entry);
        else if (runtime.applyRemoteCommand(entry.command).resync) return resync();
      }
      // Edits the room never got (sent while the connection was dropping, or made while away).
      for (const pending of runtime.pendingCommands())
        // Refusing one can drop later edits that built on it: send only those still pending.
        if (pendingIds().has(pending.id)) sendCommand(current, pending.id, pending.command);
    });
    current.onMessage('rejected', (message: { id: string; message: string }) => {
      if (runtime.rejectCommand(message.id).resync) resync();
      build?.onRejected(message.message);
    });
    current.onMessage('resync', resync);
    resyncRoom = resync;
    // The same account joined from another tab or device: stay out, or the two push each other
    // out of the room forever. Edits save directly again, where a conflict is caught.
    current.onMessage('replaced', () => {
      closed = true;
      setBuilding(false);
      onStatus('replaced', []);
    });
    current.onMessage('removed', (message: { message: string }) => {
      closed = true;
      build?.onRemoved(message.message);
    });
    current.onMessage('role', (message: { role: 'owner' | 'builder' | 'player' | null }) => {
      // Removed: the room closes the connection; do not try to come back.
      if (message.role === null) closed = true;
      build?.onRoleChanged(message.role);
    });
    // Chat and safety: the room filters messages and hides blocked players both ways.
    current.onMessage('chat-status', (message: { enabled: boolean }) =>
      social?.onChatStatus(message.enabled),
    );
    current.onMessage('chat-history', (message: { messages: ChatMessage[] }) =>
      social?.onHistory(message.messages),
    );
    current.onMessage('chat', (message: ChatMessage) => social?.onMessage(message));
    current.onMessage('chat-notice', (message: { message: string }) => social?.onNotice(message.message));
    current.onMessage('blocks', (message: { sessionIds: string[] }) => {
      for (const id of message.sessionIds) social?.onBlocked(id, true);
    });
    current.onMessage('blocked', (message: { sessionId: string }) =>
      social?.onBlocked(message.sessionId, true),
    );
    current.onMessage('unblocked', (message: { sessionId: string }) =>
      social?.onBlocked(message.sessionId, false),
    );
    current.onMessage('reported', (message: { target: InGameReport['target'] }) =>
      social?.onReported(message.target),
    );
    // Building with the avatar's hands (decision 109): blocks from everyone, in the room's order.
    type Blocks = Array<[number, number, number, number]>;
    current.onMessage('player-blocks', (message: { blocks: Blocks }) =>
      runtime.applyPlayerBlocks(message.blocks),
    );
    current.onMessage('player-blocks-all', (message: { chunks: string[] }) =>
      runtime.loadPlayerBlocks(message.chunks),
    );
    current.onMessage('building', (message: { allowed: boolean; share: number; used: number }) => {
      runtime.setHands({ allowed: message.allowed });
      hands?.onBuilding(message);
    });
    current.onMessage('player-blocks-rejected', (message: { message: string }) =>
      hands?.onRefused(message.message),
    );

    current.onLeave(() => {
      if (room === current) { room = null; filmRoom.connect(null); }
      clearPlayers();
      // A returning player starts on foot (spec R4), at normal speed until the room says again
      // (it sends the account's running `set_speed` on the new connection).
      endRideHere();
      runtime.setSpeedFactor(1);
      clearProducts();
      gameHandlers?.onGame(null);
      if (closed) return;
      // Building stays on: new edits wait (pending) until the room is back.
      onStatus('reconnecting', []);
      reconnect(0);
    });
  };

  onStatus('connecting', []);
  if (!(await connect(targetRoomId))) {
    onStatus('offline', []);
    return session();
  }

  // Send the local pose, but only when it changed.
  let last = '';
  timer = setInterval(() => {
    if (!room) return;
    const p = runtime.localPlayer;
    const pose = { x: round(p.x), y: round(p.y), z: round(p.z), yaw: round(p.yaw), clip: p.clip, epoch: moveEpoch };
    const key = JSON.stringify(pose);
    if (key === last) return;
    last = key;
    room.send('move', pose);
  }, SEND_INTERVAL_MS);

  return session();
}

const round = (value: number) => Math.round(value * 100) / 100;
