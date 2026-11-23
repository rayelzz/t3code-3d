import { getTranslationsSnapshot, initializeGT, msg } from "gt-react";
import { describe, expect, it } from "vite-plus/test";
import { m, setActiveLocale } from "../i18n/messages";
import { computeGroundHeight, ISLAND_MOUNDS, resolvePlayerPosition } from "./worldPhysics";
import { getWorldSkinPalette, resolveWorldSkinId, WORLD_SKIN_OPTIONS } from "./worldSkins";
import { ISLAND_FISH_SPECIES, rollFishCatch, useWorld3DStore } from "./worldStore";

describe("worldSkins", () => {
  it("maps T3 Code theme identifiers to matching 3D island decor skins", () => {
    expect(resolveWorldSkinId("ocean")).toBe("ocean");
    expect(resolveWorldSkinId("grove")).toBe("grove");
    expect(resolveWorldSkinId("ember-dark")).toBe("ember");
    expect(resolveWorldSkinId("iris")).toBe("iris");
    expect(resolveWorldSkinId("t3-chat")).toBe("t3-chat");
    expect(resolveWorldSkinId("system")).toBe("ocean");
  });

  it("returns distinct daytime and starry-night lighting for every world skin", () => {
    for (const option of WORLD_SKIN_OPTIONS) {
      const day = getWorldSkinPalette(option.themePreference, "light");
      const night = getWorldSkinPalette(option.themePreference, "dark");
      expect(day.id).toBe(option.id);
      expect(night.id).toBe(option.id);
      expect(day.isNight).toBe(false);
      expect(night.isNight).toBe(true);
      expect(night.lampIntensity).toBeGreaterThan(day.lampIntensity);
      expect(day.directionalIntensity).toBeGreaterThan(night.directionalIntensity);
    }
  });
});

describe("worldStore & fishing", () => {
  it("rolls fish across rarity tiers deterministically for given random samples", () => {
    const common = rollFishCatch(1000, 0.2);
    const uncommon = rollFishCatch(2000, 0.65);
    const rare = rollFishCatch(3000, 0.88);
    const legendary = rollFishCatch(4000, 0.99);

    expect(common.rarity).toBe("common");
    expect(uncommon.rarity).toBe("uncommon");
    expect(rare.rarity).toBe("rare");
    expect(legendary.rarity).toBe("legendary");
    expect(ISLAND_FISH_SPECIES.some((s) => s.id === legendary.speciesId)).toBe(true);
  });

  it("tracks overlay transitions, teleport requests, and catches", () => {
    const store = useWorld3DStore.getState();
    store.setOverlayMode("workspace");
    expect(useWorld3DStore.getState().overlayMode).toBe("workspace");

    store.requestTeleport(1, 2, 0.5, "swimming");
    const tp = useWorld3DStore.getState().teleportTarget;
    expect(tp).toMatchObject({ x: 1, z: 2, yaw: 0.5, activity: "swimming" });

    const fish = rollFishCatch(5000, 0.98);
    store.recordFishCatch(fish);
    expect(useWorld3DStore.getState().lastCatch?.speciesId).toBe(fish.speciesId);
    expect(useWorld3DStore.getState().catches[0]?.speciesId).toBe(fish.speciesId);

    store.clearLastCatch();
    store.setOverlayMode("none");
    expect(useWorld3DStore.getState().lastCatch).toBeNull();
  });
});

describe("worldPhysics anti-clipping & anti-stuck", () => {
  it("elevates ground height onto every grass mound surface so avatar never clips inside hills", () => {
    for (const mound of ISLAND_MOUNDS) {
      const peakY = computeGroundHeight(mound.x, mound.z, "walking");
      const expectedPeak = mound.baseY + mound.r * mound.scaleY;
      expect(peakY).toBeCloseTo(expectedPeak, 3);
      expect(peakY).toBeGreaterThan(0.5);
    }
  });

  it("pushes player cleanly out of studio walls and tree trunks without getting stuck", () => {
    // 强行置于工作室西侧玻璃墙内侧边界，必须被平滑推出墙外而非卡死
    const outOfWall = resolvePlayerPosition(-8.0, -2.0);
    expect(Math.abs(outOfWall.x - -8.0)).toBeGreaterThanOrEqual(0.6);

    // 工作室北后墙外侧草坪（z = -11.2）应当可以自由环岛绕行
    const behindStudio = resolvePlayerPosition(0, -11.2);
    expect(behindStudio.x).toBeCloseTo(0, 2);
    expect(behindStudio.z).toBeCloseTo(-11.2, 2);

    // 强行置于圆树树干中心 (-12.8, -2.2)，必须推离树干半径之外
    const outOfTree = resolvePlayerPosition(-12.8, -2.2);
    expect(Math.hypot(outOfTree.x - -12.8, outOfTree.z - -2.2)).toBeGreaterThan(0.8);
  });
});

describe("world3d localization switching", () => {
  it("resolves 3D scene labels and interpolated canvas copy across zh, ja, and en", async () => {
    initializeGT({
      defaultLocale: "en",
      locales: ["en", "zh", "ja"],
      loadTranslations: async (locale: string) => {
        if (locale === "en") return {};
        const mod: { default: unknown } = await import(`../i18n/translations/${locale}.json`);
        return mod.default;
      },
      cacheExpiryTime: null,
    });
    try {
      await getTranslationsSnapshot("zh");
      setActiveLocale("zh");
      expect(m(msg("Working Board"))).toBe("工作状态黑板");
      expect(m(msg("{running} WORKING · {waiting} WAITING", { running: 2, waiting: 1 }))).toBe(
        "2 运行中 · 1 待确认",
      );
      expect(m(msg("{percent}% left", { percent: 80 }))).toBe("剩余 80%");

      await getTranslationsSnapshot("ja");
      setActiveLocale("ja");
      expect(m(msg("Working Board"))).toBe("稼働ボード");
      expect(m(msg("{percent}% left", { percent: 80 }))).toBe("残り 80%");

      setActiveLocale("en");
      expect(m(msg("Working Board"))).toBe("Working Board");
      expect(m(msg("{running} WORKING · {waiting} WAITING", { running: 2, waiting: 1 }))).toBe(
        "2 WORKING · 1 WAITING",
      );

      // 验证悬停交互物体在同 ID 下因切换语言产生的新 title/subtitle 会正常刷新 store
      const store = useWorld3DStore.getState();
      store.setHoveredInteractable({
        id: "working-board",
        kind: "working-board",
        title: "Working Board",
        subtitle: "Live running & waiting threads",
        worldX: 0,
        worldY: 2.3,
        worldZ: -8.6,
        radius: 5.2,
      });
      store.setHoveredInteractable({
        id: "working-board",
        kind: "working-board",
        title: "工作状态黑板",
        subtitle: "实时运行与等待中的会话",
        worldX: 0,
        worldY: 2.3,
        worldZ: -8.6,
        radius: 5.2,
      });
      expect(useWorld3DStore.getState().hoveredInteractable?.title).toBe("工作状态黑板");
      store.setHoveredInteractable(null);
    } finally {
      setActiveLocale("en");
    }
  });
});
