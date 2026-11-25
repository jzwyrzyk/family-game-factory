import {installCreationStudio} from '../creation/ui';
let studio:ReturnType<typeof installCreationStudio>|undefined;
export function open(_root:HTMLElement,home:()=>void){
 studio??=installCreationStudio({enter:()=>true,home,openGame:()=>home()});studio.open();
 return ()=>studio?.close();
}
