/** Local data separation for the temporary adult profile, never authentication.
 * The authenticated profile ID is set only for this tab, never restored on reload.
 */
let owner:string|null=null;
export function setAdultWorkspace(profileId:string|null){
  if(profileId!==null&&!/^adult:[a-f0-9-]{36}$/i.test(profileId))throw Error('INVALID_ADULT_PROFILE');
  owner=profileId;
}
export const adultWorkspaceId=()=>owner;
export const adultStorageKey=(key:string,profileId=owner)=>profileId?`family-game-factory-adult:${profileId}:${key}`:key;
/** A dynamic adapter lets existing local games keep their current schemas. */
export function profileStorage(storage:Storage):Storage {
  return {
    get length(){return storage.length;},
    key(index:number){return storage.key(index);},
    getItem(key:string){return storage.getItem(adultStorageKey(key));},
    setItem(key:string,value:string){storage.setItem(adultStorageKey(key),value);},
    removeItem(key:string){storage.removeItem(adultStorageKey(key));},
    clear(){throw Error('Use the current profile’s reset controls.');}
  };
}
