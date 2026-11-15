import type { PlayRecord, Revision } from './workspace';
export type CoachPhase = 'idle' | 'reflection' | 'hypothesis' | 'ready';
export class DesignCoach {
  phase: CoachPhase = 'idle';
  summary = 'Play a version to collect your own evidence.';
  hypothesis = '';
  playId: string | null = null;
  observe(play: PlayRecord, revision: Revision) {
    this.playId=play.id;this.phase='reflection';this.hypothesis='';
    const outcome=play.outcome;
    this.summary=`You ${outcome.won?'won':'got splashed or lost'} level ${outcome.level} after ${(outcome.durationMs/1000).toFixed(1)} seconds of play.`;
    if (revision.hypothesis) this.summary+=` You predicted: “${revision.hypothesis}”. This is one play, not proof.`;
  }
  question():string {return this.phase==='reflection'?'What did you notice in that play?':this.phase==='hypothesis'?'What do you think your next change will do?':'';}
  answer(text:string) {if(this.phase==='reflection')this.phase='hypothesis';else if(this.phase==='hypothesis'){this.hypothesis=text.trim().slice(0,300);this.phase='ready';}}
  skip() {this.phase='ready';this.hypothesis='';}
  reset() {this.phase='idle';this.playId=null;this.hypothesis='';this.summary='Play a version to collect your own evidence.';}
}
