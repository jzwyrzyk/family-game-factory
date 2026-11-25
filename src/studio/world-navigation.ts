import {createIcon} from '../brand/icons';

/** Presentation only: all destinations invoke the host's existing guarded routes. */
export function destinationTile(id:string,title:string,description:string,src:string,open:()=>void){
 const button=document.createElement('button');button.type='button';button.id=id;button.className='jems-destination';
 const art=document.createElement('img');art.src=src;art.alt='';art.decoding='async';
 const copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('span');
 name.textContent=title;detail.textContent=description;copy.append(name,detail);button.append(art,copy,createIcon('arrow'));button.onclick=open;return button;
}

export function installJourneySections(actions:{overview:()=>void;pals:()=>void;rewards:()=>void;powers:()=>void;scenes:()=>void;experiments:()=>void}){
 const routes=[['page-jems-journey','overview','My Journey'],['page-jems-pals','pals','My Pals'],['page-jems-rewards','rewards','Gems & achievements'],['page-lab','powers','My Powers']] as const;
 for(const [pageId,current] of routes){
  const page=document.getElementById(pageId);if(!page)continue;
  page.classList.add('jems-world-page');
  const nav=document.createElement('nav');nav.className='jems-world-nav';nav.setAttribute('aria-label','My Journey sections');
  for(const [,key,label] of routes){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.journeySection=key;if(key===current)button.setAttribute('aria-current','page');button.onclick=actions[key];nav.append(button);}
  page.prepend(nav);
 }
 const powers=document.getElementById('page-lab')!;const practice=document.createElement('section');practice.className='jems-powers-practice';practice.setAttribute('aria-label','Thinking adventures');practice.append(destinationTile('journeyScenePractice','Rebuild a scene','Try your coding powers','./jems-blocks.svg',actions.scenes),destinationTile('journeyExperimentPractice','Try an experiment','Make a guess. Try it out.','./jems-workbench.svg',actions.experiments));powers.querySelector('.page-head')?.after(practice);if(!practice.isConnected)powers.append(practice);
 const overview=document.createElement('section');overview.className='jems-world-overview';overview.setAttribute('aria-label','My gems, Pals and powers');
 const page=document.getElementById('page-jems-journey')!;
 page.querySelector('.jems-journey-hero')?.after(overview);
 if(!overview.isConnected)page.append(overview);
 // Rank details remain in the original component; disclosure does not change earned state.
 const trail=page.querySelector('.jems-journey-trail');
 if(trail){const details=document.createElement('details');details.className='jems-rank-details';const summary=document.createElement('summary');summary.textContent='Explore maker ranks';trail.before(details);details.append(summary);const heading=page.querySelector('.jems-journey-trail-heading');if(heading)details.append(heading);details.append(trail);}
 return {overview};
}
