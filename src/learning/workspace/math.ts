import {isEarlyGrade} from '../grades';
import type {MathItem} from '../types';
import {arrays, blocks, counterGroups, fractions, frames, numberLine} from './math-construction';
import {shapes} from './math-geometry';
import {angles, chart, clock, coins, compose, ruler} from './math-measure';
import type {MathModelOptions} from './math-view';

const models={frames,numberLine,blocks,fractions,arrays,counterGroups,clock,coins,ruler,angles,chart,compose,shapes};
export interface MathModelPlan {kind:keyof typeof models;role:'answer'|'explore'}

/** Uses the assessed operation and its given quantities. Never choose a model or a range from the correct response. */
export function planMathModel(item: MathItem): MathModelPlan | undefined {
  const {skillId,parameters,visual,answerKind}=item;
  const op=String(parameters.operation);
  if(isEarlyGrade(item.grade))return skillId==='k-compose'?{kind:'compose',role:'explore'}:undefined;
  if(['shape-count','shape-category','parallel-pairs','symmetry'].includes(op))return {kind:'shapes',role:'explore'};
  if(op==='parity'||op==='equality')return {kind:'counterGroups',role:'explore'};
  if(skillId==='g4-angles')return {kind:'angles',role:'explore'};
  if(skillId==='g1-length'||skillId==='g2-length')return {kind:'ruler',role:'explore'};
  if(op==='clock'||op==='elapsed')return {kind:'clock',role:'explore'};
  if(op==='coins')return {kind:'coins',role:'explore'};
  if(visual?.kind==='chart'||visual?.kind==='line-plot')return {kind:'chart',role:'explore'};
  if(op==='fraction-compare')return {kind:'fractions',role:'explore'};
  if(skillId==='g3-fraction-number')return {kind:'numberLine',role:'answer'};
  if(answerKind==='fraction'||op==='equivalent-numerator')return {kind:'fractions',role:'answer'};
  if(skillId==='g1-add-10'||skillId==='g1-add-20'||op==='missing-addend')return {kind:'frames',role:'answer'};
  if(skillId==='g1-subtract-10'||skillId==='g1-subtract-20')return {kind:'numberLine',role:'answer'};
  if(['area','perimeter','missing-area-side','missing-perimeter-side','missing-factor'].includes(op))return {kind:'arrays',role:'explore'};
  if(op==='multiply'&&Number(parameters.a)<=12&&Number(parameters.b)<=12 || op==='divide'&&Number(parameters.b)<=12)return {kind:'arrays',role:'explore'};
  if(answerKind==='number'&&['add','subtract','compose','digit-value','decimal'].includes(op))return {kind:'blocks',role:'answer'};
  return undefined;
}
export function mountMathModel(container: HTMLElement, item: MathItem, plan: MathModelPlan, options: MathModelOptions) {
  models[plan.kind](container,item,options);
  const mounted=container.querySelector<HTMLElement>(':scope > .math-model:last-child');
  if(mounted)mounted.dataset.model=plan.kind;
}
