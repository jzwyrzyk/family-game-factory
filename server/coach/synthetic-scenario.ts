import {isDeepStrictEqual} from 'node:util';
import type {CoachContext,CoachReply} from '../../src/studio/design';

export const syntheticCoachContext:CoachContext={message:'How do I play Moon Hopper?',mode:'discuss',game:'Moon Hopper',plan:{},friction:'',helpLevel:0,support:'balanced',conversation:[],observations:[],tests:[]};
export const syntheticCoachReply:CoachReply={move:'explain',text:'Tap Action three times to reach the moon gate.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],evidenceIds:[]};

export function requireSyntheticContext(context:CoachContext){
 if(!isDeepStrictEqual(context,syntheticCoachContext))throw Error('INVALID_REQUEST');
}
