import test from 'node:test';
import assert from 'node:assert/strict';
import {OBJECTS, type ObjectId} from '../src/games/bubble-gum-art';
import {BLUEPRINTS, createBuild, getBlueprint, placePart, bondPart, isReady, serializeBuild, readBuild,
  TOUR_DURATION_MS, MAX_COMPLETED, type BuildState, type GumId} from '../src/games/bubble-gum-rules';
import {evaluateBuild, LAUNCH_DURATION_MS, JOURNEY_DURATION_MS, RECIPE_ROLES, ROLE_PROFILES, WORLD_JOURNEYS,
  type JourneyTier} from '../src/games/bubble-gum-journey';

function build(blueprint = 'rocket-pop', choices: Record<string,ObjectId> = {}, completed = 0, gum: GumId = 'pink') {
  let state = createBuild(completed, blueprint);
  for (const slot of getBlueprint(state).slots) {
    state = placePart(state, slot.id, choices[slot.id] || slot.accepts[0]);
    if (slot.parent) state = bondPart(state, slot.id, gum);
  }
  assert.ok(isReady(state));
  return state;
}
const weakRocket: Record<string,ObjectId> = {body:'can',nose:'cup','left-wing':'ruler','right-wing':'ruler',booster:'cup'};
const strongRocket: Record<string,ObjectId> = {body:'bottle',nose:'funnel','left-wing':'paper-wing','right-wing':'paper-wing',booster:'tube'};
const variants = (state: BuildState) => {
  let choices: Record<string,ObjectId>[] = [{}];
  for (const slot of getBlueprint(state).slots) choices = choices.flatMap(previous => slot.accepts.map(object => ({...previous,[slot.id]:object})));
  return choices;
};

test('every authored object has an explicit visible role in every recipe and prefix', () => {
  assert.equal(Object.keys(RECIPE_ROLES).length, 12);
  for (const blueprint of BLUEPRINTS) {
    const roles = RECIPE_ROLES[blueprint.id];
    assert.deepEqual(Object.keys(roles.slots).sort(), blueprint.slots.map(slot => slot.id).sort());
    assert.equal(Object.values(roles.slots).filter(role => role.core).length, 5);
    for (const slot of blueprint.slots) {
      const role = roles.slots[slot.id], profile = ROLE_PROFILES[role.role];
      assert.ok(profile.label && profile.benefit);
      for (const object of slot.accepts) {
        const value = (profile.objects as Partial<Record<ObjectId,{fit:number;detail:string}>>)[object];
        assert.ok(value, `${blueprint.id}/${slot.id}/${object} has authored role reasoning`);
        assert.ok(value.fit >= 0 && value.fit <= 100);
        assert.ok(value.detail.length > 0);
      }
    }
  }
});

test('the agreed rocket experiment has different reach and visible object explanations', () => {
  const weak = evaluateBuild(build('rocket-pop', weakRocket)), strong = evaluateBuild(build('rocket-pop', strongRocket));
  assert.equal(weak.tier, 0); assert.equal(weak.goalDistance, 28);
  assert.equal(strong.tier, 2); assert.equal(strong.goalDistance, 100);
  assert.ok(strong.score > weak.score + 50);
  assert.ok(weak.wobble > strong.wobble);
  assert.ok(strong.speed > weak.speed);
  assert.ok(weak.stops.every(stop => stop.sceneIndex <= 1), 'the local loop cannot secretly reach the stars');
  assert.deepEqual(strong.stops.map(stop => stop.sceneIndex), [0,1,2,3,4,5,6]);
  assert.ok(weak.reason.includes(OBJECTS.ruler.name));
  assert.ok(weak.reason.includes(OBJECTS.cup.name));
  assert.ok(strong.reason.includes(OBJECTS['paper-wing'].name));
  assert.ok(strong.reason.includes(OBJECTS.tube.name));
  assert.ok(weak.swap && weak.swap.improvement > 0);
});

