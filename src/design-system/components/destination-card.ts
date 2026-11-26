import {createIcon} from '../../brand/icons';
import './destination-card.css';

/** Presentation only: all destinations invoke the host's existing guarded routes. */
export function createDestinationCard(id:string,title:string,description:string,src:string,open:()=>void){
 const button=document.createElement('button');button.type='button';button.id=id;button.className='jems-destination';
 const art=document.createElement('img');art.src=src;art.alt='';art.decoding='async';
 const copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('span');
 name.textContent=title;detail.textContent=description;copy.append(name,detail);button.append(art,copy,createIcon('arrow'));button.onclick=open;return button;
}

