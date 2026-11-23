import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  CheckIcon,
  MonitorIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  SunIcon,
  XIcon,
} from "lucide-react";

import type { ThemePreferenceMode } from "../themePalette";
import type { WorldSkinId } from "./types";
import { WORLD_SKIN_OPTIONS } from "./worldSkins";

interface WorldSkinsDrawerProps {
  readonly open: boolean;
  readonly activeSkinId: WorldSkinId;
  readonly appearanceMode: ThemePreferenceMode;
  readonly onSelectSkin: (themePreference: string) => void;
  readonly onSelectAppearanceMode: (mode: ThemePreferenceMode) => void;
  readonly onClose: () => void;
}

function skinTitle(id: WorldSkinId, gt: ReturnType<typeof useGT>): string {
  switch (id) {
    case "ocean":
      return gt("Sunny Coral Island");
    case "grove":
      return gt("Matcha Forest Cottage");
    case "ember":
      return gt("Sunset Bay Villa");
    case "iris":
      return gt("Starlight Lavender Isle");
    case "t3-chat":
      return gt("Peach Blossom Studio");
  }
}

function skinDescription(id: WorldSkinId, gt: ReturnType<typeof useGT>): string {
  switch (id) {
    case "ocean":
      return gt("Cream cottage, turquoise sea & warm sandy pier");
    case "grove":
      return gt("Mossy meadow, cherry blossoms & jade lagoon");
    case "ember":
      return gt("Golden hour glow, warm timber & lantern deck");
    case "iris":
      return gt("Soft lilac studio, dreamy waters & twilight sky");
    case "t3-chat":
      return gt("Pastel rose accents, mint pool & cozy petals");
  }
}

/**
 * 皮肤装潢抽屉：选择不同皮肤即刻重绘整个 3D 房间家具、海面、草地、树木与昼夜光照，并同步 T3 Code 主题系统。
 */
export function WorldSkinsDrawer({
  open,
  activeSkinId,
  appearanceMode,
  onSelectSkin,
  onSelectAppearanceMode,
  onClose,
}: WorldSkinsDrawerProps) {
  const gt = useGT();
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-xl outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">
              <T>World Skins & Island Decor</T>
            </h2>
            <p className="text-xs text-muted-foreground">
              <T>Every theme transforms the cottage, island foliage, ocean, and UI together.</T>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={gt("Close world skins")}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          {/* 昼夜模式选择 */}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              <T>Time of Day (Appearance)</T>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { mode: "light", label: gt("Daytime"), icon: SunIcon },
                  { mode: "dark", label: gt("Starry Night"), icon: MoonIcon },
                  { mode: "system", label: gt("Auto"), icon: MonitorIcon },
                ] as const
              ).map((entry) => {
                const Icon = entry.icon;
                const active = appearanceMode === entry.mode;
                return (
                  <button
                    key={entry.mode}
                    type="button"
                    onClick={() => onSelectAppearanceMode(entry.mode)}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/70 bg-card/60 text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span>{entry.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5 套海岛装潢皮肤 */}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              <T>Room & Island Decor Theme</T>
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {WORLD_SKIN_OPTIONS.map((skin) => {
                const selected = skin.id === activeSkinId;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => onSelectSkin(skin.themePreference)}
                    className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                      selected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border/70 bg-card/50 hover:border-border hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex shrink-0 -space-x-1.5 pt-0.5">
                      <span
                        className="size-5 rounded-full border-2 border-background shadow-xs"
                        style={{ backgroundColor: skin.swatchPrimary }}
                      />
                      <span
                        className="size-5 rounded-full border-2 border-background shadow-xs"
                        style={{ backgroundColor: skin.swatchSecondary }}
                      />
                      <span
                        className="size-5 rounded-full border-2 border-background shadow-xs"
                        style={{ backgroundColor: skin.swatchAccent }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-foreground">
                          {skinTitle(skin.id, gt)}
                        </p>
                        {selected ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {skinDescription(skin.id, gt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 高级皮肤编辑器直达 */}
          <div className="flex justify-end border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                void navigate({ to: "/settings/appearance" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              <SlidersHorizontalIcon className="size-3.5" />
              <T>Open Full Theme Studio</T>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
