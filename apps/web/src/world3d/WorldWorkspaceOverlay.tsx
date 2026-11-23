import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  ActivityIcon,
  FolderKanbanIcon,
  Maximize2Icon,
  MessageSquarePlusIcon,
  Minimize2Icon,
  PalmtreeIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { buildThreadRouteParams } from "../threadRoutes";
import { statusAccentColor } from "./sceneTextures";
import type { WorldProjectSummary, WorldThreadStation } from "./types";
import { useWorld3DStore } from "./worldStore";

interface WorldWorkspaceOverlayProps {
  readonly visible: boolean;
  readonly activeProjectKey: string | null;
  readonly stations: ReadonlyArray<WorldThreadStation>;
  readonly projects: ReadonlyArray<WorldProjectSummary>;
  readonly onReturnToIsland: () => void;
  readonly onOpenProjects: () => void;
  readonly onOpenUsage: () => void;
  readonly onOpenSettings: () => void;
  readonly children: ReactNode;
}

/**
 * 聚焦编码工作台浮层：无损承载 T3 Code 原生的 ChatView、DiffPanel、终端、PRs、Issues 与 Workflows。
 * 保持 children 始终挂载，从海岛切回工位 0ms 秒开且不丢失任何草稿或终端会话。
 */
export function WorldWorkspaceOverlay({
  visible,
  activeProjectKey,
  stations,
  projects,
  onReturnToIsland,
  onOpenProjects,
  onOpenUsage,
  onOpenSettings,
  children,
}: WorldWorkspaceOverlayProps) {
  const gt = useGT();
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const fullscreen = useWorld3DStore((state) => state.workspaceFullscreen);
  const toggleFullscreen = useWorld3DStore((state) => state.toggleWorkspaceFullscreen);

  const activeProject =
    (activeProjectKey ? projects.find((p) => p.key === activeProjectKey) : null) ??
    projects[0] ??
    null;
  // 顶栏优先展示当前项目内的所有会话，方便在项目工位内快速切换对话
  const projectStations = activeProject
    ? stations.filter((st) => st.projectKey === activeProject.key)
    : stations;
  const quickStations = (projectStations.length > 0 ? projectStations : stations).slice(0, 6);
  const defaultProject = activeProject;

  return (
    <div
      className={`fixed inset-0 z-30 flex items-center justify-center transition-all duration-200 ${
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none invisible opacity-0"
      } ${fullscreen ? "p-0" : "bg-black/28 p-3 backdrop-blur-xs sm:p-5"}`}
      inert={!visible}
      onClick={(e) => {
        if (!fullscreen && e.target === e.currentTarget) {
          onReturnToIsland();
        }
      }}
    >
      <div
        className={`flex flex-col overflow-hidden border border-border/80 bg-background/97 shadow-2xl transition-all duration-200 ${
          fullscreen
            ? "h-full w-full rounded-none border-0"
            : "h-[min(92dvh,940px)] w-[min(96vw,1460px)] rounded-3xl"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-card/85 px-3 py-2 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={onReturnToIsland}
              aria-label={gt("Return to 3D Island (Esc)")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-bold text-success transition hover:bg-success/25"
            >
              <PalmtreeIcon className="size-3.5" />
              <span>
                <T>Back to Island</T>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenProjects}
              aria-label={gt("All Projects & Threads")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <FolderKanbanIcon className="size-3.5" />
              <span className="hidden md:inline">
                <T>Projects</T>
              </span>
            </button>

            {defaultProject ? (
              <button
                type="button"
                onClick={() => void handleNewThread(defaultProject.projectRef)}
                aria-label={gt("New Thread")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
              >
                <MessageSquarePlusIcon className="size-3.5" />
              </button>
            ) : null}

            <span className="mx-1 h-4 w-px shrink-0 bg-border" />

            {quickStations.map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(st.threadRef),
                  })
                }
                aria-label={`${st.projectName} · ${st.title}`}
                className={`inline-flex max-w-48 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  st.isActive
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    st.status === "running" || st.status === "waiting" ? "animate-pulse" : ""
                  }`}
                  style={{ backgroundColor: statusAccentColor(st.status) }}
                />
                <span className="truncate">{st.title}</span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpenUsage}
              aria-label={gt("Usage & Limits")}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ActivityIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={gt("Settings")}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <SettingsIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? gt("Windowed desk view") : gt("Fullscreen desk view")}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {fullscreen ? (
                <Minimize2Icon className="size-4" />
              ) : (
                <Maximize2Icon className="size-4" />
              )}
            </button>
          </div>
        </header>

        {/* transform-gpu 建立包含块，让 ChatView/RightPanel 内置的 fixed 控件自动贴合圆角工作台右上角 */}
        <div className="relative flex min-h-0 flex-1 transform-gpu flex-col overflow-hidden [&_[data-slot=sidebar-inset]]:h-full! [&_[data-slot=sidebar-inset]]:min-h-0!">
          {children}
        </div>
      </div>
    </div>
  );
}
