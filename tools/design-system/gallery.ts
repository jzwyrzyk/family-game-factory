import {createAction} from '../../src/design-system/components/action';
import {createDashboardCard} from '../../src/design-system/components/dashboard-card';
import {createDestinationCard} from '../../src/design-system/components/destination-card';
import {createContextNavigation} from '../../src/design-system/components/context-navigation';
import {createCollectionPage} from '../../src/design-system/templates/collection';
import {hostArtworkPath} from '../../src/design-system/artwork';
import {createPalPortrait} from '../../src/pals/ui';
import {PAL_CATALOG} from '../../src/pals/catalog';
import {createIcon, ICON_NAMES} from '../../src/brand/icons';
import {containDialogFocus} from '../../src/design-system/interactions/dialog';
import './gallery.css';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
/** Review-only synthetic content; all specimens below are production exports. */
export function mountDesignSystemGallery(host: HTMLElement, navigate: (route: string) => void) {
  document.getElementById('design-system-gallery')?.remove();
  const content = node('div', '', 'ds-gallery');
  const heading = node('h1', 'Jems design system'); heading.id = 'design-system-title';
  const description = node('p', 'Production foundations and components. Synthetic examples; owner acceptance remains separate.');
  const page = createCollectionPage({title: heading, description, back: createAction({label:'My Games', onPress:()=>navigate('home')}), backLabel:'My Games'}, content);
  page.id = 'design-system-gallery'; page.setAttribute('aria-labelledby', heading.id);
  const section = (title: string, id: string) => {
    const region = node('section', '', 'ds-section'); region.id = id;
    const h = node('h2', title); h.id = id+'-title'; region.setAttribute('aria-labelledby', h.id);region.append(h);content.append(region);return region;
  };
  const navigation = node('nav', '', 'ds-index');navigation.setAttribute('aria-label','Design system sections');
  for (const [label, id] of [['Foundations','ds-foundations'],['Components','ds-components'],['Collection template','ds-template'],['Product archetypes','ds-archetypes']]) {
    const link = node('a', label);link.href='#'+id;navigation.append(link);
  }
  content.append(navigation);
  const foundations = section('Foundations', 'ds-foundations');
  foundations.append(node('p','Nunito headings · Inter text · 18px child labels · 20px instructions · 48px primary and 44px secondary touch targets.'));
  const swatches = node('div','','ds-swatches');
  for (const [label, token] of [['Heading','--jems-color-heading'],['Primary action','--jems-color-action-primary'],['Page','--jems-color-page'],['Surface','--jems-color-surface'],['Selected','--jems-color-selected-surface'],['Success','--jems-color-success'],['Warning','--jems-color-warning'],['Error','--jems-color-danger']]) {
    const sample = node('div','','ds-swatch');const chip=node('span');chip.style.background=`var(${token})`;chip.setAttribute('aria-hidden','true');sample.append(chip,node('strong',label),node('code',token));swatches.append(sample);
  }
  foundations.append(swatches);
  const spacing=node('div','','ds-spacing');
  for(let i=1;i<=8;i++){const item=node('span',String(i*4)+'px');item.style.padding=`var(--jems-space-${i})`;spacing.append(item);}foundations.append(spacing);
  foundations.append(node('p','Motion uses the shared duration token and honors reduced motion. Responsive references retain the approved 580 / 640 / 680 / 1000px layout changes. Use the review toolbar for desktop, landscape tablet, portrait tablet and phone.'));
  const components=section('Components and states','ds-components');
  const actions=node('div','','ds-row');
  for(const variant of ['primary','secondary','quiet'] as const) actions.append(createAction({label:variant==='primary'?'Keep':variant==='secondary'?'Try again':'More choices',variant,onPress:()=>{notice.textContent='Synthetic action selected. No work was saved.';}}));
  actions.append(createAction({label:'Building…',variant:'primary',disabled:true}),createAction({label:'Selected',icon:'check',onPress:()=>{}}));
  actions.lastElementChild?.setAttribute('aria-pressed','true');
  const notice=node('p','Choose an example to inspect its interaction.');notice.setAttribute('role','status');
  components.append(actions,notice,node('p','Keyboard: Tab to a control, Enter or Space to activate. Native disabled controls do not activate. Focus remains visible.'));
  const cards=node('div','','jems-world-overview');
  const pal=createDashboardCard('My Pals','Meet your companions',()=>navigate('pals'));pal.artwork.append(createPalPortrait(PAL_CATALOG[0].id));
  const ideas=createDashboardCard('My Creations','Continue a saved idea',()=>navigate('creations'));const art=node('img');art.src=hostArtworkPath('firstIdea');art.alt='';ideas.artwork.append(art);
  const notifications=createDashboardCard('Notifications','Games to try and ideas to finish',()=>navigate('notifications'));
  cards.append(pal.element,ideas.element,notifications.element);components.append(cards);
  const destinations=node('div','','jems-destinations');destinations.append(createDestinationCard('ds-art','My Art','Draw it. Make it yours.',hostArtworkPath('companionWave'),()=>navigate('art')),createDestinationCard('ds-creative','Creative Studio','Make scenes. Try ideas.',hostArtworkPath('workbench'),()=>navigate('coding')),createDestinationCard('ds-journey','My Journey','Pals, gems & your powers',hostArtworkPath('firstIdea'),()=>navigate('journey')));components.append(destinations);
  const navHost=node('div','','jems-world-page');navHost.append(createContextNavigation('Example Journey sections',[{key:'journey',label:'My Journey',onOpen:()=>navigate('journey')},{key:'pals',label:'My Pals',onOpen:()=>navigate('pals')},{key:'rewards',label:'Gems & achievements',onOpen:()=>navigate('rewards')}],'journey'));components.append(navHost);
  const dialog=node('dialog','','ds-dialog');const dialogTitle=node('h2','Example confirmation');dialogTitle.id='ds-confirm-title';dialog.setAttribute('aria-labelledby',dialogTitle.id);const dismiss=createAction({label:'Close',onPress:()=>dialog.close()});dialog.append(dialogTitle,node('p','This example does not alter a creation or profile.'),dismiss);
  const open=createAction({label:'Open dialog',onPress:()=>{dialog.showModal();dismiss.focus();}});open.id='ds-open-dialog';dialog.addEventListener('close',()=>open.focus());const releaseFocus=containDialogFocus(dialog,dismiss);components.append(open,dialog);
  const icons=node('details');icons.append(node('summary','Approved functional icons'));const iconGrid=node('div','','ds-icons');for(const name of ICON_NAMES){const label=node('span',name);label.prepend(createIcon(name));iconGrid.append(label);}icons.append(iconGrid);components.append(icons);
  const template=section('A page assembled from shared parts','ds-template');template.append(node('p','This collection uses the production page template and cards, with no page-specific stylesheet. Changing the shared header reaches Journey, Pals, Gems, Powers, My Creations, Notifications and this example.'));
  const sampleTitle=node('h2','My collection');const sampleDescription=node('p','Choose something to continue.');const sampleBody=node('div','','jems-world-overview');
  const card=createDashboardCard('A moon adventure','Synthetic saved work',()=>{notice.textContent='Synthetic collection item selected.';});sampleBody.append(card.element);
  const sample=createCollectionPage({title:sampleTitle,description:sampleDescription,back:createAction({label:'My Journey',onPress:()=>navigate('journey')}),backLabel:'My Journey'},sampleBody);sample.id='ds-collection-example';template.append(sample);
  const archetypes=section('Actual product archetypes','ds-archetypes');archetypes.append(node('p','These actions open the application, not independently styled template mockups. Only the collection template is extracted in this increment. Other archetypes retain their feature-owned implementations; Learning #218 and Creative #220 are dependent integration checkpoints.'));
  const routes=[['Illustrated destination','Home / My Art','art'],['Collection and progress','My Journey','journey'],['Creative workspace','Draw / code','coding-editor'],['Guided conversation','Invent a game','create'],['Learning activity','Math / English','math'],['Gameplay host','Native game','legacy-game'],['Grown-up experience','Parent dashboard','parent'],['Focused onboarding','Profile and grade setup','learning-setup']];
  const list=node('div','','ds-archetypes');for(const [name,label,route] of routes){const row=node('div');row.append(node('h3',name),createAction({label,onPress:()=>navigate(route)}));list.append(row);}archetypes.append(list);
  host.append(page);
  return {page, dispose(){releaseFocus();page.remove();}};
}