test('every five-part recipe offers local, middle and far journeys through actual choices', () => {
  for (const blueprint of BLUEPRINTS) {
    const tiers = new Set<JourneyTier>();
    for (const choices of variants(createBuild(0, blueprint.id))) {
      const result = evaluateBuild(build(blueprint.id, choices));
      tiers.add(result.tier);
      assert.ok(result.ready);
      assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
      assert.ok(result.wobble >= 0 && result.wobble <= 1);
      assert.ok(result.speed > 0);
      assert.equal(result.findings.length, 5);
      assert.ok(result.reason.length < 140);
      assert.ok(result.suggestion.length < 125);
      assert.doesNotMatch(result.reason + result.outcome + result.suggestion, /\b(fail|failure|bad|wrong|loser|stupid)\b/i);
      assert.ok(result.stops.length >= 4 && result.stops.length <= 7);
      if (result.tier === 2) assert.deepEqual(result.stops.map(stop => stop.sceneIndex), [0,1,2,3,4,5,6]);
    }
    assert.deepEqual([...tiers].sort(), [0,1,2], `${blueprint.id} has reachable toy-engineering experiments at all three bands`);
  }
});

test('matching wings and balloons reduce visible wobble without requiring matching tray positions', () => {
  const balanced = evaluateBuild(build('rocket-pop', strongRocket));
  const mixed = evaluateBuild(build('rocket-pop', {...strongRocket,'right-wing':'ruler'}));
  const short = evaluateBuild(build('rocket-pop', {...strongRocket,'left-wing':'ruler','right-wing':'ruler'}));
  assert.equal(mixed.tier, 1);
  assert.ok(balanced.score > mixed.score && mixed.score > short.score);
  assert.ok(mixed.wobble > balanced.wobble);
  assert.match(mixed.reason, /different amounts of air/);
  assert.ok(mixed.reason.includes(OBJECTS['paper-wing'].name) && mixed.reason.includes(OBJECTS.ruler.name));
  const balloon = build('balloon-buggy', {body:'cup','left-rope':'craft-stick','left-balloon':'balloon','right-rope':'straw','right-balloon':'balloon'});
  const float = evaluateBuild(balloon);
  const breeze = evaluateBuild({...balloon,placed:{...balloon.placed,'right-balloon':'fan'}});
  assert.ok(float.score > breeze.score && float.wobble < breeze.wobble);
  assert.match(breeze.reason, /lift differently/);
  assert.ok(breeze.reason.includes(OBJECTS.balloon.name) && breeze.reason.includes(OBJECTS.fan.name));
});

test('stage results describe the chosen performance and preserve a happy local payoff', () => {
  const soft = evaluateBuild(build('kitchen-drummer', {body:'bowl',head:'teacup','left-stick':'spoon','right-stick':'brush',feet:'comb'}));
  const beat = evaluateBuild(build('kitchen-drummer', {body:'can',head:'cup','left-stick':'craft-stick','right-stick':'fork',feet:'shoe'}));
  assert.equal(soft.tier, 0); assert.equal(beat.tier, 2);
  assert.equal(soft.distanceLabel, 'cheers');
  assert.equal(soft.title, 'Playroom Boogie');
  assert.match(soft.outcome, /dance along/);
  assert.match(beat.outcome, /musical parade/);
  assert.equal(soft.stops.at(-1)?.sceneIndex, 3);
  assert.equal(beat.stops.at(-1)?.sceneIndex, 6);
});

test('later optional pieces never penalize the same core construction', () => {
  for (const blueprint of BLUEPRINTS) for (const variant of [0,1]) {
    const choices = Object.fromEntries(blueprint.slots.map(slot => [slot.id,slot.accepts[variant]]));
    let previous = evaluateBuild(build(blueprint.id, choices)).score;
    for (const completed of [3,6,9]) {
      const result = evaluateBuild(build(blueprint.id, choices, completed));
      assert.ok(result.score >= previous, `${blueprint.id}: adding a finishing piece is never an automatic penalty`);
      assert.equal(result.findings.length, getBlueprint(createBuild(completed,blueprint.id)).slots.length);
      previous = result.score;
    }
  }
});

test('every complete catalog combination remains finite through all progression prefixes', () => {
  for (const blueprint of BLUEPRINTS) for (const completed of [0,3,6,9]) {
    for (const choices of variants(createBuild(completed,blueprint.id))) {
      const result = evaluateBuild(build(blueprint.id,choices,completed));
      assert.ok(result.ready && Number.isFinite(result.score) && Number.isFinite(result.wobble) && Number.isFinite(result.speed));
      assert.ok(result.stops.every(stop => Number.isInteger(stop.sceneIndex) && stop.sceneIndex >= 0 && stop.sceneIndex <= 6));
    }
  }
});

