import {
  CREATION_LIMITS, CREATION_TICK_MS, validateCreationProject,
  type ComparisonOperator, type CreationBlock, type CreationProject,
  type CreationOrigin, type SceneActor, type SceneCondition, type SceneProgram,
} from './model';

export type SceneStatus = 'idle' | 'running' | 'paused' | 'completed' | 'limit';
export interface ActorSnapshot extends SceneActor {
  size: number; visible: boolean; rotation: number; jumpOffset: number; speech: string | null;
}
export interface SceneTraceEntry {
  sequence: number; timeMs: number;
  type: 'start' | 'action' | 'complete' | 'event' | 'tap' | 'limit' | 'interrupt';
  actorId?: string; programId?: string; blockId?: string;
  actionType?: CreationBlock['type']; origin?: CreationOrigin;
  x?: number; y?: number; value?: number; name?: string; text?: string;
}
export interface SceneSnapshot {
  timeMs: number; status: SceneStatus; actors: ActorSnapshot[];
  variables: Record<string, number>; trace: SceneTraceEntry[];
  activeBlockIds: string[]; executedInstructions: number; eventsDispatched: number;
  reason?: string;
}
export interface SceneEngineOptions {
  maxInstructions?: number; maxEvents?: number; maxDurationMs?: number;
}
type TimedBlock = Extract<CreationBlock, {type: 'move' | 'wait' | 'say' | 'dance' | 'jump'}>;
interface ActiveAction {
  block: TimedBlock; startedAt: number; duration: number;
  fromX: number; fromY: number; toX: number; toY: number;
}
interface Frame {
  actions: CreationBlock[]; index: number; remaining: number; owner?: CreationBlock;
}
interface Thread {program: SceneProgram; stack: Frame[]; active?: ActiveAction}
type PendingEvent = {type: 'start'} | {type: 'tap'; actorId: string} | {type: 'event'; name: string};

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function boundedOption(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error('Creation Lab: invalid execution budget.');
  return value;
}
function compare(left: number, operator: ComparisonOperator, right: number): boolean {
  switch (operator) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
    case 'gt': return left > right;
    case 'gte': return left >= right;
  }
}

/**
 * A fixed-clock interpreter for the trusted Creation Lab data language.
 * Actors run concurrently. A new trigger replaces that actor's running program;
 * it never stacks competing movement writers. Event handlers dispatch in the
 * authored program order. No browser clocks, randomness, network or eval occur here.
 */
export class SceneEngine {
  private readonly definition: CreationProject;
  private readonly limits: Required<SceneEngineOptions>;
  private actors: ActorSnapshot[] = [];
  private variables: Record<string, number> = {};
  private threads = new Map<string, Thread>();
  private queue: PendingEvent[] = [];
  private trace: SceneTraceEntry[] = [];
  private timeMs = 0;
  private remainderMs = 0;
  private started = false;
  private paused = false;
  private reason: string | undefined;
  private instructions = 0;
  private eventCount = 0;

  constructor(project: CreationProject, options: SceneEngineOptions = {}) {
    this.definition = validateCreationProject(project);
    this.limits = {
      maxInstructions: boundedOption(options.maxInstructions, CREATION_LIMITS.instructions),
      maxEvents: boundedOption(options.maxEvents, CREATION_LIMITS.events),
      maxDurationMs: boundedOption(options.maxDurationMs, CREATION_LIMITS.runDurationMs),
    };
    this.reset();
  }

  get project(): CreationProject { return copy(this.definition); }

  reset(): SceneSnapshot {
    this.actors = this.definition.actors.map(actor => ({...actor,
      size: actor.size ?? 72, visible: actor.visible ?? true,
      rotation: 0, jumpOffset: 0, speech: null,
    }));
    this.variables = {...this.definition.variables};
    this.threads.clear(); this.queue = []; this.trace = [];
    this.timeMs = 0; this.remainderMs = 0; this.started = false;
    this.paused = false; this.reason = undefined; this.instructions = 0; this.eventCount = 0;
    return this.snapshot();
  }

  /** Start is an intentional restart from the project's saved initial state. */
  start(): SceneSnapshot {
    this.reset(); this.started = true;
    this.record({type: 'start'});
    this.queue.push({type: 'start'});
    this.settle();
    return this.snapshot();
  }

