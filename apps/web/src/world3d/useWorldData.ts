import { useAtomValue } from "@effect/atom-react";
import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { makeWindow } from "@t3tools/shared/usageFormat";
import { collectLimitAccounts, remainingPercent } from "@t3tools/shared/usageLimits";
import { useGT, useLocale } from "gt-react";
import { useState } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { useTheme } from "../hooks/useTheme";
import { useShownThreadRouteTarget } from "../hooks/useShownThreadRouteTarget";
import { useProjects, useVisibleThreadShells } from "../state/entities";
import { environmentPresentations } from "../state/presentation";
import { useUsage } from "../state/usage";
import type {
  WorldProjectSummary,
  WorldProviderUsageCard,
  WorldThreadStation,
  WorldThreadVisualStatus,
  WorldUsageSnapshot,
} from "./types";
import { getWorldSkinPalette, resolveWorldSkinId } from "./worldSkins";

const PROJECT_COLORS = [
  "#38bdf8",
  "#4ade80",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f87171",
];

// Provider 品牌标识颜色与名称，供 3D 机器人与墙面统计共用
const PROVIDER_DISPLAY: Record<string, { readonly label: string; readonly color: string }> = {
  claudeAgent: { label: "Claude", color: "#d97757" },
  claude: { label: "Claude", color: "#d97757" },
  codex: { label: "Codex", color: "#38bdf8" },
  cursor: { label: "Cursor", color: "#94a3b8" },
  grok: { label: "Grok", color: "#e2e8f0" },
  opencode: { label: "OpenCode", color: "#5b9bbd" },
  antigravity: { label: "Antigravity", color: "#8c7bd1" },
  pi: { label: "Pi", color: "#4d9f8a" },
  // oxlint-disable-next-line t3code/no-untranslated-copy -- provider brand name
  muse: { label: "Muse", color: "#3b82f6" },
  kiro: { label: "Kiro", color: "#a855f7" },
};

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]!;
}

function classifyThreadStatus(thread: EnvironmentThreadShell): WorldThreadVisualStatus {
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "waiting";
  const status = thread.runtime?.status ?? thread.latestRun?.status ?? "idle";
  if (
    status === "running" ||
    status === "starting" ||
    status === "preparing" ||
    status === "queued"
  ) {
    return "running";
  }
  if (status === "waiting") return "waiting";
  if (status === "failed" || Boolean(thread.runtime?.lastError)) return "error";
  if (status === "completed") return "completed";
  return "idle";
}

function providerMetaFromKey(raw: string): { readonly label: string; readonly color: string } {
  const lower = raw.toLowerCase();
  for (const [key, meta] of Object.entries(PROVIDER_DISPLAY)) {
    if (lower.includes(key.toLowerCase())) return meta;
  }
  const clean = raw.replace(/^provider-instance:/i, "").split(":")[0] || "Agent";
  return { label: clean.slice(0, 12), color: hashColor(raw) };
}

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function threadTimestampMs(thread: EnvironmentThreadShell): number {
  return Math.max(
    parseIsoMs(thread.latestRun?.completedAt),
    parseIsoMs(thread.latestRun?.startedAt),
    parseIsoMs(thread.latestRun?.requestedAt),
    parseIsoMs(thread.latestUserMessageAt),
    parseIsoMs(thread.runtime?.updatedAt),
  );
}

