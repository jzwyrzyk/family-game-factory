import type {DurableRecord} from './record-contract';

/** Data copies are a separate permission from local play and paid generation. */
export const storageDomains=['profiles','games','creative','learning','artwork','conversation','rewards','notifications','backups'] as const;
export type StorageDomain=typeof storageDomains[number];
const collections:Record<StorageDomain,readonly string[]>={
 profiles:['profiles'],games:['games','native-projects','native-revisions','native-configs','native-plays'],
 creative:['creation-projects','creation-revisions','creation-drafts','coding-projects'],
 learning:['math','language','learning-math','learning-language','learning-computational','problem-solving'],
 artwork:['artwork','artwork-originals','artwork-rigs'],
 conversation:['studio-sessions','studio-chapters','studio-preferences'],
 rewards:['rewards','pals'],notifications:['notifications'],backups:['recovery-chunks','recovery-points']
};
export function storageDomain(collection:string):StorageDomain {
 if(/^native-history:[a-zA-Z0-9][a-zA-Z0-9:_-]{0,140}$/.test(collection))return 'games';
 const domain=storageDomains.find(d=>collections[d].includes(collection));
 if(!domain)throw Error('STORAGE_DOMAIN_DENIED');return domain;
}
export function requiredStorageDomains(collection:string):readonly StorageDomain[]{
 const domain=storageDomain(collection);
 // Existing recovery chunks are opaque exact snapshots. They may contain every
 // source domain: a backup grant cannot serve as a consent escape hatch.
 if(domain==='backups')return storageDomains;
 // Legacy envelopes retain embedded originals and provenance. Narrow labels
 // cannot authorize their nested data; grant the known source-domain union.
 if(domain==='profiles')return ['profiles','learning','rewards'];
 if(domain==='games')return ['games','artwork','conversation'];
 if(domain==='creative')return ['creative','artwork','learning','rewards'];
 if(domain==='conversation')return ['conversation','games','artwork','learning','rewards'];
 return [domain];
}
export interface ChangePage {version:1;after:string;through:string;records:DurableRecord[];hasMore:boolean}
export function sequence(value:unknown):number {
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('STORAGE_CURSOR_INVALID');return Number(value);
}