  pause(): SceneSnapshot { if (this.started && !this.reason) this.paused = true; return this.snapshot(); }
  resume(): SceneSnapshot { this.paused = false; return this.snapshot(); }

  /** Advances real playback; a paused scene does not process time or queued taps. */
  advance(milliseconds: number): SceneSnapshot {
    this.checkDelta(milliseconds);
    if (this.paused) return this.snapshot();
    return this.advanceClock(milliseconds);
  }

  /** A deliberate step works while paused and preserves the paused state. */
  step(milliseconds = 50): SceneSnapshot {
    this.checkDelta(milliseconds);
    return this.advanceClock(milliseconds);
  }

  tap(actorId: string): SceneSnapshot {
    const actor = this.actors.find(item => item.id === actorId);
    if (!actor) throw new Error('Creation Lab: choose a character in this scene.');
    if (this.reason || !actor.visible) return this.snapshot();
    if (!this.started) this.started = true;
    this.record({type: 'tap', actorId, x: actor.x, y: actor.y});
    // Do not accumulate taps while paused: resume must not replay stale input.
    if (this.paused) return this.snapshot();
    if (!this.enqueue({type: 'tap', actorId})) return this.snapshot();
    this.settle();
    return this.snapshot();
  }

  snapshot(): SceneSnapshot {
    const status: SceneStatus = this.reason ? 'limit' : !this.started ? 'idle'
      : this.paused ? 'paused' : this.threads.size || this.queue.length ? 'running' : 'completed';
    return {
      timeMs: this.timeMs, status, actors: copy(this.actors), variables: {...this.variables},
      trace: copy(this.trace),
      activeBlockIds: [...this.threads.values()].flatMap(thread => thread.active ? [thread.active.block.id] : []),
      executedInstructions: this.instructions, eventsDispatched: this.eventCount,
      ...(this.reason ? {reason: this.reason} : {}),
    };
  }

