import {mountMindYourJems} from './mind-your-jems';
import type {GameContext,GameInstance} from '../runtime/types';
import './mind-your-jems-native.css';

/** The same illustrated game uses the ordinary trusted host for navigation and
 * learning. Its bucket score stays local and does not award lifetime jems. */
export default class NativeMining implements GameInstance {
  private root:HTMLElement;
  private game:ReturnType<typeof mountMindYourJems>;
  private abort=new AbortController();
  constructor(target:HTMLElement,context:GameContext){
    this.root=document.createElement('section');
    this.root.className='myj-arcade native-mining';
    this.root.setAttribute('aria-label','Mind Your Jems');
    target.replaceChildren(this.root);
    this.game=mountMindYourJems(this.root,{
      onLevelComplete:level=>context.emit?.({type:'mechanic',name:'mining-level',value:level})
    });
    this.root.querySelector<HTMLElement>('.myj-stage')!.dataset.gameEntryFocus='';
    // More, profile choices and other host controls are outside the game. Keep
    // its hazard clock still while the child reads them; returning to the game
    // requires the visible Keep playing action, so closing a menu is never a
    // surprise unpause. The learning host retains its own pause/resume lease.
    const pauseOutside=(event:Event)=>{
      if(event.target instanceof Node&&!this.root.contains(event.target)&&
        (this.game.isPlaying()||this.root.dataset.assets!=='ready'))this.game.pause();
    };
    document.addEventListener('focusin',pauseOutside,{signal:this.abort.signal});
    document.addEventListener('pointerdown',pauseOutside,{capture:true,signal:this.abort.signal});
  }
  next(){this.game.restart();}
  restart(){this.game.restart();}
  isPlaying(){return this.game.isPlaying();}
  pause(){if(!this.game.isPlaying())return false;this.game.pause();return true;}
  resume(){this.game.resume();}
  snapshot(){return {...this.game.snapshot()};}
  unmount(){this.abort.abort();this.game.dispose();this.root.remove();}
}
