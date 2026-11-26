import {installProblemSolvingPractice} from '../problem-solving/ui';
let practice:ReturnType<typeof installProblemSolvingPractice>|undefined;
export function open(_root:HTMLElement,home:()=>void){
 practice??=installProblemSolvingPractice({enter:()=>true,home});practice.open();return ()=>practice?.close();
}