  private checkDelta(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > CREATION_LIMITS.runDurationMs)
      throw new Error('Creation Lab: invalid playback duration.');
  }

  private advanceClock(milliseconds: number): SceneSnapshot {
    if (this.reason || !this.started) return this.snapshot();
    this.remainderMs += milliseconds;
    while (this.remainderMs + 1e-9 >= CREATION_TICK_MS && !this.reason) {
      if (this.timeMs + CREATION_TICK_MS > this.limits.maxDurationMs) {
        this.stopAtLimit('This run reached its time limit. Reset the scene to run it again.'); break;
      }
      this.remainderMs = Math.max(0, this.remainderMs - CREATION_TICK_MS);
      this.timeMs += CREATION_TICK_MS;
      for (const thread of [...this.threads.values()]) {
        if (!thread.active || this.threads.get(thread.program.actorId) !== thread) continue;
        this.updateAction(thread);
      }
      this.settle();
    }
    return this.snapshot();
  }

  /** Drain only instantaneous work. Instruction and event budgets bound all loops. */
  private settle(): void {
    while (!this.reason) {
      let work = false;
      while (this.queue.length && !this.reason) {
        this.dispatch(this.queue.shift()!); work = true;
      }
      for (const thread of [...this.threads.values()]) {
        if (this.reason) break;
        if (this.threads.get(thread.program.actorId) !== thread || thread.active) continue;
        this.runUntilTimed(thread); work = true;
      }
      if (!this.queue.length && (!work || [...this.threads.values()].every(thread => !!thread.active))) break;
      if (!this.queue.length && !this.threads.size) break;
    }
  }

  private enqueue(event: PendingEvent): boolean {
    if (this.queue.length >= CREATION_LIMITS.programs) {
      this.stopAtLimit('Too many events are waiting. Try fewer messages at once.'); return false;
    }
    this.queue.push(event); return true;
  }

  private dispatch(event: PendingEvent): void {
    if (++this.eventCount > this.limits.maxEvents) {
      this.stopAtLimit('The event limit stopped a repeating message loop.'); return;
    }
    if (event.type === 'event') this.record({type: 'event', name: event.name});
    for (const program of this.definition.programs) {
      const matches = event.type === 'start' ? program.trigger.type === 'start'
        : event.type === 'tap' ? program.trigger.type === 'tap' && program.actorId === event.actorId
        : program.trigger.type === 'event' && program.trigger.name === event.name;
      if (!matches) continue;
      const previous = this.threads.get(program.actorId);
      if (previous) {
        this.clearEffects(previous);
        this.record({type: 'interrupt', actorId: program.actorId, programId: previous.program.id});
      }
      this.threads.set(program.actorId, {program,
        stack: [{actions: program.actions, index: 0, remaining: 1}],
      });
    }
  }

  private runUntilTimed(thread: Thread): void {
    while (!thread.active && !this.reason && this.threads.get(thread.program.actorId) === thread) {
      const frame = thread.stack.at(-1);
      if (!frame) { this.threads.delete(thread.program.actorId); break; }
      if (frame.index >= frame.actions.length) {
        if (frame.remaining > 1 && frame.actions.length) { frame.remaining--; frame.index = 0; }
        else { thread.stack.pop(); if (frame.owner) this.recordBlock('complete', thread, frame.owner); }
        continue;
      }
      const block = frame.actions[frame.index++];
      if (++this.instructions > this.limits.maxInstructions) {
        this.stopAtLimit('The block limit stopped this run. Try a shorter sequence or fewer repeats.'); break;
      }
      this.recordBlock('action', thread, block);
      const actor = this.actor(thread.program.actorId);
      switch (block.type) {
        case 'move': case 'wait': case 'say': case 'dance': case 'jump': {
          const duration = block.type === 'move' ? block.durationMs ?? 500 : block.durationMs;
          const toX = block.type === 'move' ? block.x ?? actor.x + (block.dx ?? 0) : actor.x;
          const toY = block.type === 'move' ? block.y ?? actor.y + (block.dy ?? 0) : actor.y;
          if (![toX,toY].every(value => Number.isFinite(value) && Math.abs(value) <= 1000000)) {
            this.stopAtLimit('A character moved beyond the supported range.'); break;
          }
          thread.active = {block, startedAt: this.timeMs, duration, fromX: actor.x, fromY: actor.y, toX, toY};
          if (block.type === 'say') actor.speech = block.text;
          if (duration === 0) this.updateAction(thread);
          break;
        }
        case 'show': actor.visible = true; this.recordBlock('complete', thread, block); break;
        case 'hide': actor.visible = false; this.recordBlock('complete', thread, block); break;
        case 'repeat':
          if (block.count && block.actions.length) thread.stack.push({actions: block.actions, index: 0, remaining: block.count, owner: block});
          else this.recordBlock('complete', thread, block);
          break;
        case 'if': {
          const branch = this.evaluate(block.condition, actor) ? block.then : block.else ?? [];
          thread.stack.push({actions: branch, index: 0, remaining: 1, owner: block}); break;
        }
        case 'set': case 'change': {
          const value = block.type === 'set' ? block.value : this.variables[block.variable] + block.amount;
          if (!Number.isFinite(value) || Math.abs(value) > 1000000) {
            this.stopAtLimit('A variable grew beyond the supported range.'); break;
          }
          this.variables[block.variable] = value;
          this.recordBlock('complete', thread, block, {name: block.variable, value}); break;
        }
        case 'emit':
          this.enqueue({type: 'event', name: block.name});
          this.recordBlock('complete', thread, block, {name: block.name});
          // Dispatch messages before running this actor's next instruction, so
          // receivers and sender have a stable, inspectable event order.
          return;
      }
    }
  }

  private updateAction(thread: Thread): void {
    const action = thread.active;
    if (!action) return;
    const actor = this.actor(thread.program.actorId);
    const progress = action.duration === 0 ? 1 : Math.min(1, (this.timeMs - action.startedAt) / action.duration);
    switch (action.block.type) {
      case 'move':
        actor.x = action.fromX + (action.toX - action.fromX) * progress;
        actor.y = action.fromY + (action.toY - action.fromY) * progress; break;
      case 'dance': actor.rotation = Math.sin(progress * Math.PI * 8) * 18; break;
      case 'jump': actor.jumpOffset = -Math.sin(progress * Math.PI) * action.block.height; break;
      case 'say': case 'wait': break;
    }
    if (progress >= 1) {
      this.clearEffects(thread);
      this.recordBlock('complete', thread, action.block);
      thread.active = undefined;
    }
  }

  private clearEffects(thread: Thread): void {
    const actor = this.actor(thread.program.actorId);
    if (thread.active?.block.type === 'say') actor.speech = null;
    if (thread.active?.block.type === 'dance') actor.rotation = 0;
    if (thread.active?.block.type === 'jump') actor.jumpOffset = 0;
  }

  private evaluate(condition: SceneCondition, actor: ActorSnapshot): boolean {
    switch (condition.type) {
      case 'variable': return compare(this.variables[condition.variable], condition.operator, condition.value);
      case 'position': return compare(actor[condition.axis], condition.operator, condition.value);
      case 'touching': {
        const other = this.actor(condition.actorId);
        return actor.id !== other.id && actor.visible && other.visible
          && Math.hypot(actor.x - other.x, actor.y + actor.jumpOffset - other.y - other.jumpOffset) <= (actor.size + other.size) / 2;
      }
    }
  }

  private actor(id: string): ActorSnapshot { return this.actors.find(actor => actor.id === id)!; }

  private recordBlock(type: 'action' | 'complete', thread: Thread, block: CreationBlock,
    extra: Partial<SceneTraceEntry> = {}): void {
    const actor = this.actor(thread.program.actorId);
    this.record({type, actorId: actor.id, programId: thread.program.id, blockId: block.id,
      actionType: block.type, x: actor.x, y: actor.y,
      ...(block.origin ? {origin: block.origin} : {}),
      ...(block.type === 'say' ? {text: block.text} : {}), ...extra,
    });
  }

  private record(entry: Omit<SceneTraceEntry, 'sequence' | 'timeMs'>): void {
    if (this.trace.length >= CREATION_LIMITS.trace) {
      this.stopAtLimit('This run reached its observation limit.'); return;
    }
    this.trace.push({sequence: this.trace.length, timeMs: this.timeMs, ...entry});
  }

  private stopAtLimit(reason: string): void {
    if (this.reason) return;
    this.reason = reason;
    for (const thread of this.threads.values()) this.clearEffects(thread);
    this.threads.clear(); this.queue = [];
    if (this.trace.length < CREATION_LIMITS.trace) this.trace.push({sequence: this.trace.length,
      timeMs: this.timeMs, type: 'limit', text: reason});
  }
}

