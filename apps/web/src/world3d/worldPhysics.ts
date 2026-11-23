import type { PlayerActivity } from "./types";

/** 玩家胶囊体水平碰撞半径（米） */
const PLAYER_COLLISION_RADIUS = 0.42;

/** 跳跃初速度与重力加速度（手感轻快有弹性，起跳高度约 1.3m） */
export const JUMP_VELOCITY = 7.6;
export const GRAVITY = 22.0;

/** 泳池区域矩形范围 */
export const POOL_BOUNDS = {
  minX: -10.8,
  maxX: -4.2,
  minZ: 6.4,
  maxZ: 12.6,
} as const;

/** 栈桥可行走区域（收窄远离边桩，并延伸至碧蓝深海） */
const DOCK_BOUNDS = {
  minX: -1.25,
  maxX: 1.25,
  minZ: 13.0,
  maxZ: 26.2,
} as const;

/** 房间内最多展示 8 个 Agent 对话工位坐标 */
export const AGENT_STATION_SLOTS: ReadonlyArray<{
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
}> = [
  { x: -5.4, z: -5.2, rotY: 0.45 },
  { x: 5.4, z: -5.2, rotY: -0.45 },
  { x: -6.1, z: -2.0, rotY: 0.85 },
  { x: 6.1, z: -2.0, rotY: -0.85 },
  { x: -5.2, z: 1.0, rotY: 1.2 },
  { x: 5.2, z: 1.0, rotY: -1.2 },
  { x: -3.0, z: -3.1, rotY: 0.28 },
  { x: 3.0, z: -3.1, rotY: -0.28 },
];

/** 草地嫩草小山丘定义（视觉建模与真实地形坡度高度共用同一份数据，杜绝脚部穿模） */
export interface IslandMound {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly baseY: number;
}

export const ISLAND_MOUNDS: ReadonlyArray<IslandMound> = [
  { x: -12.2, z: -6.5, r: 2.3, scaleX: 1.2, scaleY: 0.32, scaleZ: 1.1, baseY: 0.05 },
  { x: 12.0, z: -5.0, r: 2.5, scaleX: 1.2, scaleY: 0.32, scaleZ: 1.1, baseY: 0.05 },
  { x: -11.5, z: 3.2, r: 1.8, scaleX: 1.2, scaleY: 0.32, scaleZ: 1.1, baseY: 0.05 },
  { x: 11.8, z: 2.6, r: 2.1, scaleX: 1.2, scaleY: 0.32, scaleZ: 1.1, baseY: 0.05 },
];

/** 椰子树坐标（视觉与树干碰撞共享） */
export const PALM_TREE_SPOTS: ReadonlyArray<{
  readonly x: number;
  readonly z: number;
  readonly s: number;
  readonly rot: number;
}> = [
  { x: -13.2, z: 12.2, s: 1.15, rot: 0.5 },
  { x: 13.4, z: 11.4, s: 1.2, rot: -0.6 },
  { x: 14.2, z: 2.2, s: 1.05, rot: 1.2 },
  { x: -14.6, z: 1.5, s: 1.0, rot: -1.1 },
];

/** 圆滚滚果树/花树坐标（视觉与树干碰撞共享） */
export const ROUND_TREE_SPOTS: ReadonlyArray<{
  readonly x: number;
  readonly z: number;
  readonly s: number;
  readonly blossom: boolean;
}> = [
  { x: -12.0, z: -8.8, s: 1.15, blossom: true },
  { x: 12.2, z: -8.2, s: 1.2, blossom: false },
  { x: -12.8, z: -2.2, s: 0.95, blossom: false },
  { x: 12.6, z: -3.2, s: 1.0, blossom: true },
  { x: -5.0, z: -13.2, s: 1.1, blossom: false },
  { x: 5.4, z: -13.0, s: 1.25, blossom: true },
];

