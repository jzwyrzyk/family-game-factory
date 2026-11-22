export type GameId = 'gum' | 'buckets' | 'dragon' | 'hill' | 'moon' | 'robot' | 'factory' | 'mining';
export type Difficulty = 'gentle' | 'classic' | 'stretch';
export type Mechanics = Record<string, number | boolean>;
export interface Mechanic {
  key: string; label: string; type: 'number' | 'boolean';
  default: number | boolean; min?: number; max?: number; step?: number;
}
export interface Manifest {
  version: 1; id: GameId; name: string; mechanics: readonly Mechanic[];
}
export interface RoundResult { won: boolean; level: number; title: string; description: string }
export interface PlayOutcome extends RoundResult {
  game: GameId; durationMs: number; config: Mechanics; at: string;
}
export interface GameInstance {
  next(): void; restart(): void; retry?(): void; unmount(): void;
  /** Optional safe checkpoint contract. Only an actively playing game may pause. */
  isPlaying?(): boolean; pause?(): boolean; resume?(): void;
  snapshot?(): Record<string, unknown>;
}
export interface GameContext {
  /** Trusted host binding to one immutable private drawing rig. Never a URL. */
  drawingRigId?: string | null;
  persistence?: {load():unknown;save(state:unknown):boolean};
  difficulty: Difficulty; config: Mechanics; finish(result: RoundResult): void;
  /** Local gameplay events for coordinated learning/coaching; never a network request. */
  emit?(event: { type: 'checkpoint' | 'mechanic' | 'pause' | 'resume'; name: string; value?: number }): void;
}
export interface GamePlugin {
  manifest: Manifest;
  mount(target: HTMLElement, context: GameContext): GameInstance;
}
export interface GameLifecycle {
  start(): void; next(): void; retry(): void; dispose(): void;
  isPlaying(): boolean; pause(): boolean; resume(): void;
  snapshot(): { config: Mechanics; state: Record<string, unknown>; disposed: boolean };
}