export function createSceneEngine(project: CreationProject, options?: SceneEngineOptions): SceneEngine {
  return new SceneEngine(project, options);
}

export interface SceneRunOptions extends SceneEngineOptions {
  durationMs?: number; stepMs?: number;
  inputs?: {timeMs: number; type: 'tap'; actorId: string}[];
}
/** Reproducible, bounded observational run for challenges and engineering tests. */
export function runScene(project: CreationProject, options: SceneRunOptions = {}): SceneSnapshot {
  const duration = options.durationMs ?? 10000;
  const step = options.stepMs ?? 50;
  if (!Number.isInteger(duration) || duration < 0 || duration > CREATION_LIMITS.runDurationMs
    || !Number.isInteger(step) || step < CREATION_TICK_MS || step > 1000)
    throw new Error('Creation Lab: invalid observation window.');
  const inputs = [...(options.inputs ?? [])];
  if (inputs.length > CREATION_LIMITS.events || inputs.some(input => input.type !== 'tap'
    || !Number.isInteger(input.timeMs) || input.timeMs < 0 || input.timeMs > duration
    || !project.actors.some(actor => actor.id === input.actorId)))
    throw new Error('Creation Lab: invalid observation input.');
  inputs.sort((a,b) => a.timeMs - b.timeMs);
  const engine = new SceneEngine(project, options);
  engine.start(); let elapsed = 0; let index = 0;
  while (elapsed <= duration) {
    while (index < inputs.length && inputs[index].timeMs === elapsed) engine.tap(inputs[index++].actorId);
    if (elapsed === duration || engine.snapshot().status === 'limit') break;
    const nextInput = inputs[index]?.timeMs ?? duration;
    const delta = Math.min(step, duration - elapsed, nextInput - elapsed);
    engine.step(delta); elapsed += delta;
  }
  return engine.snapshot();
}