export interface CircleCollider {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface BoxCollider {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** 工作室墙体与露台栏杆的精确 AABB 碰撞盒（允许玩家自由绕行房屋外侧一周） */
const STATIC_BOX_COLLIDERS: ReadonlyArray<BoxCollider> = [
  // 北后墙
  { minX: -8.2, maxX: 8.2, minZ: -9.75, maxZ: -9.25 },
  // 西侧玻璃矮墙
  { minX: -8.22, maxX: -7.78, minZ: -9.6, maxZ: 1.65 },
  // 东侧玻璃矮墙
  { minX: 7.78, maxX: 8.22, minZ: -9.6, maxZ: 1.65 },
  // 南露台左侧护栏
  { minX: -8.0, maxX: -3.28, minZ: 5.85, maxZ: 6.18 },
  // 南露台右侧护栏
  { minX: 3.28, maxX: 8.0, minZ: 5.85, maxZ: 6.18 },
];

/** 家具、室内盆栽、沙滩躺椅与所有树干的圆形碰撞体 */
const STATIC_CIRCLE_COLLIDERS: ReadonlyArray<CircleCollider> = [
  // 主办公桌（矩形桌用两圆近似覆盖宽桌面，不留穿透死角）
  { x: -0.95, z: -6.7, r: 0.95 },
  { x: 0.95, z: -6.7, r: 0.95 },
  // 项目书架
  { x: -6.9, z: -7.1, r: 0.95 },
  // 设置控制台
  { x: 6.9, z: -7.1, r: 0.95 },
  // 皮肤装潢画架
  { x: 7.2, z: -2.0, r: 0.72 },
  // PR/任务公告板
  { x: -7.2, z: -2.0, r: 0.72 },
  // 室内四个角落盆栽
  { x: -7.1, z: 0.8, r: 0.45 },
  { x: 7.1, z: 0.8, r: 0.45 },
  { x: -6.15, z: -8.65, r: 0.42 },
  { x: 6.15, z: -8.65, r: 0.42 },
  // 东侧沙滩躺椅遮阳伞柱
  { x: 9.75, z: 9.3, r: 0.35 },
  // 全部椰子树树干
  ...PALM_TREE_SPOTS.map((p) => ({ x: p.x, z: p.z, r: 0.42 * p.s })),
  // 全部圆球树树干
  ...ROUND_TREE_SPOTS.map((t) => ({ x: t.x, z: t.z, r: 0.46 * t.s })),
];

export function isPointInsidePool(x: number, z: number): boolean {
  return (
    x > POOL_BOUNDS.minX + 0.35 &&
    x < POOL_BOUNDS.maxX - 0.35 &&
    z > POOL_BOUNDS.minZ + 0.35 &&
    z < POOL_BOUNDS.maxZ - 0.35
  );
}

/** 计算岛屿指定 (x, z) 位置的真实地面/坡面高度（包含草丘椭球表面，彻底避免脚部穿模） */
export function computeGroundHeight(x: number, z: number, activity: PlayerActivity): number {
  if (activity === "swimming") return -0.34;
  if (activity === "lounging") return 0.42;

  // 工作室木地板与南露台
  if (Math.abs(x) < 8.1 && z > -9.4 && z < 1.65) {
    return 0.24;
  }
  if (Math.abs(x) < 8.1 && z >= 1.65 && z < 6.15) {
    return 0.2;
  }

  // 海边木质栈桥
  if (x >= DOCK_BOUNDS.minX - 0.4 && x <= DOCK_BOUNDS.maxX + 0.4 && z >= DOCK_BOUNDS.minZ) {
    return 0.22;
  }

  // 青草高台 vs 外圈细沙沙滩基础高度
  const grassDistSq = x * x + (z + 0.4) * (z + 0.4);
  let y = grassDistSq <= 15.1 * 15.1 ? 0.13 : 0.08;

  // 叠加每一个嫩草小山丘的真实椭球表面高度，角色可丝滑踩上草丘顶！
  for (const m of ISLAND_MOUNDS) {
    const rx = m.r * m.scaleX;
    const rz = m.r * m.scaleZ;
    const nx = (x - m.x) / rx;
    const nz = (z - m.z) / rz;
    const norm = nx * nx + nz * nz;
    if (norm < 1) {
      const surfaceY = m.baseY + m.r * m.scaleY * Math.sqrt(1 - norm);
      if (surfaceY > y) y = surfaceY;
    }
  }

  return y;
}

/**
 * 基于多轮迭代最短向量推离（Push-Out）解析角色位置：
 * - 遇到墙体、树干、家具、Agent 工位时平滑沿切线滑行，绝不穿模也绝不卡死在夹角中。
 * - 超出岛屿海岸或栈桥边缘时柔和夹紧回合法陆地/栈桥域。
 */
export function resolvePlayerPosition(
  rawX: number,
  rawZ: number,
  dynamicCircles: ReadonlyArray<CircleCollider> = [],
): { readonly x: number; readonly z: number } {
  let x = rawX;
  let z = rawZ;
  const r = PLAYER_COLLISION_RADIUS;

  for (let iter = 0; iter < 4; iter++) {
    // 1. 推离 AABB 墙体与护栏
    for (const box of STATIC_BOX_COLLIDERS) {
      const closestX = Math.max(box.minX, Math.min(x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq === 0) {
        // 中心已落入矩形内时，沿最近的一条边推出
        const toLeft = x - box.minX;
        const toRight = box.maxX - x;
        const toTop = z - box.minZ;
        const toBottom = box.maxZ - z;
        const minPen = Math.min(toLeft, toRight, toTop, toBottom);
        if (minPen === toLeft) x = box.minX - r;
        else if (minPen === toRight) x = box.maxX + r;
        else if (minPen === toTop) z = box.minZ - r;
        else z = box.maxZ + r;
      } else if (distSq < r * r) {
        const dist = Math.sqrt(distSq);
        const push = r - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      }
    }

    // 2. 推离静态圆形碰撞体（家具、盆栽、树干）与动态 Agent 迷你圆桌
    const pushOutCircle = (c: CircleCollider) => {
      const dx = x - c.x;
      const dz = z - c.z;
      const minDist = r + c.r;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        if (distSq < 1e-6) {
          z += minDist;
        } else {
          const dist = Math.sqrt(distSq);
          const push = minDist - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    };

    for (const c of STATIC_CIRCLE_COLLIDERS) pushOutCircle(c);
    for (const c of dynamicCircles) pushOutCircle(c);

    // 3. 岛屿外海岸 & 木栈桥边界平滑约束
    const onDockApproach = z >= DOCK_BOUNDS.minZ && Math.abs(x) <= 2.35;
    if (onDockApproach) {
      if (z > 16.4) {
        x = Math.max(DOCK_BOUNDS.minX, Math.min(DOCK_BOUNDS.maxX, x));
      }
      if (z > DOCK_BOUNDS.maxZ) {
        z = DOCK_BOUNDS.maxZ;
      }
    } else {
      const islandCenterZ = 1.4;
      const maxIslandR = 16.3;
      const dx = x;
      const dz = z - islandCenterZ;
      const dist = Math.hypot(dx, dz);
      if (dist > maxIslandR) {
        x = (dx / dist) * maxIslandR;
        z = islandCenterZ + (dz / dist) * maxIslandR;
      }
    }
  }

  return { x, z };
}
