import { T, useGT, Var } from "gt-react";
import {
  ActivityIcon,
  AnchorIcon,
  BellRingIcon,
  FolderKanbanIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  Volume2Icon,
  VolumeXIcon,
  WavesIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import type { WorldInteractable, WorldUsageSnapshot } from "./types";
import { WORLD_LANDMARKS } from "./WorldEngine";
import { useWorld3DStore } from "./worldStore";

interface WorldHudProps {
  readonly activeProjectName: string;
  readonly activeThreadTitle: string;
  readonly runningCount: number;
  readonly waitingCount: number;
  readonly totalThreads: number;
  readonly isNight: boolean;
  readonly usage: WorldUsageSnapshot;
  readonly onOpenWorkspace: () => void;
  readonly onOpenProjects: () => void;
  readonly onOpenSkins: () => void;
  readonly onOpenUsage: () => void;
  readonly onOpenSettings: () => void;
  readonly onToggleDayNight: () => void;
  readonly onInteractNow: (item: WorldInteractable) => void;
  readonly onFishingAction: () => void;
  readonly onStopLeisure: () => void;
  readonly onJumpToAlertThread: () => void;
}

function fishDisplayName(speciesId: string, gt: ReturnType<typeof useGT>): string {
  switch (speciesId) {
    case "clownfish":
      return gt("Island Clownfish");
    case "sea-bass":
      return gt("Azure Sea Bass");
    case "coral-snapper":
      return gt("Coral Snapper");
    case "blue-tuna":
      return gt("Bluefin Tuna");
    case "golden-koi":
      return gt("Golden Harbor Koi");
    case "star-jellyfish":
      return gt("Starlight Jellyfish");
    case "commit-bottle":
      return gt("Message-in-a-Bottle Commit");
    case "rainbow-bugfree":
      return gt("Legendary Bug-Free Whale");
    default:
      return speciesId;
  }
}

/**
 * 3D 海岛世界的动森风轻 HUD：使用主题语义色 Token 自动随 T3 Code 皮肤联动。
 */
export function WorldHud({
  activeProjectName,
  activeThreadTitle,
  runningCount,
  waitingCount,
  totalThreads,
  isNight,
  usage,
  onOpenWorkspace,
  onOpenProjects,
  onOpenSkins,
  onOpenUsage,
  onOpenSettings,
  onToggleDayNight,
  onInteractNow,
  onFishingAction,
  onStopLeisure,
  onJumpToAlertThread,
}: WorldHudProps) {
  const gt = useGT();
  const nearby = useWorld3DStore((state) => state.nearbyInteractable);
  const hovered = useWorld3DStore((state) => state.hoveredInteractable);
  const playerActivity = useWorld3DStore((state) => state.playerActivity);
  const fishingPhase = useWorld3DStore((state) => state.fishingPhase);
  const lastCatch = useWorld3DStore((state) => state.lastCatch);
  const catches = useWorld3DStore((state) => state.catches);
  const clearLastCatch = useWorld3DStore((state) => state.clearLastCatch);
  const soundEnabled = useWorld3DStore((state) => state.soundEnabled);
  const toggleSound = useWorld3DStore((state) => state.toggleSound);
  const agentAlert = useWorld3DStore((state) => state.agentAlert);
  const setAgentAlert = useWorld3DStore((state) => state.setAgentAlert);
  const requestTeleport = useWorld3DStore((state) => state.requestTeleport);
  const controlsHintVisible = useWorld3DStore((state) => state.controlsHintVisible);
  const [catchLogOpen, setCatchLogOpen] = useState(false);

  const activePrompt = nearby ?? hovered;
  const pillSurface = "bg-card/85 text-card-foreground border-border/80 shadow-lg backdrop-blur-md";
  const btnHover = "hover:bg-accent/70 hover:text-accent-foreground active:scale-95";

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-5">
      {/* 顶部栏：左侧小岛状态与地点传送，右侧 T3 核心入口 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className={`flex items-center gap-2 rounded-full border px-3.5 py-2 ${pillSurface}`}>
            <button
              type="button"
              onClick={onOpenWorkspace}
              aria-label={gt("Open Coding Workstation (Tab)")}
              className={`flex items-center gap-2 rounded-full px-2 py-0.5 text-left transition ${btnHover}`}
            >
              <span
                className={`size-2.5 rounded-full ${
                  waitingCount > 0
                    ? "animate-ping bg-warning"
                    : runningCount > 0
                      ? "animate-pulse bg-info"
                      : "bg-success"
                }`}
              />
              <span className="max-w-44 truncate text-sm font-semibold">
                {activeProjectName || gt("T3 Code Island")}
              </span>
            </button>

            <span className="h-4 w-px bg-border" />

            <button
              type="button"
              onClick={onOpenProjects}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${btnHover}`}
            >
              <FolderKanbanIcon className="size-3.5" />
              <span>
                <T>
                  <Var>{runningCount}</Var> working · <Var>{totalThreads}</Var> threads
                </T>
              </span>
            </button>

            {waitingCount > 0 ? (
              <button
                type="button"
                onClick={onOpenProjects}
                className="flex items-center gap-1 rounded-full bg-warning px-2.5 py-0.5 text-xs font-bold text-warning-foreground shadow-sm transition hover:opacity-90"
              >
                <BellRingIcon className="size-3.5" />
                <span>
                  <T>
                    <Var>{waitingCount}</Var> waiting
                  </T>
                </span>
              </button>
            ) : null}
          </div>

          <div
            className={`inline-flex w-fit items-center gap-1 rounded-full border p-1 text-xs ${pillSurface}`}
          >
            <button
              type="button"
              onClick={() => {
                requestTeleport(
                  WORLD_LANDMARKS.desk.x,
                  WORLD_LANDMARKS.desk.z,
                  WORLD_LANDMARKS.desk.yaw,
                );
                onOpenWorkspace();
              }}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${btnHover}`}
            >
              <MonitorIcon className="size-3.5 text-info" />
              <T>Code Desk</T>
            </button>
            <button
              type="button"
              onClick={() =>
                requestTeleport(
                  WORLD_LANDMARKS.pool.x,
                  WORLD_LANDMARKS.pool.z,
                  WORLD_LANDMARKS.pool.yaw,
                  "swimming",
                )
              }
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${btnHover}`}
            >
              <WavesIcon className="size-3.5 text-primary" />
              <T>Swim</T>
            </button>
            <button
              type="button"
              onClick={() => {
                requestTeleport(
                  WORLD_LANDMARKS.dock.x,
                  WORLD_LANDMARKS.dock.z,
                  WORLD_LANDMARKS.dock.yaw,
                );
              }}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${btnHover}`}
            >
              <AnchorIcon className="size-3.5 text-warning" />
              <T>Fish Pier</T>
            </button>
            {catches.length > 0 ? (
              <button
                type="button"
                onClick={() => setCatchLogOpen((v) => !v)}
                className={`rounded-full px-2.5 py-1 font-medium transition ${btnHover}`}
              >
                🐟 {catches.length}
              </button>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className={`flex items-center gap-1 rounded-full border p-1.5 ${pillSurface}`}>
            <button
              type="button"
              onClick={onOpenUsage}
              aria-label={gt("Provider usage & limits")}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${btnHover}`}
            >
              <ActivityIcon className="size-3.5 text-success" />
              <span>
                {usage.totalCostUsd > 0 ? `$${usage.totalCostUsd.toFixed(2)}` : gt("Usage")}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSkins}
              aria-label={gt("World skins & room decor")}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${btnHover}`}
            >
              <PaletteIcon className="size-3.5 text-primary" />
              <span className="hidden sm:inline">
                <T>Skins</T>
              </span>
            </button>

            <button
              type="button"
              onClick={() => openCommandPalette()}
              aria-label={gt("Command Palette")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${btnHover}`}
            >
              <SearchIcon className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={gt("Settings")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${btnHover}`}
            >
              <SettingsIcon className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={onToggleDayNight}
              aria-label={isNight ? gt("Switch to daytime") : gt("Switch to starry night")}
              className={`rounded-full p-1.5 transition ${btnHover}`}
            >
              {isNight ? (
                <SunIcon className="size-3.5 text-warning" />
              ) : (
                <MoonIcon className="size-3.5 text-primary" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? gt("Mute island sounds") : gt("Enable island sounds")}
              className={`rounded-full p-1.5 transition ${btnHover}`}
            >
              {soundEnabled ? (
                <Volume2Icon className="size-3.5" />
              ) : (
                <VolumeXIcon className="size-3.5 opacity-60" />
              )}
            </button>
          </div>

          {agentAlert ? (
            <div
              className={`flex max-w-xs items-start gap-2.5 rounded-2xl border p-3 ${pillSurface}`}
            >
              <BellRingIcon
                className={`mt-0.5 size-4 shrink-0 ${
                  agentAlert.kind === "waiting"
                    ? "animate-bounce text-warning"
                    : agentAlert.kind === "error"
                      ? "text-destructive"
                      : "text-success"
                }`}
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-bold">
                  {agentAlert.kind === "waiting" ? (
                    <T>Agent needs your input</T>
                  ) : agentAlert.kind === "error" ? (
                    <T>Agent encountered an issue</T>
                  ) : (
                    <T>Agent finished coding</T>
                  )}
                </p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {agentAlert.projectName} · {agentAlert.threadTitle}
                </p>
                <button
                  type="button"
                  onClick={onJumpToAlertThread}
                  className="mt-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
                >
                  <T>Teleport to desk</T>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setAgentAlert(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                aria-label={gt("Dismiss alert")}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : null}

          {catchLogOpen ? (
            <div
              className={`w-76 max-w-[calc(100vw-2rem)] rounded-2xl border p-3 text-xs ${pillSurface}`}
            >
              <div className="mb-2 flex items-center justify-between font-bold">
                <span>
                  <T>Island Fishing Journal</T>
                </span>
                <button
                  type="button"
                  onClick={() => setCatchLogOpen(false)}
                  aria-label={gt("Close fishing journal")}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {catches.map((item) => (
                  <div
                    key={`${item.speciesId}-${item.caughtAt}`}
                    className="flex items-start justify-between gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5"
                  >
                    <span className="leading-snug font-medium break-words">
                      {item.emoji} {fishDisplayName(item.speciesId, gt)}
                    </span>
                    <span className="shrink-0 pt-0.5 text-muted-foreground">{item.sizeCm} cm</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部中央：钓鱼面板、走近物体交互气泡与操作指引 */}
      <div className="flex flex-col items-center gap-2.5">
        {lastCatch ? (
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-3xl border px-5 py-3 ${pillSurface}`}
          >
            <span className="text-3xl">{lastCatch.emoji}</span>
            <div>
              <p className="text-sm font-bold">
                <T>
                  You caught <Var>{fishDisplayName(lastCatch.speciesId, gt)}</Var>!
                </T>
              </p>
              <p className="text-xs text-muted-foreground">
                <T>
                  Size: <Var>{lastCatch.sizeCm}</Var> cm · Total catches:{" "}
                  <Var>{catches.length}</Var>
                </T>
              </p>
            </div>
            <button
              type="button"
              onClick={clearLastCatch}
              className={`rounded-full p-1.5 ${btnHover}`}
              aria-label={gt("Close catch card")}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ) : null}

        {playerActivity === "fishing" ? (
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-full border px-5 py-2.5 ${pillSurface}`}
          >
            <span className="text-sm font-bold">
              {fishingPhase === "biting" ? (
                <span className="animate-pulse text-warning">
                  🎣 <T>A fish is biting! Press Space or click to reel in!</T>
                </span>
              ) : fishingPhase === "waiting" || fishingPhase === "casting" ? (
                <T>Waiting quietly by the ocean…</T>
              ) : fishingPhase === "missed" ? (
                <T>It got away! Cast again?</T>
              ) : (
                <T>Ready to cast again!</T>
              )}
            </span>
            <button
              type="button"
              onClick={onFishingAction}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold shadow transition ${
                fishingPhase === "biting"
                  ? "animate-bounce bg-warning text-warning-foreground hover:opacity-90"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {fishingPhase === "biting" ? (
                <T>Reel In!</T>
              ) : fishingPhase === "waiting" || fishingPhase === "casting" ? (
                <T>Pull Line</T>
              ) : (
                <T>Cast Line</T>
              )}
            </button>
            <button
              type="button"
              onClick={onStopLeisure}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${btnHover}`}
            >
              <T>Stand Up</T>
            </button>
          </div>
        ) : playerActivity === "swimming" || playerActivity === "lounging" ? (
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold ${pillSurface}`}
          >
            <span>
              {playerActivity === "swimming" ? (
                <T>Swimming in the infinity pool · WASD to swim</T>
              ) : (
                <T>Relaxing on the beach lounge</T>
              )}
            </span>
            <button
              type="button"
              onClick={onStopLeisure}
              className="rounded-full bg-primary px-3 py-1 text-primary-foreground transition hover:opacity-90"
            >
              <T>Step Out</T>
            </button>
          </div>
        ) : activePrompt ? (
          <button
            type="button"
            onClick={() => onInteractNow(activePrompt)}
            className={`pointer-events-auto flex items-center gap-3 rounded-full border px-5 py-2.5 transition hover:scale-[1.02] active:scale-95 ${pillSurface}`}
          >
            <kbd className="rounded-lg bg-warning px-2 py-0.5 text-xs font-black text-warning-foreground shadow-sm">
              E
            </kbd>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">{activePrompt.title}</p>
              {activePrompt.subtitle ? (
                <p className="text-xs text-muted-foreground">{activePrompt.subtitle}</p>
              ) : null}
            </div>
          </button>
        ) : null}

        <div
          className={`pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-full border px-4 py-1.5 text-xs transition-opacity ${pillSurface} ${
            controlsHintVisible ? "opacity-95" : "opacity-65 hover:opacity-100"
          }`}
        >
          <span>
            <T>WASD / Arrows: Walk</T>
          </span>
          <span>·</span>
          <span>
            <T>Space: Jump</T>
          </span>
          <span>·</span>
          <span>
            <T>Drag: Orbit Camera</T>
          </span>
          <span>·</span>
          <span>
            <T>E / Click: Interact</T>
          </span>
          <span>·</span>
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="font-bold underline decoration-dotted underline-offset-2"
          >
            <T>
              Tab: Open Coding Desk (<Var>{activeThreadTitle || gt("Chat")}</Var>)
            </T>
          </button>
        </div>
      </div>
    </div>
  );
}
