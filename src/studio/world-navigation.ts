import {hostArtworkPath} from '../design-system/artwork';
import { createCollectionHeader as createPageHeader } from '../design-system/templates/collection';
import {createContextNavigation} from '../design-system/components/context-navigation';

export {createDestinationCard as destinationTile} from '../design-system/components/destination-card';
import {createDestinationCard as destinationTile} from '../design-system/components/destination-card';

export function installJourneySections(actions:{overview:()=>void;pals:()=>void;rewards:()=>void;powers:()=>void;scenes:()=>void;experiments:()=>void}){
 const routes=[['page-jems-journey','overview','My Journey'],['page-jems-pals','pals','My Pals'],['page-jems-rewards','rewards','Gems & achievements'],['page-lab','powers','My Powers']] as const;
 for(const [pageId,current] of routes){
  const page=document.getElementById(pageId);if(!page)continue;
  page.classList.add('jems-world-page');
  const nav=createContextNavigation('My Journey sections', routes.map(([,key,label])=>({key,label,onOpen:actions[key]})), current);
  page.prepend(nav);
 }
 const powers=document.getElementById('page-lab')!;
 const oldHeader=powers.querySelector('.page-head')!;
 const back=document.createElement('button');
 back.type='button';
 back.onclick=()=>document.getElementById('studioNavHome')?.click();
 const header=createPageHeader(powers, { title:oldHeader.querySelector('h1')!, description:oldHeader.querySelector('p')!, back, backLabel:'My Games' });
 oldHeader.replaceWith(header);
 const practice=document.createElement('section');practice.className='jems-powers-practice';practice.setAttribute('aria-label','Thinking adventures');practice.append(destinationTile('journeyScenePractice','Rebuild a scene','Try your coding powers',hostArtworkPath('blocks'),actions.scenes),destinationTile('journeyExperimentPractice','Try an experiment','Make a guess. Try it out.',hostArtworkPath('workbench'),actions.experiments));header.after(practice);
 const overview=document.createElement('section');overview.className='jems-world-overview';overview.setAttribute('aria-label','My gems, Pals and powers');
 const page=document.getElementById('page-jems-journey')!;
 page.querySelector('.jems-journey-hero')?.before(overview);
 if(!overview.isConnected)page.append(overview);
 // Rank details remain in the original component; disclosure does not change earned state.
 const trail=page.querySelector('.jems-journey-trail');
 if(trail){const details=document.createElement('details');details.className='jems-rank-details';const summary=document.createElement('summary');summary.textContent='Explore maker ranks';trail.before(details);details.append(summary);const heading=page.querySelector('.jems-journey-trail-heading');if(heading)details.append(heading);details.append(trail);}
 return {overview};
}
