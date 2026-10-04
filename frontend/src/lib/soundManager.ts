const BGM_VOLUME_KEY = "arttle_bgm_volume";
const SE_VOLUME_KEY = "arttle_se_volume";
export const DEFAULT_BGM_VOLUME = 0.08;
export const DEFAULT_SE_VOLUME = 0.12;

class SoundManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmPath: string | null = null;
  private _bgmVolume: number = DEFAULT_BGM_VOLUME;
  private _seVolume: number = DEFAULT_SE_VOLUME;
  private initialized = false;
  private readonly retryEvents = ["pointerdown", "touchstart", "keydown"] as const;
  private readonly retryBgmOnInteraction = () => {
    const audio = this.bgmAudio;
    if (!audio) return;
    audio.play().then(
      () => this.removeAutoplayRetry(),
      () => {},
    );
  };

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
    if (this.bgmPath === path && this.bgmAudio) {
      if (this.bgmAudio.paused) this.startBgmPlayback(this.bgmAudio);
      return;
    }
    this.stopBgm();
    const audio = new Audio(path);
    audio.loop = true;
    audio.volume = this._bgmVolume;
    this.bgmAudio = audio;
    this.bgmPath = path;
    this.startBgmPlayback(audio);
  }

  private startBgmPlayback(audio: HTMLAudioElement) {
    audio.play().catch(() => {
      if (this.bgmAudio === audio) this.addAutoplayRetry();
    });
  }

  private addAutoplayRetry() {
    if (typeof document === "undefined") return;
    this.retryEvents.forEach((event) => document.addEventListener(event, this.retryBgmOnInteraction));
  }

  private removeAutoplayRetry() {
    if (typeof document === "undefined") return;
    this.retryEvents.forEach((event) => document.removeEventListener(event, this.retryBgmOnInteraction));
  }

  stopBgm() {
    this.removeAutoplayRetry();
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
