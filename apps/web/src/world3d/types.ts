import type {
  EnvironmentId,
  ScopedProjectRef,
  ScopedThreadRef,
  ServerProvider,
} from "@t3tools/contracts";

/** 3D 世界装潢皮肤 ID（与 T3 Code 皮肤主题双向联动） */
export type WorldSkinId = "ocean" | "grove" | "ember" | "iris" | "t3-chat";

/** 3D 世界装潢调色板，区分白天（light）和夜晚（dark）两套氛围 */
export interface WorldSkinPalette {
  readonly id: WorldSkinId;
  readonly isNight: boolean;
  /** 天空顶部颜色 */
  readonly skyTop: string;
  /** 天空地平线颜色 */
  readonly skyHorizon: string;
  /** 远景雾效颜色 */
  readonly fogColor: string;
  /** 太阳或月亮颜色 */
  readonly sunColor: string;
  /** 主方向光颜色 */
  readonly directionalLight: string;
  /** 主方向光强度 */
  readonly directionalIntensity: number;
  /** 半球光天空色 */
  readonly hemiSky: string;
  /** 半球光地面反光色 */
  readonly hemiGround: string;
  /** 半球光强度 */
  readonly hemiIntensity: number;
  /** 室内暖灯颜色 */
  readonly lampColor: string;
  /** 室内暖灯强度 */
  readonly lampIntensity: number;
  /** 远海浅水色 */
  readonly oceanShallow: string;
  /** 远海深水色 */
  readonly oceanDeep: string;
  /** 泳池水色 */
  readonly poolWater: string;
  /** 岛屿草地主色 */
  readonly grass: string;
  /** 岛屿草地高光色 */
  readonly grassAccent: string;
  /** 沙滩细沙色 */
  readonly sand: string;
  /** 工作室外墙色 */
  readonly wallColor: string;
  /** 工作室墙脚/装饰线条色 */
  readonly trimColor: string;
  /** 工作室地板木色 */
  readonly floorWood: string;
  /** 露台与栈桥木色 */
  readonly deckWood: string;
  /** 屋顶/遮阳篷主色 */
  readonly roofColor: string;
  /** 家具主木色 */
  readonly furnitureWood: string;
  /** 主题强调色（地毯、霓虹条、靠垫、遮阳伞条纹） */
  readonly accent: string;
  /** 次强调色 */
  readonly accentSecondary: string;
  /** 树冠主色 */
  readonly foliagePrimary: string;
  /** 树冠次色（花树或嫩叶） */
  readonly foliageSecondary: string;
  /** 角色默认卫衣主色 */
  readonly avatarShirt: string;
  /** 角色帽子/配饰色 */
  readonly avatarHat: string;
}

/** 投射到 3D 房间工位上的线程状态 */
export type WorldThreadVisualStatus = "running" | "waiting" | "completed" | "error" | "idle";

/** 3D 房间内一个 Agent 工位的数据模型 */
export interface WorldThreadStation {
  readonly key: string;
  readonly threadRef: ScopedThreadRef;
  readonly projectKey: string;
  readonly projectName: string;
  readonly title: string;
  readonly status: WorldThreadVisualStatus;
  readonly providerDriver: string;
  readonly providerLabel: string;
  readonly providerColor: string;
  readonly modelLabel: string;
  readonly hasPendingApproval: boolean;
  readonly isActive: boolean;
  readonly updatedAtMs: number;
}

/** 项目书架与 3D 项目专属工位的数据模型（一个项目一个固定工位） */
export interface WorldProjectSummary {
  readonly key: string;
  readonly projectRef: ScopedProjectRef;
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly cwd: string;
  readonly threadCount: number;
  readonly runningCount: number;
  readonly waitingCount: number;
  readonly status: WorldThreadVisualStatus;
  readonly latestThreadRef: ScopedThreadRef | null;
  readonly latestThreadTitle: string | null;
  readonly isActive: boolean;
  readonly accentColor: string;
}

/** 单个供应商在墙面用量大屏上的配额与统计 */
export interface WorldProviderUsageCard {
  readonly id: string;
  readonly driver: ServerProvider["driver"] | string;
  readonly label: string;
  readonly color: string;
  readonly tokens: number;
  readonly costUsd: number;
  readonly limitRemainingPercent: number | null;
  readonly limitResetText: string | null;
  readonly limitSummary: string | null;
}

/** 墙面数据大屏所需的完整用量与限制快照 */
export interface WorldUsageSnapshot {
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly connectedEnvironments: number;
  readonly totalEnvironments: number;
  readonly providers: ReadonlyArray<WorldProviderUsageCard>;
  readonly isPending: boolean;
}

/** 3D 场景中的可交互物件类别 */
export type WorldInteractableKind =
  | "desk"
  | "project-station"
  | "working-board"
  | "projects-shelf"
  | "usage-wall"
  | "settings-console"
  | "theme-wardrobe"
  | "pr-board"
  | "fishing-dock"
  | "pool-ladder"
  | "beach-chair";

/** 3D 场景中的可交互物件元数据 */
export interface WorldInteractable {
  readonly id: string;
  readonly kind: WorldInteractableKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly radius: number;
  readonly projectRef?: ScopedProjectRef;
  readonly projectKey?: string;
  readonly threadRef?: ScopedThreadRef;
  readonly threadKey?: string;
  readonly status?: WorldThreadVisualStatus;
}

/** 当前打开的 2D 叠加浮层模式 */
export type WorldOverlayMode = "none" | "workspace" | "projects" | "skins";

/** 角色当前在 3D 世界中的活动状态 */
export type PlayerActivity = "walking" | "swimming" | "fishing" | "lounging";

/** 钓鱼收获物定义 */
export interface FishSpecies {
  readonly id: string;
  readonly rarity: "common" | "uncommon" | "rare" | "legendary";
  readonly color: string;
  readonly sizeCm: number;
  readonly emoji: string;
}

/** 单次钓获记录 */
export interface FishCatchRecord {
  readonly speciesId: string;
  readonly rarity: FishSpecies["rarity"];
  readonly color: string;
  readonly sizeCm: number;
  readonly emoji: string;
  readonly caughtAt: number;
}

/** 钓鱼小游戏状态 */
export type FishingPhase = "idle" | "casting" | "waiting" | "biting" | "caught" | "missed";

/** 户外游玩时用于跨空间召回用户到对应工位 */
export interface WorldAgentAlert {
  readonly id: string;
  readonly threadRef: ScopedThreadRef;
  readonly threadTitle: string;
  readonly projectName: string;
  readonly kind: "waiting" | "completed" | "error";
  readonly createdAt: number;
}

/** 投射到 3D 空间坐标之上的原生 DOM 液态玻璃浮空标牌 */
export interface WorldFloatingLabel {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly dotColor?: string;
  readonly status?: WorldThreadVisualStatus;
  readonly isProject?: boolean;
  readonly isActive?: boolean;
  readonly interactable: WorldInteractable;
}

/** 同步给 Three.js 引擎的完整只读快照 */
export interface WorldSceneSyncPayload {
  readonly locale: string;
  readonly skin: WorldSkinPalette;
  readonly activeThreadTitle: string;
  readonly activeThreadStatus: WorldThreadVisualStatus;
  readonly activeProjectName: string;
  readonly stations: ReadonlyArray<WorldThreadStation>;
  readonly projects: ReadonlyArray<WorldProjectSummary>;
  readonly usage: WorldUsageSnapshot;
  readonly inputEnabled: boolean;
  readonly lowPowerMode: boolean;
}
