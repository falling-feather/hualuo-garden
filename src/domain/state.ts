export const WEATHER_TYPES=['clear','mist','rain','snow'] as const;
export const SEASONS=['spring','summer','autumn','winter'] as const;
export type Weather = typeof WEATHER_TYPES[number];
export type Season = typeof SEASONS[number];
export type ViewMode = 'overview' | 'courtyard' | 'interior';
export interface LandmarkState { bloom: number; activity: number }
export interface StateSnapshot {
  hour: number; weather: Weather; season: Season;
  activeLandmark: string | null; playing: boolean;
  landmarks: Partial<Record<string, LandmarkState>>;
}
export class GardenState extends EventTarget {
  #ids: Set<string>;
  #state: StateSnapshot = { hour: 8.2, weather: 'clear', season: 'spring', activeLandmark: null, playing: false, landmarks: {} };
  constructor(landmarkIds: readonly string[]) { super(); this.#ids = new Set(landmarkIds); }
  snapshot(): StateSnapshot { return structuredClone(this.#state); }
  #emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }
  #requireId(id: string) {
    if (!this.#ids.has(id)) throw new RangeError('未知院落：' + id);
  }
  setTime(hour: number) {
    if (!Number.isFinite(hour) || hour < 0 || hour > 24) throw new RangeError('时间必须在 0 至 24 之间');
    const value = hour === 24 ? 0 : hour;
    if (value === this.#state.hour) return;
    this.#state.hour = value;
    this.#emit('timechange', { hour: value });
  }
  setWeather(weather: Weather) {
    if (!WEATHER_TYPES.includes(weather)) throw new RangeError('未知天气：' + weather);
    if (weather === this.#state.weather) return;
    this.#state.weather = weather;
    this.#emit('weatherchange', { weather });
  }
  setSeason(season: Season) {
    if (!SEASONS.includes(season)) throw new RangeError('未知时节：' + season);
    if (season === this.#state.season) return;
    this.#state.season = season;
    this.#emit('seasonchange', { season });
  }
  focus(id: string | null) {
    if (id !== null) this.#requireId(id);
    this.#state.activeLandmark = id;
    this.#emit('focus', { id });
  }
  setPlaying(playing: boolean) {
    if (playing === this.#state.playing) return;
    this.#state.playing = playing;
    this.#emit('playchange', { playing });
  }
  setLandmarkState(id: string, patch: Partial<LandmarkState>) {
    this.#requireId(id);
    for (const value of Object.values(patch)) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('景物状态必须在 0 至 1 之间');
    }
    const next = { bloom: 1, activity: 1, ...this.#state.landmarks[id], ...patch };
    this.#state.landmarks[id] = next;
    this.#emit('landmarkchange', { id, state: { ...next } });
  }
}
