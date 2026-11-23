/**
 * 轻量 Web Audio API 合成的治愈系微音效（零外部音频资产依赖）。
 * 浏览器未解锁音频上下文或用户静音时静默跳过，绝不抛出异常。
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume().catch(() => undefined);
  }
  return sharedAudioCtx;
}

function playTone(
  frequency: number,
  durationSec: number,
  options: {
    readonly type?: OscillatorType;
    readonly gain?: number;
    readonly delaySec?: number;
    readonly slideTo?: number;
  } = {},
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + (options.delaySec ?? 0);
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(frequency, now);
  if (options.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(options.slideTo, now + durationSec);
  }
  const peak = options.gain ?? 0.08;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/** 交互轻快木琴点击音 */
export function playInteractChime(enabled: boolean) {
  if (!enabled) return;
  playTone(587.33, 0.11, { type: "triangle", gain: 0.07 });
  playTone(880, 0.14, { type: "sine", gain: 0.06, delaySec: 0.05 });
}

/** 轻快可爱的动森风起跳弹音 */
export function playJumpSound(enabled: boolean) {
  if (!enabled) return;
  playTone(320, 0.13, { type: "sine", gain: 0.07, slideTo: 620 });
}

/** 甩杆落水或下水扑通音 */
export function playSplashSound(enabled: boolean) {
  if (!enabled) return;
  playTone(340, 0.14, { type: "sine", gain: 0.07, slideTo: 130 });
  playTone(520, 0.12, { type: "triangle", gain: 0.04, delaySec: 0.06, slideTo: 240 });
}

/** 鱼儿咬钩叮咚提醒音 */
export function playFishBiteAlert(enabled: boolean) {
  if (!enabled) return;
  playTone(784, 0.1, { type: "triangle", gain: 0.1 });
  playTone(1046.5, 0.14, { type: "triangle", gain: 0.1, delaySec: 0.09 });
  playTone(1318.5, 0.18, { type: "sine", gain: 0.08, delaySec: 0.18 });
}

/** 钓到大鱼的和弦欢呼音 */
export function playFishCaughtFanfare(enabled: boolean) {
  if (!enabled) return;
  playTone(523.25, 0.14, { type: "triangle", gain: 0.08, delaySec: 0 });
  playTone(659.25, 0.14, { type: "triangle", gain: 0.08, delaySec: 0.09 });
  playTone(783.99, 0.16, { type: "triangle", gain: 0.09, delaySec: 0.18 });
  playTone(1046.5, 0.32, { type: "sine", gain: 0.1, delaySec: 0.27 });
}

/** 区分紧急审批与普通完工音高，方便玩家不看屏幕即可分辨优先级 */
export function playAgentNotificationChime(enabled: boolean, urgent: boolean) {
  if (!enabled) return;
  if (urgent) {
    playTone(698.46, 0.16, { type: "triangle", gain: 0.09 });
    playTone(932.33, 0.22, { type: "sine", gain: 0.09, delaySec: 0.11 });
    return;
  }
  playTone(659.25, 0.18, { type: "sine", gain: 0.065 });
  playTone(987.77, 0.24, { type: "sine", gain: 0.065, delaySec: 0.1 });
}
