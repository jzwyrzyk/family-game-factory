/** Ephemeral manipulatives. Only the host's deliberate submit handler can record an answer. */
export interface MathModelOptions {
  submit(value: string): void;
  isLocked(): boolean;
  signal: AbortSignal;
}
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string) {
  const element = document.createElement(tag);
  element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
export function action(label: string, run: () => void, key = label) {
  const b = node('button', 'model-action', label);
  b.type = 'button';
  b.dataset.modelKey = key;
  b.onclick = run;
  return b;
}
export function graphic<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) {
  const shape = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [name,value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
  return shape;
}
export function group(name: string) {
  const wrapper = node('div','model-control-group');
  wrapper.setAttribute('role','group');
  wrapper.setAttribute('aria-label',name);
  return wrapper;
}
export function stepper(name: string, value: number, min: number, max: number, change: (value: number) => void) {
  const wrapper = group(name);
  const minus = action('−',()=>change(value-1),'less-'+name);
  const plus = action('+',()=>change(value+1),'more-'+name);
  minus.setAttribute('aria-label','Decrease '+name);
  plus.setAttribute('aria-label','Increase '+name);
  minus.disabled = value<=min;
  plus.disabled = value>=max;
  const label = node('span','model-step-label',name);
  const output = node('span','model-step-value',String(value));
  wrapper.classList.add('model-stepper');
  wrapper.append(label,minus,output,plus);
  return {wrapper,minus,plus};
}
export interface ModelView<S> {
  panel: HTMLElement;
  state: S;
  update(next: S): void;
  options: MathModelOptions;
}
export function model<S>(container: HTMLElement, options: MathModelOptions, name: string, initial: S, draw: (view: ModelView<S>) => void, answer?: (state: S)=>string | undefined) {
  const section=node('section','math-model'), panel=node('div','model-stage');
  section.setAttribute('aria-label',name);
  const tools=node('div','model-tools'), title=node('h3','model-title',name);
  const undo=action('Undo',()=>{
    if(!history.length || options.isLocked())return;
    state=history.pop()!;
    render();
  });
  const clear=action('Start over',()=>update(initial));
  const submit=action('Check answer',()=>{
    const value=answer?.(state);
    if(value!==undefined && !options.isLocked())options.submit(value);
  });
  submit.classList.add('math-primary');
  submit.dataset.action='check-interaction';
  const history:S[]=[];
  let state=initial;
  function update(next:S){
    if(options.isLocked() || options.signal.aborted || JSON.stringify(next)===JSON.stringify(state))return;
    if(history.length===100)history.shift();
    history.push(state);
    state=next;
    render();
  }
  function render(){
    const active = panel.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.modelKey : undefined;
    panel.replaceChildren();
    draw({panel,state,update,options});
    undo.disabled=!history.length;
    clear.disabled=JSON.stringify(initial)===JSON.stringify(state);
    if(answer)submit.disabled=answer(state)===undefined;
    if(active){
      const next=Array.from(panel.querySelectorAll<HTMLElement>('[data-model-key]')).find(n=>n.dataset.modelKey===active&&!n.matches(':disabled'));
      next?.focus({preventScroll:true});
    }
  }
  tools.append(undo,clear);
  if(answer)tools.append(submit);
  section.append(title,panel,tools);
  container.append(section);
  render();
  return section;
}
/** A tap is the equivalent for a drag. Only a release on a different identified cell is moved. */
export function moves(panel: HTMLElement, move: (from: string,to: string)=>void) {
  panel.onpointerdown=e=>{
    const source=(e.target as Element).closest<HTMLElement>('[data-piece]');
    if(!source || e.button!==0)return;
    const x=e.clientX,y=e.clientY;
    const id=e.pointerId;
    source.setPointerCapture?.(id);
    source.onpointerup=event=>{
      if(event.pointerId!==id)return;
      source.onpointerup=null;
      if(Math.hypot(event.clientX-x,event.clientY-y)<8)return;
      // Pointer capture sends the synthesized click to the source even after an
      // invalid drop. Keep a rejected move from becoming a tap-to-remove.
      const suppress=(click:MouseEvent)=>{
        if(click.detail>0){click.preventDefault();click.stopImmediatePropagation();}
      };
      source.addEventListener('click',suppress,{capture:true,once:true});
      source.addEventListener('pointerdown',()=>source.removeEventListener('click',suppress,true),{once:true});
      const destination=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-place-at]');
      if(!destination || !panel.contains(destination))return;
      move(source.dataset.piece!,destination.dataset.placeAt!);
    };
    source.onpointercancel=()=>{source.onpointerup=null;};
  };
}
