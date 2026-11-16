export type GameId = 'gum' | 'buckets' | 'dragon';
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
  persistence?: {load():unknown;save(state:unknown):boolean};
  difficulty: Difficulty; config: Mechanics; finish(result: RoundResult): void;
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