/** 汇总整个 3D 世界所需的真实 T3 Code 状态（语言、项目、工位线程、供应商用量与限额、皮肤主题） */
export function useWorldData() {
  const locale = useLocale();
  const gt = useGT();
  const projects = useProjects();
  const visibleThreads = useVisibleThreadShells();
  const { shownTarget } = useShownThreadRouteTarget();
  const themeState = useTheme();
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);

  // 初始化时固定 7 天统计窗口，避免每次 render 读取 wall-clock 触发频繁重查
  const [usageWindow] = useState(() => makeWindow(7, new Date(), "day"));
  const usageView = useUsage(usageWindow);

  const projectMap = new Map<string, { name: string; cwd: string }>();
  const projectCounts = new Map<string, { total: number; running: number; waiting: number }>();

  for (const project of projects) {
    if (project.archivedAt != null) continue;
    const pKey = scopedProjectKey(scopeProjectRef(project.environmentId, project.id));
    projectMap.set(pKey, { name: project.title, cwd: project.workspaceRoot });
    projectCounts.set(pKey, { total: 0, running: 0, waiting: 0 });
  }

  const activeThreadKey =
    shownTarget?.kind === "server" ? scopedThreadKey(shownTarget.threadRef) : null;
  const draftId = shownTarget?.kind === "draft" ? shownTarget.draftId : null;
  const draftSession = useComposerDraftStore((store) =>
    draftId === null ? null : store.getDraftSession(draftId),
  );
  const draftProjectKey = draftSession
    ? scopedProjectKey(scopeProjectRef(draftSession.environmentId, draftSession.projectId))
    : null;

  const allStations: WorldThreadStation[] = [];
  for (const thread of visibleThreads) {
    if (thread.archivedAt != null) continue;
    const threadRef = scopeThreadRef(thread.environmentId, thread.id);
    const tKey = scopedThreadKey(threadRef);
    const pKey = scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
    const status = classifyThreadStatus(thread);

    const counts = projectCounts.get(pKey);
    if (counts) {
      counts.total += 1;
      if (status === "running") counts.running += 1;
      if (status === "waiting") counts.waiting += 1;
    }

    const providerKey = String(thread.providerInstanceId || "agent");
    const providerMeta = providerMetaFromKey(providerKey);

    allStations.push({
      key: tKey,
      threadRef,
      projectKey: pKey,
      projectName: projectMap.get(pKey)?.name ?? gt("Workspace"),
      title: thread.title?.trim() || gt("New thread"),
      status,
      providerDriver: providerKey,
      providerLabel: thread.runtime?.providerName || providerMeta.label,
      providerColor: providerMeta.color,
      modelLabel: thread.modelSelection?.model ?? "",
      hasPendingApproval: thread.hasPendingApprovals || thread.hasPendingUserInput,
      isActive: tKey === activeThreadKey,
      updatedAtMs: threadTimestampMs(thread),
    });
  }

  const priorityScore = (st: WorldThreadStation): number => {
    if (st.status === "waiting") return 4;
    if (st.status === "running") return 3;
    if (st.isActive) return 2;
    if (st.status === "error") return 1;
    return 0;
  };
  allStations.sort((a, b) => priorityScore(b) - priorityScore(a) || b.updatedAtMs - a.updatedAtMs);

  const activeStation =
    shownTarget?.kind === "draft"
      ? null
      : (allStations.find((st) => st.isActive) ?? allStations[0] ?? null);
  const activeProjectKey = draftProjectKey ?? activeStation?.projectKey ?? null;

  // 按项目聚合最高优先级对话与状态，且按项目固定顺序排布（保证一个项目永远占同一个工位）
  const stationsByProject = new Map<string, WorldThreadStation[]>();
  for (const st of allStations) {
    const list = stationsByProject.get(st.projectKey);
    if (list) list.push(st);
    else stationsByProject.set(st.projectKey, [st]);
  }

  const aggregateProjectStatus = (
    list: ReadonlyArray<WorldThreadStation>,
  ): WorldThreadVisualStatus => {
    if (list.some((s) => s.status === "waiting")) return "waiting";
    if (list.some((s) => s.status === "running")) return "running";
    if (list.some((s) => s.status === "error")) return "error";
    if (list.some((s) => s.status === "completed")) return "completed";
    return "idle";
  };

  const projectSummaries: WorldProjectSummary[] = projects
    .filter((p) => p.archivedAt == null)
    .map((p) => {
      const ref = scopeProjectRef(p.environmentId, p.id);
      const key = scopedProjectKey(ref);
      const counts = projectCounts.get(key) ?? { total: 0, running: 0, waiting: 0 };
      const projStations = stationsByProject.get(key) ?? [];
      const topStation = projStations[0] ?? null;
      return {
        key,
        projectRef: ref,
        environmentId: p.environmentId,
        name: p.title,
        cwd: p.workspaceRoot,
        threadCount: counts.total,
        runningCount: counts.running,
        waitingCount: counts.waiting,
        status: aggregateProjectStatus(projStations),
        latestThreadRef: topStation?.threadRef ?? null,
        latestThreadTitle: topStation?.title ?? null,
        isActive: key === activeProjectKey,
        accentColor: hashColor(key),
      };
    })
    // 按项目创建时间与名称稳定排序，防止对话活动导致房间里的项目工位乱换座位
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  const limitAccounts = collectLimitAccounts(presentations);
  const limitByDriver = new Map<string, { remaining: number; label: string }>();
  for (const account of limitAccounts) {
    const firstWindow = account.limits.windows[0];
    if (!firstWindow) continue;
    const rem = remainingPercent(firstWindow);
    const existing = limitByDriver.get(account.driver);
    if (!existing || rem < existing.remaining) {
      limitByDriver.set(account.driver, {
        remaining: rem,
        label: account.displayName ?? providerMetaFromKey(account.driver).label,
      });
    }
  }

  const providerCardsMap = new Map<string, WorldProviderUsageCard>();
  for (const pTotal of usageView.merged.providers) {
    const meta = providerMetaFromKey(pTotal.provider);
    const matchedDriver = pTotal.provider === "claude" ? "claudeAgent" : pTotal.provider;
    const limitInfo = limitByDriver.get(matchedDriver) ?? limitByDriver.get(pTotal.provider);
    providerCardsMap.set(matchedDriver, {
      id: pTotal.provider,
      driver: matchedDriver,
      label: meta.label,
      color: meta.color,
      tokens: pTotal.totalTokens,
      costUsd: pTotal.costUsd,
      limitRemainingPercent: limitInfo ? limitInfo.remaining : null,
      limitResetText: null,
      limitSummary: limitInfo ? `${limitInfo.remaining}%` : null,
    });
  }

  for (const [driver, limitInfo] of limitByDriver) {
    if (providerCardsMap.has(driver)) continue;
    const meta = providerMetaFromKey(driver);
    providerCardsMap.set(driver, {
      id: driver,
      driver,
      label: limitInfo.label,
      color: meta.color,
      tokens: 0,
      costUsd: 0,
      limitRemainingPercent: limitInfo.remaining,
      limitResetText: null,
      limitSummary: `${limitInfo.remaining}%`,
    });
  }

  const providerCards = [...providerCardsMap.values()].sort(
    (a, b) =>
      b.tokens - a.tokens || (a.limitRemainingPercent ?? 100) - (b.limitRemainingPercent ?? 100),
  );

  const connectedEnvironments = usageView.environments.filter((e) => e.isConnected).length;
  const usageSnapshot: WorldUsageSnapshot = {
    totalTokens: usageView.merged.totalTokens,
    totalCostUsd: usageView.merged.costUsd,
    connectedEnvironments,
    totalEnvironments: Math.max(1, usageView.environments.length),
    providers: providerCards,
    isPending: usageView.isPending,
  };

  const skinId = resolveWorldSkinId(themeState.theme);
  const skinPalette = getWorldSkinPalette(themeState.theme, themeState.resolvedTheme);

  const activeProjectName =
    (draftProjectKey ? projectMap.get(draftProjectKey)?.name : null) ??
    activeStation?.projectName ??
    projectSummaries[0]?.name ??
    gt("T3 Code Island");
  const activeThreadTitle =
    shownTarget?.kind === "draft" ? gt("New thread") : (activeStation?.title ?? "");
  const activeThreadStatus: WorldThreadVisualStatus =
    shownTarget?.kind === "draft" ? "idle" : (activeStation?.status ?? "idle");

  return {
    locale,
    skinId,
    skinPalette,
    themeState,
    projects: projectSummaries,
    stations: allStations,
    activeStation,
    activeProjectKey,
    activeProjectName,
    activeThreadTitle,
    activeThreadStatus,
    activeThreadKey,
    usage: usageSnapshot,
    runningCount: allStations.filter((st) => st.status === "running").length,
    waitingCount: allStations.filter((st) => st.status === "waiting").length,
  };
}
