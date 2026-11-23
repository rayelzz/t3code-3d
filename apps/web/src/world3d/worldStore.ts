import { create } from "zustand";
import type {
  FishCatchRecord,
  FishSpecies,
  FishingPhase,
  PlayerActivity,
  WorldAgentAlert,
  WorldInteractable,
  WorldOverlayMode,
} from "./types";

/** 可在海边栈桥钓起的海岛图鉴鱼种 */
export const ISLAND_FISH_SPECIES: ReadonlyArray<FishSpecies> = [
  { id: "clownfish", rarity: "common", color: "#ff7f45", sizeCm: 14, emoji: "🐠" },
  { id: "sea-bass", rarity: "common", color: "#68b6c7", sizeCm: 48, emoji: "🐟" },
  { id: "coral-snapper", rarity: "common", color: "#ff6f8d", sizeCm: 34, emoji: "🐡" },
  { id: "blue-tuna", rarity: "uncommon", color: "#3d82d6", sizeCm: 118, emoji: "🐟" },
  { id: "golden-koi", rarity: "rare", color: "#f6c445", sizeCm: 62, emoji: "🐠" },
  { id: "star-jellyfish", rarity: "rare", color: "#a58bff", sizeCm: 38, emoji: "🪼" },
  { id: "commit-bottle", rarity: "uncommon", color: "#58d4b7", sizeCm: 24, emoji: "🍾" },
  { id: "rainbow-bugfree", rarity: "legendary", color: "#ff6bd6", sizeCm: 168, emoji: "🐳" },
];

const CATCHES_STORAGE_KEY = "t3code3d:fish-catches:v1";

function loadStoredCatches(): ReadonlyArray<FishCatchRecord> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 40) as ReadonlyArray<FishCatchRecord>;
  } catch {
    return [];
  }
}

function saveStoredCatches(catches: ReadonlyArray<FishCatchRecord>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATCHES_STORAGE_KEY, JSON.stringify(catches.slice(0, 40)));
  } catch {
    // 忽略隐私模式或配额不足
  }
}

export interface TeleportTarget {
  readonly x: number;
  readonly z: number;
  readonly yaw?: number;
  readonly activity?: PlayerActivity;
  readonly nonce: number;
}

interface World3DStoreState {
  readonly overlayMode: WorldOverlayMode;
  readonly workspaceFullscreen: boolean;
  readonly nearbyInteractable: WorldInteractable | null;
  readonly hoveredInteractable: WorldInteractable | null;
  readonly playerActivity: PlayerActivity;
  readonly fishingPhase: FishingPhase;
  readonly lastCatch: FishCatchRecord | null;
  readonly catches: ReadonlyArray<FishCatchRecord>;
  readonly soundEnabled: boolean;
  readonly agentAlert: WorldAgentAlert | null;
  readonly teleportTarget: TeleportTarget | null;
  readonly controlsHintVisible: boolean;

  setOverlayMode: (mode: WorldOverlayMode) => void;
  toggleWorkspaceFullscreen: () => void;
  setNearbyInteractable: (item: WorldInteractable | null) => void;
  setHoveredInteractable: (item: WorldInteractable | null) => void;
  setPlayerActivity: (activity: PlayerActivity) => void;
  setFishingPhase: (phase: FishingPhase) => void;
  recordFishCatch: (record: FishCatchRecord) => void;
  clearLastCatch: () => void;
  toggleSound: () => void;
  setAgentAlert: (alert: WorldAgentAlert | null) => void;
  requestTeleport: (x: number, z: number, yaw?: number, activity?: PlayerActivity) => void;
  dismissControlsHint: () => void;
}

export const useWorld3DStore = create<World3DStoreState>((set) => ({
  overlayMode: "none",
  workspaceFullscreen: false,
  nearbyInteractable: null,
  hoveredInteractable: null,
  playerActivity: "walking",
  fishingPhase: "idle",
  lastCatch: null,
  catches: loadStoredCatches(),
  soundEnabled: true,
  agentAlert: null,
  teleportTarget: null,
  controlsHintVisible: true,

  setOverlayMode: (overlayMode) => set({ overlayMode }),
  toggleWorkspaceFullscreen: () =>
    set((state) => ({ workspaceFullscreen: !state.workspaceFullscreen })),
  setNearbyInteractable: (nearbyInteractable) =>
    set((state) =>
      state.nearbyInteractable?.id === nearbyInteractable?.id &&
      state.nearbyInteractable?.title === nearbyInteractable?.title &&
      state.nearbyInteractable?.subtitle === nearbyInteractable?.subtitle
        ? state
        : { nearbyInteractable },
    ),
  setHoveredInteractable: (hoveredInteractable) =>
    set((state) =>
      state.hoveredInteractable?.id === hoveredInteractable?.id &&
      state.hoveredInteractable?.title === hoveredInteractable?.title &&
      state.hoveredInteractable?.subtitle === hoveredInteractable?.subtitle
        ? state
        : { hoveredInteractable },
    ),
  setPlayerActivity: (playerActivity) => set({ playerActivity }),
  setFishingPhase: (fishingPhase) => set({ fishingPhase }),
  recordFishCatch: (record) =>
    set((state) => {
      const nextCatches = [record, ...state.catches].slice(0, 40);
      saveStoredCatches(nextCatches);
      return { catches: nextCatches, lastCatch: record };
    }),
  clearLastCatch: () => set({ lastCatch: null }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  setAgentAlert: (agentAlert) => set({ agentAlert }),
  requestTeleport: (x, z, yaw, activity) =>
    set((state) => ({
      teleportTarget: {
        x,
        z,
        ...(yaw !== undefined ? { yaw } : {}),
        ...(activity !== undefined ? { activity } : {}),
        nonce: (state.teleportTarget?.nonce ?? 0) + 1,
      },
    })),
  dismissControlsHint: () => set({ controlsHintVisible: false }),
}));

/** 根据权重随机生成一条钓获记录 */
export function rollFishCatch(nowMs: number, randomValue: number): FishCatchRecord {
  // 权重：普通 55%、稀有 25%、珍稀 15%、传奇 5%
  const pool =
    randomValue > 0.95
      ? ISLAND_FISH_SPECIES.filter((s) => s.rarity === "legendary")
      : randomValue > 0.8
        ? ISLAND_FISH_SPECIES.filter((s) => s.rarity === "rare")
        : randomValue > 0.55
          ? ISLAND_FISH_SPECIES.filter((s) => s.rarity === "uncommon")
          : ISLAND_FISH_SPECIES.filter((s) => s.rarity === "common");
  const picked = pool[Math.floor((randomValue * 997) % pool.length)] ?? ISLAND_FISH_SPECIES[0]!;
  const sizeJitter = 0.85 + ((randomValue * 137) % 0.35);
  return {
    speciesId: picked.id,
    rarity: picked.rarity,
    color: picked.color,
    sizeCm: Math.max(8, Math.round(picked.sizeCm * sizeJitter)),
    emoji: picked.emoji,
    caughtAt: nowMs,
  };
}
