const BGM_VOLUME_KEY = "arttle_bgm_volume";
const SE_VOLUME_KEY = "arttle_se_volume";
const DEFAULT_BGM_VOLUME = 0.25;
const DEFAULT_SE_VOLUME = 0.35;

class SoundManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmPath: string | null = null;
  private _bgmVolume: number = DEFAULT_BGM_VOLUME;
  private _seVolume: number = DEFAULT_SE_VOLUME;
  private initialized = false;

  private init() {
    if (this.initialized) return;
    this.initialized = true;
    if (typeof window === "undefined") return;
    const savedBgm = localStorage.getItem(BGM_VOLUME_KEY);
    const savedSe = localStorage.getItem(SE_VOLUME_KEY);
    if (savedBgm !== null) this._bgmVolume = parseFloat(savedBgm);
    if (savedSe !== null) this._seVolume = parseFloat(savedSe);
  }

  playBgm(path: string) {
    this.init();
    if (typeof window === "undefined") return;
    if (this.bgmPath === path && this.bgmAudio && !this.bgmAudio.paused) return;
    this.stopBgm();
    const audio = new Audio(path);
    audio.loop = true;
    audio.volume = this._bgmVolume;
    this.bgmAudio = audio;
    this.bgmPath = path;
    audio.play().catch(() => {
      // Autoplay policy: browser may block until user interaction.
      // The BGM will remain queued and can be retried on next user action.
    });
  }

  stopBgm() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
    this.bgmPath = null;
  }

  playSe(path: string) {
    this.init();
    if (typeof window === "undefined") return;
    const audio = new Audio(path);
    audio.volume = this._seVolume;
    audio.play().catch(() => {});
  }

  setBgmVolume(v: number) {
    this.init();
    this._bgmVolume = Math.max(0, Math.min(1, v));
    if (typeof window !== "undefined") {
      localStorage.setItem(BGM_VOLUME_KEY, String(this._bgmVolume));
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this._bgmVolume;
    }
  }

  setSeVolume(v: number) {
    this.init();
    this._seVolume = Math.max(0, Math.min(1, v));
    if (typeof window !== "undefined") {
      localStorage.setItem(SE_VOLUME_KEY, String(this._seVolume));
    }
  }

  getBgmVolume(): number {
    this.init();
    return this._bgmVolume;
  }

  getSeVolume(): number {
    this.init();
    return this._seVolume;
  }
}

export const soundManager = new SoundManager();
