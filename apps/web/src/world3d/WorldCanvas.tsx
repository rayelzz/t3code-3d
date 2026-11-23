import { useGT } from "gt-react";
import { useEffect, useRef, useState } from "react";
import "./liquidGlass.css";
import {
  playFishBiteAlert,
  playFishCaughtFanfare,
  playInteractChime,
  playJumpSound,
  playSplashSound,
} from "./soundEffects";
import type { WorldFloatingLabel, WorldInteractable, WorldSceneSyncPayload } from "./types";
import { WorldEngine } from "./WorldEngine";
import { rollFishCatch, useWorld3DStore } from "./worldStore";

interface WorldCanvasProps {
  readonly payload: WorldSceneSyncPayload;
  readonly onOpenInteractable: (interactable: WorldInteractable) => void;
  readonly engineRef: React.RefObject<WorldEngine | null>;
}

/** 统一分发 3D 物件与液态玻璃标牌点击交互 */
function triggerWorldInteractable(
  engine: WorldEngine,
  item: WorldInteractable,
  onOpen: (interactable: WorldInteractable) => void,
) {
  const store = useWorld3DStore.getState();
  if (item.kind === "fishing-dock") {
    playSplashSound(store.soundEnabled);
    engine.triggerFishingAction();
    return;
  }
  if (item.kind === "pool-ladder") {
    playSplashSound(store.soundEnabled);
    engine.enterPoolSwim();
    return;
  }
  if (item.kind === "beach-chair") {
    playInteractChime(store.soundEnabled);
    engine.toggleBeachLounge();
    return;
  }
  playInteractChime(store.soundEnabled);
  onOpen(item);
}

/**
 * 挂载并管理 Three.js 3D 开放海岛画布，桥接世界交互、钓鱼小游戏、泳池事件与 3D 投影液态玻璃浮空标牌。
 */
export function WorldCanvas({ payload, onOpenInteractable, engineRef }: WorldCanvasProps) {
  const gt = useGT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onOpenRef = useRef(onOpenInteractable);
  const initialPayloadRef = useRef(payload);
  const [floatingLabels, setFloatingLabels] = useState<ReadonlyArray<WorldFloatingLabel>>([]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 保持外部 Three.js 回调引用与最新 React 处理器同步
  useEffect(() => {
    onOpenRef.current = onOpenInteractable;
  }, [onOpenInteractable]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 挂载 Three.js WebGL 渲染引擎并在卸载时彻底释放显存资源
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new WorldEngine(container, initialPayloadRef.current, {
      onNearbyChange: (item) => {
        useWorld3DStore.getState().setNearbyInteractable(item);
      },
      onHoverChange: (item) => {
        useWorld3DStore.getState().setHoveredInteractable(item);
      },
      onInteract: (item) => {
        triggerWorldInteractable(engine, item, onOpenRef.current);
      },
      onActivityChange: (activity) => {
        const store = useWorld3DStore.getState();
        if (activity === "swimming") {
          playSplashSound(store.soundEnabled);
        }
        store.setPlayerActivity(activity);
      },
      onFishingPhaseChange: (phase) => {
        const store = useWorld3DStore.getState();
        store.setFishingPhase(phase);
        if (phase === "biting") {
          playFishBiteAlert(store.soundEnabled);
        }
      },
      onFishCaught: () => {
        const store = useWorld3DStore.getState();
        playFishCaughtFanfare(store.soundEnabled);
        const catchRecord = rollFishCatch(Date.now(), Math.random());
        store.recordFishCatch(catchRecord);
      },
      onJump: () => {
        playJumpSound(useWorld3DStore.getState().soundEnabled);
      },
      onFirstMove: () => {
        useWorld3DStore.getState().dismissControlsHint();
      },
      onFloatingLabelsChange: (labels) => {
        setFloatingLabels(labels);
      },
    });

    engineRef.current = engine;
    const debugHost = window as Window & {
      __t3WorldDebug?: {
        getState: () => ReturnType<WorldEngine["getDebugState"]>;
        teleport: (x: number, z: number, yaw?: number) => void;
      };
    };
    debugHost.__t3WorldDebug = {
      getState: () => engine.getDebugState(),
      teleport: (x, z, yaw) => engine.teleportTo(x, z, yaw),
    };
    return () => {
      delete debugHost.__t3WorldDebug;
      engineRef.current = null;
      engine.dispose();
    };
  }, [engineRef]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 将 T3 Code 实时业务快照（线程、用量、皮肤）同步到 Three.js 场景
  useEffect(() => {
    engineRef.current?.syncData(payload);
  }, [engineRef, payload]);

  const teleportTarget = useWorld3DStore((state) => state.teleportTarget);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 响应 HUD 快捷前往按钮，将角色传送到目标地标
  useEffect(() => {
    if (!teleportTarget) return;
    engineRef.current?.teleportTo(
      teleportTarget.x,
      teleportTarget.z,
      teleportTarget.yaw,
      teleportTarget.activity,
    );
  }, [engineRef, teleportTarget]);

  const isNight = payload.skin.isNight;

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 z-0 select-none overflow-hidden"
        aria-label={gt("3D Island Coding World")}
      />

      {/* 3D 坐标实时投影的原生视网膜级液态玻璃（Liquid Glass）标牌层，漫游态自动显示，打开浮层自动隐藏 */}
      <div
        className={`pointer-events-none fixed inset-0 z-10 overflow-hidden ${
          payload.inputEnabled ? "" : "hidden"
        }`}
        aria-hidden={!payload.inputEnabled}
      >
        {floatingLabels.map((label) => (
          <button
            key={label.id}
            type="button"
            tabIndex={-1}
            ref={(el) => {
              engineRef.current?.setFloatingLabelElement(label.id, el);
            }}
            data-world3d-glass="pill"
            data-night={isNight ? "true" : "false"}
            data-project={label.isProject ? "true" : "false"}
            data-active={label.isActive ? "true" : "false"}
            data-status={label.status ?? "idle"}
            style={{ opacity: 0, pointerEvents: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onMouseEnter={() => {
              engineRef.current?.setHoveredInteractableId(label.id);
              useWorld3DStore.getState().setHoveredInteractable(label.interactable);
            }}
            onMouseLeave={() => {
              engineRef.current?.setHoveredInteractableId(null);
              useWorld3DStore.getState().setHoveredInteractable(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              const engine = engineRef.current;
              if (engine) {
                triggerWorldInteractable(engine, label.interactable, onOpenRef.current);
              }
            }}
          >
            {label.dotColor ? (
              <span
                data-world3d-glass="dot"
                className={
                  label.status === "running" || label.status === "waiting"
                    ? "animate-pulse"
                    : undefined
                }
                style={{
                  backgroundColor: label.dotColor,
                  color: label.dotColor,
                }}
              />
            ) : null}
            <span data-world3d-glass="content">
              <span data-world3d-glass="title">{label.title}</span>
              {label.subtitle ? <span data-world3d-glass="subtitle">{label.subtitle}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
