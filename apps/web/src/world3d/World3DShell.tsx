import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { BackgroundThreadAnnouncer } from "../components/BackgroundThreadAnnouncer";
import { HistorySwipeNavigation } from "../components/HistorySwipeNavigation";
import {
  isAppModalPage,
  isSidebarUtilityPage,
  useNavigateToMainApp,
} from "../components/sidebar/mainAppLocation";
import { SidebarProvider } from "../components/ui/sidebar";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { isElectron } from "../env";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { PanelAnimationSuppressionProvider } from "../panelAnimations";
import { registerMenuAction } from "../shortcuts/dispatcher";
import { buildThreadRouteParams } from "../threadRoutes";
import { playAgentNotificationChime } from "./soundEffects";
import type { WorldInteractable, WorldSceneSyncPayload, WorldThreadVisualStatus } from "./types";
import { useWorldData } from "./useWorldData";
import { WorldCanvas } from "./WorldCanvas";
import { WORLD_LANDMARKS, type WorldEngine } from "./WorldEngine";
import { WorldHud } from "./WorldHud";
import { WorldProjectsDrawer } from "./WorldProjectsDrawer";
import { WorldSkinsDrawer } from "./WorldSkinsDrawer";
import { useWorld3DStore } from "./worldStore";
import { WorldWorkspaceOverlay } from "./WorldWorkspaceOverlay";

/**
 * 3D 海岛开放世界主应用外壳：
 * - 启动即进入第三人称治愈系海岛世界，小人自由走动、游泳、钓鱼。
 * - 无缝保留 T3 Code 的 SidebarProvider、路由状态、设置、用量、命令面板与完整编码工作台。
 */
