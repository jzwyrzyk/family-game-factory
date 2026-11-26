import {mountMindYourJems} from '../games/mind-your-jems';
export function open(root:HTMLElement,home:()=>void){
 const game=mountMindYourJems(root,{onExit:home,onLevelComplete:level=>(window as any).FG.store.recordGame('mining',true,level)});
 return ()=>game.dispose();
}
