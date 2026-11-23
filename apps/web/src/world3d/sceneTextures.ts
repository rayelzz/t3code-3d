import { msg } from "gt-react";
import { m } from "../i18n/messages";
import type {
  WorldProjectSummary,
  WorldSkinPalette,
  WorldThreadStation,
  WorldThreadVisualStatus,
  WorldUsageSnapshot,
} from "./types";

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(Math.round(tokens));
}

export function statusAccentColor(status: WorldThreadVisualStatus): string {
  switch (status) {
    case "running":
      return "#38bdf8";
    case "waiting":
      return "#fbbf24";
    case "completed":
      return "#4ade80";
    case "error":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

function statusBadgeText(status: WorldThreadVisualStatus): string {
  switch (status) {
    case "running":
      return m(msg("RUNNING"));
    case "waiting":
      return m(msg("NEEDS YOU"));
    case "completed":
      return m(msg("DONE"));
    case "error":
      return m(msg("ERROR"));
    default:
      return m(msg("READY"));
  }
}

/** 创建或重绘主办公桌超宽显示器的实时屏幕纹理（支持 HiDPI 超采样绘制，确保文字锐利清晰） */
export function renderDeskMonitorCanvas(
  canvas: HTMLCanvasElement,
  input: {
    readonly skin: WorldSkinPalette;
    readonly projectName: string;
    readonly threadTitle: string;
    readonly status: WorldThreadVisualStatus;
    readonly runningCount: number;
    readonly totalThreads: number;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = 640;
  const height = 300;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 背景底色
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#10192b");
  bgGrad.addColorStop(1, "#182640");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 顶部窗口条
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, width, 44);
  const dotColors = ["#ff6b6b", "#ffd166", "#4ade80"];
  dotColors.forEach((c, idx) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(24 + idx * 18, 22, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 17px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    truncateText(input.projectName || m(msg("T3 Code Island")), 26),
    90,
    28,
    width - 240,
  );

  // 状态胶囊
  const badgeColor = statusAccentColor(input.status);
  drawRoundedRect(ctx, width - 132, 10, 114, 24, 12);
  ctx.fillStyle = `${badgeColor}33`;
  ctx.fill();
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = badgeColor;
  ctx.font = "700 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(statusBadgeText(input.status), width - 75, 26, 100);
  ctx.textAlign = "left";

  // 左侧对话标题卡片
  drawRoundedRect(ctx, 22, 60, width - 44, 58, 12);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.fillStyle = input.skin.accentSecondary;
  ctx.font = "700 13px system-ui, -apple-system, sans-serif";
  ctx.fillText(m(msg("ACTIVE WORKSTATION")), 38, 82, width - 76);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 19px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    truncateText(input.threadTitle || m(msg("Press E to start coding")), 34),
    38,
    106,
    width - 76,
  );

  // 模拟彩色代码与输出条（左聊右 Diff 风格）
  const codeLines = [
    { w: 0.72, c: "#60a5fa" },
    { w: 0.54, c: "#a7f3d0" },
    { w: 0.84, c: "#cbd5e1" },
    { w: 0.62, c: "#fde68a" },
    { w: 0.78, c: "#93c5fd" },
    { w: 0.48, c: "#f9a8d4" },
  ];
  const leftW = width * 0.54;
  drawRoundedRect(ctx, 22, 132, leftW, height - 154, 12);
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.fill();
  codeLines.forEach((line, idx) => {
    const y = 154 + idx * 21;
    ctx.fillStyle = `${line.c}cc`;
    drawRoundedRect(ctx, 38, y, (leftW - 36) * line.w, 8, 4);
    ctx.fill();
  });

  // 右侧迷你 Diff / 活跃线程统计
  const rightX = 36 + leftW;
  const rightW = width - rightX - 22;
  drawRoundedRect(ctx, rightX, 132, rightW, height - 154, 12);
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.fill();
  ctx.fillStyle = "#4ade80";
  ctx.font = "700 13px ui-monospace, monospace";
  ctx.fillText(
    m(msg("+ {count} ACTIVE", { count: input.runningCount })),
    rightX + 14,
    160,
    rightW - 28,
  );
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 13px ui-monospace, monospace";
  ctx.fillText(
    m(msg("{count} THREADS", { count: input.totalThreads })),
    rightX + 14,
    184,
    rightW - 28,
  );

  const diffBars = [
    { c: "#4ade80", w: 0.75 },
    { c: "#4ade80", w: 0.55 },
    { c: "#f87171", w: 0.42 },
    { c: "#38bdf8", w: 0.68 },
  ];
  diffBars.forEach((bar, i) => {
    ctx.fillStyle = `${bar.c}bb`;
    drawRoundedRect(ctx, rightX + 14, 204 + i * 18, (rightW - 28) * bar.w, 8, 4);
    ctx.fill();
  });
}

/** 重绘北墙巨幕「正在 Working 的会话」粉笔黑板纹理（逻辑 1680×440，HiDPI 2x 超采样光栅化） */
export function renderWorkingBoardCanvas(
  canvas: HTMLCanvasElement,
  input: {
    readonly skin: WorldSkinPalette;
    readonly stations: ReadonlyArray<WorldThreadStation>;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = 1680;
  const height = 440;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 经典温润墨绿黑板底色 + 细腻暗角层次
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    80,
    width * 0.5,
    height * 0.5,
    width * 0.58,
  );
  bg.addColorStop(0, "#244338");
  bg.addColorStop(1, "#162b24");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 淡淡的粉笔横线装饰
  ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(40, 80);
  ctx.lineTo(width - 40, 80);
  ctx.stroke();

  const workingStations = input.stations.filter(
    (s) => s.status === "running" || s.status === "waiting",
  );
  const runningCount = workingStations.filter((s) => s.status === "running").length;
  const waitingCount = workingStations.filter((s) => s.status === "waiting").length;

  // 顶部粉笔大标题
  ctx.fillStyle = "#f4f1de";
  ctx.font = "800 40px system-ui, -apple-system, sans-serif";
  ctx.fillText(m(msg("WORKING SESSIONS")), 44, 56, width - 520);

  // 右上角实时计数粉笔胶囊
  const badgeText =
    waitingCount > 0
      ? m(
          msg("{running} WORKING · {waiting} WAITING", {
            running: runningCount,
            waiting: waitingCount,
          }),
        )
      : runningCount > 0
        ? m(msg("{count} WORKING NOW", { count: runningCount }))
        : m(msg("ALL CLEAR"));
  const badgeColor = waitingCount > 0 ? "#fbbf24" : runningCount > 0 ? "#38bdf8" : "#6ee7b7";
  drawRoundedRect(ctx, width - 446, 17, 404, 48, 24);
  ctx.fillStyle = `${badgeColor}28`;
  ctx.fill();
  ctx.strokeStyle = `${badgeColor}dd`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = badgeColor;
  ctx.font = "800 21px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(badgeText, width - 244, 48, 376);
  ctx.textAlign = "left";

  // 正在工作的会话：按数量自适应 1~3 列 × 1~3 行大字粉笔卡片（最多展示 9 条）
  if (workingStations.length > 0) {
    const shown = workingStations.slice(0, 9);
    const cols = shown.length === 1 ? 1 : shown.length === 2 ? 2 : 3;
    const rows = Math.ceil(shown.length / cols);
    const padX = 44;
    const topY = 100;
    const bottomPad = 24;
    const gapX = 24;
    const gapY = rows >= 3 ? 14 : 18;
    const cardW = (width - padX * 2 - gapX * (cols - 1)) / cols;
    const availH = height - topY - bottomPad - gapY * (rows - 1);
    const cardH = Math.min(rows === 1 ? 236 : 150, Math.floor(availH / rows));
    const offsetY = rows === 1 ? Math.floor((availH - cardH) / 2) : 0;

    const statusFontSize = rows >= 3 ? 15 : rows === 2 ? 18 : 23;
    const titleFontSize = rows >= 3 ? 22 : rows === 2 ? 28 : cols === 1 ? 40 : 32;
    const metaFontSize = rows >= 3 ? 16 : rows === 2 ? 19 : 23;
    const maxTitleChars = cols === 1 ? 46 : cols === 2 ? 30 : 22;
    const textMaxW = cardW - 60;

    shown.forEach((st, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = padX + col * (cardW + gapX);
      const y = topY + offsetY + row * (cardH + gapY);
      const accent = statusAccentColor(st.status);

      drawRoundedRect(ctx, x, y, cardW, cardH, 18);
      ctx.fillStyle = "rgba(255, 255, 255, 0.085)";
      ctx.fill();
      ctx.strokeStyle = `${accent}d8`;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // 左侧状态亮条
      drawRoundedRect(ctx, x + 16, y + 16, 10, cardH - 32, 5);
      ctx.fillStyle = accent;
      ctx.fill();

      // 状态小标签
      ctx.fillStyle = accent;
      ctx.font = `800 ${statusFontSize}px ui-monospace, monospace`;
      ctx.fillText(
        st.status === "waiting" ? m(msg("NEEDS INPUT")) : m(msg("WORKING...")),
        x + 42,
        y + Math.round(cardH * 0.3),
        textMaxW,
      );

      // 会话标题
      ctx.fillStyle = "#faf8f0";
      ctx.font = `700 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(
        truncateText(st.title, maxTitleChars),
        x + 42,
        y + Math.round(cardH * 0.61),
        textMaxW,
      );

      // 项目名 · 供应商
      ctx.fillStyle = "rgba(244, 241, 222, 0.78)";
      ctx.font = `600 ${metaFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(
        truncateText(`${st.projectName} · ${st.providerLabel}`, maxTitleChars + 6),
        x + 42,
        y + Math.round(cardH * 0.85),
        textMaxW,
      );
    });
    return;
  }

  // 当前无运行中会话时：醒目虚线空闲栏 + 下方 3 列 × 2 行（最多 6 条）近期会话大字速览
  drawRoundedRect(ctx, 44, 98, width - 88, 94, 18);
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.fill();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = "rgba(244, 241, 222, 0.36)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#a7f3d0";
  ctx.font = "800 32px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(m(msg("No active working threads right now")), width / 2, 140, width - 140);
  ctx.fillStyle = "rgba(244, 241, 222, 0.76)";
  ctx.font = "500 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    m(msg("Start a task at any project desk. Live working sessions appear here.")),
    width / 2,
    174,
    width - 140,
  );
  ctx.textAlign = "left";

  // 近期已完成会话速览（3 列 × 2 行，充分利用超宽巨幕黑板空间）
  const recent = input.stations.slice(0, 6);
  if (recent.length > 0) {
    ctx.fillStyle = "rgba(244, 241, 222, 0.62)";
    ctx.font = "700 17px ui-monospace, monospace";
    ctx.fillText(m(msg("RECENTLY UPDATED")), 48, 226, width - 96);

    const cols = 3;
    const gapX = 22;
    const gapY = 14;
    const cardW = (width - 88 - gapX * (cols - 1)) / cols;
    const cardH = 82;
    const textMaxW = cardW - 62;
    recent.forEach((st, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 44 + col * (cardW + gapX);
      const y = 240 + row * (cardH + gapY);
      const dot = statusAccentColor(st.status);

      drawRoundedRect(ctx, x, y, cardW, cardH, 14);
      ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x + 26, y + 32, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f4f1de";
      ctx.font = "700 23px system-ui, -apple-system, sans-serif";
      ctx.fillText(truncateText(st.title, 22), x + 46, y + 39, textMaxW);

      ctx.fillStyle = "rgba(244, 241, 222, 0.68)";
      ctx.font = "500 17px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        truncateText(`${st.projectName} · ${st.providerLabel}`, 28),
        x + 46,
        y + 66,
        textMaxW,
      );
    });
  }
}

/** 重绘天花板垂吊「供应商模型用量 & 限额」办公室吊牌纹理（逻辑 640×264，HiDPI 3x 超清光栅化） */
export function renderUsageWallCanvas(
  canvas: HTMLCanvasElement,
  input: {
    readonly skin: WorldSkinPalette;
    readonly usage: WorldUsageSnapshot;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = 640;
  const height = 264;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, input.skin.isNight ? "#152238" : "#1c2b42");
  grad.addColorStop(1, "#0f172a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 顶部主题色灯带
  ctx.fillStyle = input.skin.accent;
  ctx.fillRect(0, 0, width, 8);

  // 顶栏标题与总计数据
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(m(msg("USAGE & LIMITS")), 22, 43, width - 356);

  // 右上角合并统计胶囊（7D Tokens + Est Spend）
  drawRoundedRect(ctx, width - 322, 14, 300, 40, 20);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 18px ui-monospace, monospace";
  ctx.fillText(
    m(msg("{tokens} tok", { tokens: formatCompactTokens(input.usage.totalTokens) })),
    width - 304,
    40,
    126,
  );
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("·", width - 170, 40);
  ctx.fillStyle = "#4ade80";
  ctx.fillText(`$${input.usage.totalCostUsd.toFixed(2)}`, width - 148, 40, 118);

  // 4 个主要供应商用 2 列 × 2 行网格展示，远近都清晰易读
  const providers = input.usage.providers.slice(0, 4);
  if (providers.length === 0) {
    drawRoundedRect(ctx, 22, 72, width - 44, height - 92, 14);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      input.usage.isPending
        ? m(msg("Syncing provider usage..."))
        : m(msg("Click sign or press E for full Usage")),
      width / 2,
      height / 2 + 24,
      width - 80,
    );
    ctx.textAlign = "left";
    return;
  }

  const maxTokens = Math.max(1, ...providers.map((p) => p.tokens));
  const colW = (width - 60) / 2;
  const rowH = 84;

  providers.forEach((provider, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 22 + col * (colW + 16);
    const y = 68 + row * (rowH + 14);

    drawRoundedRect(ctx, x, y, colW, rowH, 12);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 19px system-ui, -apple-system, sans-serif";
    ctx.fillText(truncateText(provider.label, 12), x + 14, y + 32, colW * 0.52);

    const rightLabel =
      provider.limitRemainingPercent !== null
        ? m(msg("{percent}% left", { percent: Math.round(provider.limitRemainingPercent) }))
        : `${formatCompactTokens(provider.tokens)}`;
    ctx.fillStyle =
      provider.limitRemainingPercent !== null && provider.limitRemainingPercent <= 15
        ? "#f87171"
        : "#e2e8f0";
    ctx.font = "700 17px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(rightLabel, x + colW - 14, y + 32, colW * 0.44);
    ctx.textAlign = "left";

    // 进度条底槽
    const barW = colW - 28;
    drawRoundedRect(ctx, x + 14, y + 49, barW, 16, 8);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();

    const ratio =
      provider.limitRemainingPercent !== null
        ? Math.max(0.06, Math.min(1, provider.limitRemainingPercent / 100))
        : Math.max(0.08, Math.min(1, provider.tokens / maxTokens));
    drawRoundedRect(ctx, x + 14, y + 49, barW * ratio, 16, 8);
    ctx.fillStyle = provider.color || input.skin.accentSecondary;
    ctx.fill();
  });
}

/** 生成项目工位在 3D 液态玻璃名牌中展示的实时状态副标题 */
export function formatProjectStationSubtitle(project: WorldProjectSummary): string {
  if (project.waitingCount > 0) {
    return m(
      msg("{waiting} waiting · {total} threads", {
        waiting: project.waitingCount,
        total: project.threadCount,
      }),
    );
  }
  if (project.runningCount > 0) {
    return m(
      msg("{running} working · {total} threads", {
        running: project.runningCount,
        total: project.threadCount,
      }),
    );
  }
  if (project.threadCount > 0) {
    return m(msg("{total} threads", { total: project.threadCount }));
  }
  return m(msg("Click to start"));
}
