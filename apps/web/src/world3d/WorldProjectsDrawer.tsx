import { useNavigate } from "@tanstack/react-router";
import { T, useGT, Var } from "gt-react";
import {
  ArchiveIcon,
  CalendarClockIcon,
  FolderPlusIcon,
  GitBranchIcon,
  ListTodoIcon,
  MessageSquarePlusIcon,
  SearchIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { buildThreadRouteParams } from "../threadRoutes";
import { statusAccentColor } from "./sceneTextures";
import type { WorldProjectSummary, WorldThreadStation, WorldThreadVisualStatus } from "./types";

function threadStatusLabel(status: WorldThreadVisualStatus, gt: ReturnType<typeof useGT>): string {
  switch (status) {
    case "running":
      return gt("Working");
    case "waiting":
      return gt("Needs input");
    case "completed":
      return gt("Done");
    case "error":
      return gt("Error");
    default:
      return gt("Idle");
  }
}

interface WorldProjectsDrawerProps {
  readonly open: boolean;
  readonly projects: ReadonlyArray<WorldProjectSummary>;
  readonly stations: ReadonlyArray<WorldThreadStation>;
  readonly onClose: () => void;
  readonly onOpenWorkspace: () => void;
}

/**
 * 项目书架 & 公告板抽屉：提供全部项目、对话切换、新建线程、添加项目、PR、Issues、Workflows 与定时任务入口。
 */
export function WorldProjectsDrawer({
  open,
  projects,
  stations,
  onClose,
  onOpenWorkspace,
}: WorldProjectsDrawerProps) {
  const gt = useGT();
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (!open) return null;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredStations = stations.filter((st) => {
    if (selectedProjectKey !== null && st.projectKey !== selectedProjectKey) return false;
    if (!trimmedQuery) return true;
    return (
      st.title.toLowerCase().includes(trimmedQuery) ||
      st.projectName.toLowerCase().includes(trimmedQuery) ||
      st.providerLabel.toLowerCase().includes(trimmedQuery)
    );
  });

  const openThread = (station: WorldThreadStation) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(station.threadRef),
    });
    onOpenWorkspace();
  };

  const createThreadInProject = (project: WorldProjectSummary) => {
    void handleNewThread(project.projectRef).then(() => {
      onOpenWorkspace();
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[min(82vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">
              <T>Island Studio · Projects & Threads</T>
            </h2>
            <p className="text-xs text-muted-foreground">
              <T>
                <Var>{projects.length}</Var> projects · <Var>{stations.length}</Var> active & recent
                threads
              </T>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openCommandPalette({ open: "add-project" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <FolderPlusIcon className="size-3.5" />
              <T>Add Project</T>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                void navigate({ href: "/pull-requests" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <GitBranchIcon className="size-3.5" />
              <T>PRs</T>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                void navigate({ href: "/issues" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <ListTodoIcon className="size-3.5" />
              <T>Issues</T>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                void navigate({ href: "/workflows" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <WorkflowIcon className="size-3.5" />
              <T>Workflows</T>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={gt("Close projects shelf")}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[260px_1fr]">
          <div className="flex min-h-0 flex-col border-b border-border/70 p-3 sm:border-r sm:border-b-0">
            <button
              type="button"
              onClick={() => setSelectedProjectKey(null)}
              className={`mb-2 flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                selectedProjectKey === null
                  ? "bg-primary/15 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span>
                <T>All Projects</T>
              </span>
              <span className="opacity-70">{stations.length}</span>
            </button>

            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {projects.map((project) => (
                <div
                  key={project.key}
                  className={`group flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition ${
                    selectedProjectKey === project.key
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-muted/80"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProjectKey(project.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.accentColor }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{project.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">{project.cwd}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => createThreadInProject(project)}
                    aria-label={gt("New thread in {name}", { name: project.name })}
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                  >
                    <MessageSquarePlusIcon className="size-3.5" />
                  </button>
                </div>
              ))}
              {projects.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  <T>No projects yet. Click Add Project to begin.</T>
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex gap-1.5 border-t border-border/70 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void navigate({ to: "/settings/archived" });
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-muted/70 px-2 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArchiveIcon className="size-3.5" />
                <T>Archived</T>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void navigate({ to: "/settings/scheduled-tasks" });
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-muted/70 px-2 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
              >
                <CalendarClockIcon className="size-3.5" />
                <T>Schedules</T>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-3 py-2">
              <SearchIcon className="size-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={gt("Filter threads by title, project, or provider…")}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {filteredStations.map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => openThread(st)}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    st.isActive
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/60 bg-card/60 hover:border-border hover:bg-muted/60"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        st.status === "running" || st.status === "waiting" ? "animate-pulse" : ""
                      }`}
                      style={{ backgroundColor: statusAccentColor(st.status) }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{st.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {st.projectName} · {st.providerLabel}
                        {st.modelLabel ? ` · ${st.modelLabel}` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase"
                    style={{
                      backgroundColor: `${statusAccentColor(st.status)}22`,
                      color: statusAccentColor(st.status),
                    }}
                  >
                    {threadStatusLabel(st.status, gt)}
                  </span>
                </button>
              ))}
              {filteredStations.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                  <p>
                    <T>No matching threads found.</T>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