export function World3DShell({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const handleNewThread = useNewThreadHandler();
  const router = useRouter();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const engineRef = useRef<WorldEngine | null>(null);

  const worldData = useWorldData();
  const overlayMode = useWorld3DStore((state) => state.overlayMode);
  const setOverlayMode = useWorld3DStore((state) => state.setOverlayMode);
  const requestTeleport = useWorld3DStore((state) => state.requestTeleport);
  const setAgentAlert = useWorld3DStore((state) => state.setAgentAlert);
  const agentAlert = useWorld3DStore((state) => state.agentAlert);

  const modalRouteOpen = isAppModalPage(pathname);
  const utilityRouteOpen = isSidebarUtilityPage(pathname);
  const workspaceVisible = !modalRouteOpen && (overlayMode === "workspace" || utilityRouteOpen);

  // 当有任何浮层或原生 Settings / Usage 弹窗打开时，自动交还键盘并降低 3D 渲染帧率以节能
  const worldInputEnabled = !modalRouteOpen && !utilityRouteOpen && overlayMode === "none";
  const lowPowerMode = modalRouteOpen || workspaceVisible;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 注册原生桌面菜单「打开设置」事件
  useEffect(() => {
    return registerMenuAction("open-settings", () => {
      if (!/^\/settings(\/|$)/.test(router.state.location.pathname)) {
        void router.navigate({ to: "/settings" });
      }
    });
  }, [router]);

  // 监测后台运行中线程的状态跃迁：在海岛游玩时一旦完成或需要审批发出提醒，状态推进后立即清理过期的等待提示
  const prevStatusMapRef = useRef<Map<string, WorldThreadVisualStatus>>(new Map());
  const statusBaselineReadyRef = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 监测后台 Agent 线程状态变化并在海岛漫游时提醒与清理过期提示
  useEffect(() => {
    const prevMap = prevStatusMapRef.current;
    if (!statusBaselineReadyRef.current) {
      for (const st of worldData.stations) {
        prevMap.set(st.key, st.status);
      }
      if (worldData.stations.length > 0) {
        statusBaselineReadyRef.current = true;
      }
      return;
    }

    const store = useWorld3DStore.getState();
    const isRoaming = store.overlayMode === "none" && !modalRouteOpen && !utilityRouteOpen;
    const stationByKey = new Map(worldData.stations.map((st) => [st.key, st]));

    // 若当前已有等待/错误提示对应的线程状态已推进（如已批准后恢复运行或已完成），立即同步清理或更新
    const currentAlert = store.agentAlert;
    if (currentAlert) {
      const alertKey = currentAlert.id.split(":").slice(0, -1).join(":");
      const currentStation = stationByKey.get(alertKey);
      if (
        !currentStation ||
        (workspaceVisible && currentStation.isActive) ||
        (currentAlert.kind === "waiting" && currentStation.status !== "waiting")
      ) {
        store.setAgentAlert(null);
      }
    }

    for (const st of worldData.stations) {
      const prev = prevMap.get(st.key);
      if (isRoaming && prev !== undefined && prev !== st.status) {
        if (st.status === "waiting") {
          playAgentNotificationChime(store.soundEnabled, true);
          store.setAgentAlert({
            id: `${st.key}:waiting`,
            threadRef: st.threadRef,
            threadTitle: st.title,
            projectName: st.projectName,
            kind: "waiting",
            createdAt: st.updatedAtMs,
          });
        } else if (
          (prev === "running" || prev === "waiting") &&
          (st.status === "completed" || st.status === "error")
        ) {
          playAgentNotificationChime(store.soundEnabled, st.status === "error");
          store.setAgentAlert({
            id: `${st.key}:${st.status}`,
            threadRef: st.threadRef,
            threadTitle: st.title,
            projectName: st.projectName,
            kind: st.status === "error" ? "error" : "completed",
            createdAt: st.updatedAtMs,
          });
        }
      }
      prevMap.set(st.key, st.status);
    }
  }, [modalRouteOpen, utilityRouteOpen, workspaceVisible, worldData.stations]);

  // 回到 3D 海岛时释放原工作台残留焦点，确保 WASD/E 立即响应漫游控制
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 切回 3D 漫游态时主动 blur 残留控件焦点
  useEffect(() => {
    if (worldInputEnabled && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [worldInputEnabled]);

  // 全局快捷热键：Tab 仅在海岛漫游或主工作台内切换工作台（不拦截书架/皮肤抽屉内的焦点导航），Esc 回到 3D 海岛
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 绑定 Tab 与 Esc 实现 3D 海岛与编码工作台的丝滑切换
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isCommandPaletteOpen() || modalRouteOpen) return;
      const target = event.target;
      const isEditing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.closest('[data-composer-rich-text="true"]') !== null ||
          target.closest(".xterm") !== null);

      if (event.key === "Tab" && !isEditing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const current = useWorld3DStore.getState().overlayMode;
        if (current === "none" || current === "workspace") {
          event.preventDefault();
          setOverlayMode(current === "workspace" ? "none" : "workspace");
        }
        return;
      }

      if (event.key === "Escape") {
        const current = useWorld3DStore.getState().overlayMode;
        if (current !== "none" && !isEditing) {
          event.preventDefault();
          setOverlayMode("none");
          return;
        }
        if (utilityRouteOpen && !isEditing) {
          event.preventDefault();
          void navigateToMainApp();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalRouteOpen, navigateToMainApp, setOverlayMode, utilityRouteOpen]);

  // 3D 世界内物件交互统一分发
  const handleOpenInteractable = (item: WorldInteractable) => {
    switch (item.kind) {
      case "desk":
        setOverlayMode("workspace");
        break;
      case "project-station":
        if (item.threadRef) {
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(item.threadRef),
          });
          setOverlayMode("workspace");
        } else if (item.projectRef) {
          void handleNewThread(item.projectRef).then(() => {
            setOverlayMode("workspace");
          });
        } else {
          setOverlayMode("projects");
        }
        break;
      case "working-board": {
        const activeWorking = worldData.stations.find(
          (st) => st.status === "waiting" || st.status === "running",
        );
        if (activeWorking) {
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(activeWorking.threadRef),
          });
          setOverlayMode("workspace");
        } else {
          setOverlayMode("projects");
        }
        break;
      }
      case "projects-shelf":
      case "pr-board":
        setOverlayMode("projects");
        break;
      case "usage-wall":
        setOverlayMode("none");
        void navigate({ to: "/usage" });
        break;
      case "settings-console":
        setOverlayMode("none");
        void navigate({ to: "/settings/general" });
        break;
      case "theme-wardrobe":
        setOverlayMode("skins");
        break;
      case "fishing-dock":
        engineRef.current?.triggerFishingAction();
        break;
      case "pool-ladder":
        engineRef.current?.enterPoolSwim();
        break;
      case "beach-chair":
        engineRef.current?.toggleBeachLounge();
        break;
    }
  };

  const handleReturnToIsland = () => {
    setOverlayMode("none");
    if (utilityRouteOpen) {
      void navigateToMainApp();
    }
  };

  const handleToggleDayNight = () => {
    worldData.themeState.setAppearanceMode(worldData.skinPalette.isNight ? "light" : "dark");
  };

  const handleJumpToAlertThread = () => {
    if (!agentAlert) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(agentAlert.threadRef),
    });
    requestTeleport(WORLD_LANDMARKS.desk.x, WORLD_LANDMARKS.desk.z, WORLD_LANDMARKS.desk.yaw);
    setAgentAlert(null);
    setOverlayMode("workspace");
  };

  const syncPayload: WorldSceneSyncPayload = {
    locale: worldData.locale,
    skin: worldData.skinPalette,
    activeThreadTitle: worldData.activeThreadTitle,
    activeThreadStatus: worldData.activeThreadStatus,
    activeProjectName: worldData.activeProjectName,
    stations: worldData.stations,
    projects: worldData.projects,
    usage: worldData.usage,
    inputEnabled: worldInputEnabled,
    lowPowerMode,
  };

  return (
    <PanelAnimationSuppressionProvider value={false}>
      <SidebarProvider
        className="h-dvh! min-h-0! overflow-hidden"
        storageKey="chat_thread_sidebar_open"
      >
        {/* 底层 3D 治愈海岛世界 */}
        <WorldCanvas
          payload={syncPayload}
          onOpenInteractable={handleOpenInteractable}
          engineRef={engineRef}
        />

        {/* 漫游态动森风轻 HUD（打开书架或皮肤抽屉时置为 inert，防止 Tab 焦点穿透到背后按钮） */}
        {!workspaceVisible && !modalRouteOpen ? (
          <div inert={overlayMode !== "none"}>
            <WorldHud
              activeProjectName={syncPayload.activeProjectName}
              activeThreadTitle={syncPayload.activeThreadTitle}
              runningCount={worldData.runningCount}
              waitingCount={worldData.waitingCount}
              totalThreads={worldData.stations.length}
              isNight={worldData.skinPalette.isNight}
              usage={worldData.usage}
              onOpenWorkspace={() => setOverlayMode("workspace")}
              onOpenProjects={() => setOverlayMode("projects")}
              onOpenSkins={() => setOverlayMode("skins")}
              onOpenUsage={() => void navigate({ to: "/usage" })}
              onOpenSettings={() => void navigate({ to: "/settings/general" })}
              onToggleDayNight={handleToggleDayNight}
              onInteractNow={handleOpenInteractable}
              onFishingAction={() => engineRef.current?.triggerFishingAction()}
              onStopLeisure={() => engineRef.current?.stopLeisureActivity()}
              onJumpToAlertThread={handleJumpToAlertThread}
            />
          </div>
        ) : null}

        {/* 聚焦编码工作台（完整复用原生 ChatView + DiffPanel + Terminal + PRs + Issues + Workflows） */}
        <WorldWorkspaceOverlay
          visible={workspaceVisible}
          activeProjectKey={worldData.activeProjectKey}
          stations={worldData.stations}
          projects={worldData.projects}
          onReturnToIsland={handleReturnToIsland}
          onOpenProjects={() => setOverlayMode("projects")}
          onOpenUsage={() => void navigate({ to: "/usage" })}
          onOpenSettings={() => void navigate({ to: "/settings/general" })}
        >
          {children}
        </WorldWorkspaceOverlay>

        {/* 项目书架与对话总览抽屉 */}
        <WorldProjectsDrawer
          open={overlayMode === "projects" && !modalRouteOpen}
          projects={worldData.projects}
          stations={worldData.stations}
          onClose={() => setOverlayMode("none")}
          onOpenWorkspace={() => setOverlayMode("workspace")}
        />

        {/* 3D 皮肤与房间世界装潢抽屉 */}
        <WorldSkinsDrawer
          open={overlayMode === "skins" && !modalRouteOpen}
          activeSkinId={worldData.skinId}
          appearanceMode={worldData.themeState.appearanceMode}
          onSelectSkin={(pref) => worldData.themeState.setTheme(pref)}
          onSelectAppearanceMode={(mode) => worldData.themeState.setAppearanceMode(mode)}
          onClose={() => setOverlayMode("none")}
        />

        <BackgroundThreadAnnouncer />
        {isElectron ? <HistorySwipeNavigation /> : null}
      </SidebarProvider>
    </PanelAnimationSuppressionProvider>
  );
}