test('a suggested improvement changes one accepted object and predicts its actual effect', () => {
  for (const blueprint of BLUEPRINTS) {
    const choices = Object.fromEntries(blueprint.slots.map(slot => [slot.id,slot.accepts[1]]));
    const state = build(blueprint.id,choices,9), result = evaluateBuild(state);
    assert.ok(result.swap);
    const {slotId,from,to,improvement} = result.swap;
    assert.equal(state.placed[slotId],from);
    assert.notEqual(from,to);
    assert.ok(getBlueprint(state).slots.find(slot => slot.id === slotId)!.accepts.includes(to));
    const changed = {...state,placed:{...state.placed,[slotId]:to}};
    assert.ok(isReady(changed));
    assert.deepEqual(changed.bonds,state.bonds,'the suggestion does not invent or consume gum');
    assert.equal(evaluateBuild(changed).score-result.score,improvement);
    assert.ok(improvement > 0, `${blueprint.id}: the deliberately mixed construction has an honest improvement`);
    assert.ok(result.suggestion.includes(OBJECTS[from].name) && result.suggestion.includes(OBJECTS[to].name));
  }
});

test('save, replay, gum color, completed count and evaluation cannot change an intact construction’s route', () => {
  const state = build('rocket-pop',strongRocket,9), before = JSON.stringify(state), expected = evaluateBuild(state);
  assert.deepEqual(evaluateBuild(readBuild(serializeBuild(state))),expected);
  assert.deepEqual(evaluateBuild({...state,tourCompleted:true,reported:true}),expected);
  assert.deepEqual(evaluateBuild({...state,completed:MAX_COMPLETED}),expected);
  for (const color of ['pink','mint','blue','gold'] as const) {
    assert.deepEqual(evaluateBuild({...state,bonds:Object.fromEntries(Object.keys(state.bonds).map(id => [id,color]))}),expected);
  }
  Object.freeze(state.placed); Object.freeze(state.bonds); Object.freeze(state);
  assert.deepEqual(evaluateBuild(state),expected);
  assert.equal(JSON.stringify(state),before);
  const copy = evaluateBuild(state);
  (copy.stops as {sceneIndex:number;caption:string}[])[0].caption = 'Changed by a caller';
  assert.deepEqual(evaluateBuild(state),expected,'caller changes cannot rewrite the authored itinerary');
});

test('partial builds are safe previews and never fabricate a finished invention', () => {
  for (const blueprint of BLUEPRINTS) {
    let state = createBuild(0,blueprint.id);
    assert.equal(evaluateBuild(state).ready,false);
    for (const slot of getBlueprint(state).slots) {
      state = placePart(state,slot.id,slot.accepts[0]);
      const placed = evaluateBuild(state);
      assert.equal(placed.ready,isReady(state));
      assert.ok(Number.isFinite(placed.score));
      if (!placed.ready) { assert.equal(placed.swap,undefined); assert.match(placed.suggestion,/next piece/); }
      if (slot.parent) state = bondPart(state,slot.id,'pink');
    }
    assert.equal(evaluateBuild(state).ready,true);
  }
});

test('all tiers preserve five seconds of launch and the full twenty-four-second journey', () => {
  assert.equal(LAUNCH_DURATION_MS,5_000);
  assert.equal(JOURNEY_DURATION_MS,TOUR_DURATION_MS);
  assert.equal(LAUNCH_DURATION_MS+JOURNEY_DURATION_MS,29_000);
  for (const world of Object.values(WORLD_JOURNEYS)) for (const [tier,stops] of world.stops.entries()) {
    assert.ok(JOURNEY_DURATION_MS/stops.length >= 3_000,'each reached place remains visible long enough to enjoy');
    assert.ok(world.titles[tier].split(/\s+/).length <= 4);
    assert.ok(stops.every(stop => stop.caption.length <= 32));
  }
  assert.equal(WORLD_JOURNEYS.sky.stops[0].at(-1)?.sceneIndex,1);
  assert.equal(WORLD_JOURNEYS.sky.stops[1].at(-1)?.sceneIndex,2);
  for (const world of Object.values(WORLD_JOURNEYS)) assert.equal(world.stops[2].at(-1)?.sceneIndex,6);
});
