import {mountMindYourJems,type MiningController} from './mind-your-jems';
import type {GameContext,GameInstance} from '../runtime/types';
import './mind-your-jems-native.css';

/** Shared navigation for the existing crystal-tap game. Scores remain local to
 * the round; mounting never creates a host result, reward or generated build. */
export default class NativeMining implements GameInstance {
  private root:HTMLElement;
  private game:MiningController;
  private abort=new AbortController();
  constructor(target:HTMLElement,context:GameContext){
    this.root=document.createElement('section');
    this.root.className='myj-arcade native-mining';
    this.root.setAttribute('aria-label','Mind Your Jems');
    target.replaceChildren(this.root);
    this.game=mountMindYourJems(this.root,{
      onPauseChange:paused=>context.emit?.({type:paused?'pause':'resume',name:'mining-controls'})
    });
    // Reading a host menu must not spend the warning interval. Closing that
    // menu leaves the visible Keep playing button in charge of resumption.
    const pauseOutside=(event:Event)=>{
      if(event.target instanceof Node&&!this.root.contains(event.target))this.game.pause();
    };
    document.addEventListener('focusin',pauseOutside,{signal:this.abort.signal});
    document.addEventListener('pointerdown',pauseOutside,{capture:true,signal:this.abort.signal});
  }
  next(){this.game.restart();}
  restart(){this.game.restart();}
  isPlaying(){return this.game.isPlaying();}
  pause(){return this.game.isPlaying()?this.game.pause():false;}
  resume(){this.game.resume();}
  snapshot(){return {...this.game.snapshot()};}
  unmount(){this.abort.abort();this.game.dispose();this.root.remove();}
}
