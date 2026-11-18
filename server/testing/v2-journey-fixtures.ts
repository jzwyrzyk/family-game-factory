/** O7: source-allowlisted, hand-authored v2 game variants for the real
 * authenticated browser Create→Try→Edit→Compare→Keep→Return journey.
 * No paid provider or arbitrary model source is executed by this fixture.
 */
import {focusedControls} from './quality-generated-fixtures';
import type {GeneratedGame} from '../agent/generated';

export const v2FirstGame:GeneratedGame={
 ...focusedControls,
 title:'Marble Playground',
 instructions:'Press Right to move your marble. Tap the playfield to finish the round.'
};
export const v2RevisedGame:GeneratedGame={
 ...v2FirstGame,
 title:'Faster Marble Playground',
 instructions:'Your marble now moves faster when Right is held. Tap the playfield to finish.',
 source:v2FirstGame.source.replace('s.x+=180*dt','s.x+=300*dt')
};
if(v2RevisedGame.source===v2FirstGame.source)throw Error('O7_INVALID_FIXTURE_DIFF');
