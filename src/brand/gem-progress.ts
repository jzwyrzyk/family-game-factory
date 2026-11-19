/**
 * A visual summary of saved making and testing, not a school performance score.
 * No achievements are persisted: this derives from the current player's
 * existing validated Studio notebook, never from button clicks or game points.
 */
import type { StudioSession } from '../studio/notebook';

export type GemStage = 'none' | 'rough' | 'cut' | 'polished';
type Evidence = Pick<StudioSession, 'messages' | 'experiments' | 'design'>;

export const GEM_STAGE_LABELS: Record<Exclude<GemStage, 'none'>, string> = {
 rough: 'Rough jem', cut: 'Cut jem', polished: 'Polished jem'
};

/** A cut requires a saved child observation tied to a real saved experiment. */
export function gemStage(s: Evidence, hasKeptVersion = false): GemStage {
 const authored = s.messages.some(m => m.role === 'child') ||
   !!s.design?.ideas.some(i => i.origin === 'child' && i.adopted);
 if (!authored) return 'none';
 const tests = new Set((s.experiments || []).map(e => e.id));
 const reflected = !!s.design?.observations.some(o =>
   o.source === 'child' && !!o.text.trim() && !!o.experimentId && tests.has(o.experimentId));
 if (!reflected) return 'rough';
 return hasKeptVersion ? 'polished' : 'cut';
}

export type BuilderLevel = { level: 0 | 1 | 2 | 3; name: string; description: string };
/** Highest verified making step across one owner's projects; no separate badge database. */
export function builderLevel(stages: readonly GemStage[]): BuilderLevel {
 if (stages.includes('polished')) return {level:3, name:'Gem Polisher', description:'You tested an idea, noticed what happened, and kept a version.'};
 if (stages.includes('cut')) return {level:2, name:'Gem Cutter', description:'You tested a change and shared what you noticed.'};
 if (stages.includes('rough')) return {level:1, name:'Gem Maker', description:'You started shaping an idea of your own.'};
 return {level:0, name:'Ready to create', description:'Your first idea can become a jem.'};
}
