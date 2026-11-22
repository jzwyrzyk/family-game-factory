import {setIconLabel} from '../brand/icons';
import './art-entry.css';

interface ArtEntryOptions {
  homeAction: HTMLElement;
  libraryTools: HTMLElement;
  open(): void;
}

/** Keep each entrance on the same guarded Art Studio route. The wider menu
 * can call that route without owning a second library or upload handler. */
export function installArtEntryPoints({homeAction,libraryTools,open}:ArtEntryOptions){
  const byId=(id:string)=>document.getElementById(id)!;
  const button=(id:string,label:string,className='studio-button')=>{
    const element=document.createElement('button');
    element.id=id;element.type='button';element.className=className;
    setIconLabel(element,'edit',label);element.onclick=open;
    return element;
  };
  const home=button('studioArt','Art Studio','studio-button studio-art-entry');
  homeAction.querySelector('#studioNew')!.after(home);
  // Preserve the saved-work shortcut and its existing keyboard/test contract.
  libraryTools.prepend(button('studioArtShortcut','Art Studio'));
  byId('creationShelfImport').after(button('creationArtStudio','Art Studio','creation-button'));
  byId('page-creations').querySelector('.page-head')!.append(button('collectionArtStudio','Art Studio'));

  const picture=button('studioUseDrawing','Use my picture');
  picture.setAttribute('aria-label','Use my picture in Art Studio');
  const composer=byId('studioExtraTools'),gameHelp=byId('studioHelp');
  gameHelp.after(picture);
  return {
    setCreating(creating:boolean){
      // Creation has one optional tool section. Reuse the same guarded art
      // entrance there, preserving the callback and the current draft.
      if(creating){if(picture.parentElement!==composer)composer.prepend(picture);}
      else {
        const playMenu=byId('page-studio').classList.contains('studio-play-mode')?byId('studioMore').querySelector('.studio-more-actions'):null;
        if(playMenu){if(picture.parentElement!==playMenu)playMenu.append(picture);}
        else if(picture.parentElement!==gameHelp.parentElement)gameHelp.after(picture);
      }
    },
  };
}
