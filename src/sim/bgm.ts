// Per-map background music. Ragassets serves a map→track table at bgm/index.json
// ({ maps: { "<mapname>": "<NN.mp3>" } }) and the audio files at bgm/<NN.mp3>.
// We keep a single looping <audio> element and only swap its source when the
// track actually changes — many adjacent maps share the same BGM, so a switch
// between them shouldn't restart the music. A mute toggle (persisted in
// localStorage) lets the player silence it.
//
// Autoplay: browsers block sound until the page has been interacted with. The
// sim is opened by a click, which grants sticky activation, so play() normally
// succeeds; any rejection is swallowed and the next setMap/unmute retries.

const MUTE_KEY = "sim.bgm.muted";
const VOLUME = 0.35; // RO BGMs are loud; keep it in the background

export class BgmPlayer {
  private audio: HTMLAudioElement;
  private table: Record<string, string> = {};
  private desiredMap = ""; // the map we want playing (remembered until the table arrives)
  private current = ""; // the track file currently loaded into the element
  private muted: boolean;

  constructor(private root: string) {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = VOLUME;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
  }

  /** Supply (or replace) the map→track table, then re-resolve the current map. */
  setTable(table: Record<string, string>): void {
    this.table = table;
    if (this.desiredMap) this.setMap(this.desiredMap);
  }

  /** Play the BGM for `map`. No-op restart if it resolves to the same track. */
  setMap(map: string): void {
    this.desiredMap = map;
    const file = this.table[map];
    if (!file) {
      // Unknown map (or table not loaded yet) — keep whatever was playing rather
      // than cutting to silence; once the table arrives setTable re-resolves.
      return;
    }
    if (file !== this.current) {
      this.current = file;
      this.audio.src = this.root + file;
    }
    this.play();
  }

  private play(): void {
    if (this.muted || !this.current) return;
    void this.audio.play().catch(() => {
      /* autoplay blocked — a later setMap/unmute (post-gesture) will retry */
    });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Flip mute, persist it, and start/stop playback. Returns the new state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.muted) this.audio.pause();
    else this.play();
    return this.muted;
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load(); // abort any in-flight network fetch for the track
  }
}
