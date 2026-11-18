/** Evidence-only, parent-facing summaries. No grades, predictions or child profiling. */
export interface ParentSkill {
  id:string;title:string;grade:number;state:string;presentations:number;
  independent:number;assisted:number;distinctDays:number;
  dueAt:number|null;reviewDue:boolean;readSupport?:number;explored?:number;
  migrated?:boolean;hypotheses?:string[];
}
export interface ParentReport {
  totals:{presentations:number;independent:number;assisted:number;explored?:number};
  skills:ParentSkill[];
}
export interface ParentAttempt {
  outcome:string;independent:boolean;startedAt:number;
  completedAt?:number;finishedAt?:number;
}
type Day={key:string;date:Date;solo:number;help:number};
const el=(tag:string,className='',text='')=>{
  const node=document.createElement(tag);node.className=className;node.textContent=text;return node;
};
const keyFor=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const total=(x:{solo:number;help:number})=>x.solo+x.help;
export function summarizeParentPractice(report:ParentReport,attempts:readonly ParentAttempt[],now=Date.now()){
  const today=new Date(now);today.setHours(0,0,0,0);
  const days:Day[]=Array.from({length:14},(_,i)=>{
    const date=new Date(today);date.setDate(date.getDate()-13+i);
    return {key:keyFor(date),date,solo:0,help:0};
  });
  const lookup=new Map(days.map(day=>[day.key,day]));
  // Recent capped attempt history is a window, NOT a lifetime total.
  for(const attempt of attempts){
    if(attempt.outcome!=='completed')continue;
    const at=attempt.finishedAt??attempt.completedAt??attempt.startedAt;
    if(!Number.isFinite(at)||at>now)continue;
    const day=lookup.get(keyFor(new Date(at)));
    if(day)attempt.independent?day.solo++:day.help++;
  }
  const previous=days.slice(0,7).reduce((sum,d)=>({solo:sum.solo+d.solo,help:sum.help+d.help}),{solo:0,help:0});
  const current=days.slice(7).reduce((sum,d)=>({solo:sum.solo+d.solo,help:sum.help+d.help}),{solo:0,help:0});
  const enough=total(previous)>=5&&total(current)>=5;
  const delta=enough?Math.round(100*current.solo/total(current))-Math.round(100*previous.solo/total(previous)):null;
  return {days,previous,current,delta,enough,completed:report.totals.independent+report.totals.assisted,
    due:report.skills.filter(s=>s.reviewDue&&s.presentations>0).length,
    strengths:report.skills.filter(s=>s.presentations>0&&(s.state==='independent'||s.state==='remembered-later')).length};
}
function stat(host:HTMLElement,value:number,label:string,help:string){
  const item=el('div','pi-stat');
  item.append(el('strong','pi-stat-value',value.toLocaleString()),el('span','pi-stat-label',label),el('small','pi-stat-help',help));
  host.append(item);
}
function opportunityText(skill:ParentSkill){
  if(skill.reviewDue)return 'Ready for a short review to check what was remembered.';
  if(skill.state==='learning-with-support')return 'Recent practice involved help. Try another gentle example together.';
  if(skill.presentations>0)return 'More practice on different days will help reveal a clearer pattern.';
  return 'Not tried yet. Offer a few low-pressure practice activities.';
}
function skillCard(skill:ParentSkill){
  const card=el('article','learning-progress-card pi-skill');
  card.dataset.skillId=skill.id;card.dataset.state=skill.state;
  const top=el('div','pi-skill-top');
  top.append(el('strong','', 'Grade '+skill.grade+' · '+skill.title));
  const state=skill.state==='remembered-later'?'Remembered after a break':
    skill.state==='independent'?'Independent practice':
    skill.state==='learning-with-support'?'Learning with help':'Exploring';
  top.append(el('span','pi-state',state));
  card.append(top);
  const info=el('p','pi-skill-counts',skill.independent+' solo · '+skill.assisted+' with help · '+skill.distinctDays+' independent practice days');
  card.append(info);
  const completed=skill.independent+skill.assisted;
  if(completed){
    const meter=el('div','pi-skill-meter');meter.setAttribute('role','img');
    meter.setAttribute('aria-label',skill.independent+' independent and '+skill.assisted+' assisted successes');
    const fill=el('span','');fill.style.width=String(Math.round(skill.independent/completed*100))+'%';
    meter.append(fill);card.append(meter);
  }
  if(skill.dueAt)card.append(el('small','pi-review',skill.reviewDue?'Ready to review':'Next review after '+new Date(skill.dueAt).toLocaleDateString()));
  if(skill.readSupport)card.append(el('small','pi-review','Read-aloud used in '+skill.readSupport+' recorded activities'));
  if(skill.explored)card.append(el('small','pi-review',skill.explored+' unscored writing explorations'));
  if(skill.migrated)card.append(el('small','pi-review','Some older counts have no recorded practice date'));
  for(const hypothesis of skill.hypotheses||[])card.append(el('small','pi-review',hypothesis));
  return card;
}
export function renderParentInsights(host:HTMLElement,subject:'math'|'language',report:ParentReport,attempts:readonly ParentAttempt[],now=Date.now()){
  host.replaceChildren();
  const summary=summarizeParentPractice(report,attempts,now);
  const wrap=el('div','parent-insights');wrap.dataset.subject=subject;
  const intro=el('header','pi-intro');
  intro.append(el('h4','','Learning at a glance'),
    el('p','','What your child has practiced here — not a grade, reading diagnosis, or standardized assessment.'));
  wrap.append(intro);
  const metrics=el('section','pi-metrics');metrics.setAttribute('aria-label','Practice totals');
  stat(metrics,report.totals.presentations,'Activities offered','All recorded practice, including unfinished items');
  stat(metrics,summary.completed,'Activities solved','Independent and assisted completions');
  stat(metrics,report.totals.independent,'Solved independently','Without a hint or other recorded support');
  stat(metrics,report.totals.assisted,'Completed with help','Help is a useful part of learning');
  wrap.append(metrics);
  const timeline=el('section','pi-section');
  const heading=el('div','pi-heading');
  heading.append(el('h4','','The last 14 days'));
  heading.append(el('p','','Completed practice, by day. Only retained dated records are included.'));
  timeline.append(heading);
  const chart=el('div','pi-chart');chart.setAttribute('role','img');
  chart.setAttribute('aria-label','Daily completed activities in the past 14 days: '+summary.days.map(d=>d.key+' '+d.solo+' solo and '+d.help+' with help').join('; '));
  const max=Math.max(1,...summary.days.map(total));
  for(const day of summary.days){
    const bar=el('div','pi-day');
    const stack=el('div','pi-day-stack');stack.style.height=String(Math.max(total(day)?6:2,Math.round(100*total(day)/max)))+'%';
    if(total(day)){
      const solo=el('span','pi-day-solo');solo.style.height=String(100*day.solo/total(day))+'%';
      const help=el('span','pi-day-help');help.style.height=String(100*day.help/total(day))+'%';
      stack.append(solo,help);
    }
    bar.title=day.date.toLocaleDateString()+': '+day.solo+' independent, '+day.help+' helped';
    bar.append(stack,el('small','',day.date.toLocaleDateString(undefined,{weekday:'narrow'})));
    chart.append(bar);
  }
  timeline.append(chart);
  const legend=el('div','pi-legend');legend.append(el('span','pi-legend-solo','Independent'),el('span','pi-legend-help','With help'));
  timeline.append(legend);
  const signal=el('p','pi-signal');
  if(summary.enough){
    signal.textContent=summary.delta!>=10?'More completed practice was independent this week ('+Math.abs(summary.delta!)+' percentage points higher than last week).':
      summary.delta!<=-10?'More practice involved help this week ('+Math.abs(summary.delta!)+' percentage points lower independent share).':
      'The mix of independent and assisted work was similar across these two weeks.';
  }else signal.textContent='More completed practice across two weeks is needed before showing a trend.';
  timeline.append(signal,el('p','pi-method','Week-to-week activities may differ in difficulty. This is a descriptive trend, not proof of learning growth.'));
  wrap.append(timeline);
  const focus=el('section','pi-section');
  const focusHead=el('div','pi-heading');focusHead.append(el('h4','','What to try next'));
  focusHead.append(el('p','','Based on review timing and practice evidence — not a diagnosis.'));
  focus.append(focusHead);
  const relevant=report.skills.slice().sort((a,b)=>{
    const rank=(s:ParentSkill)=>s.reviewDue?0:s.state==='learning-with-support'&&s.presentations?1:s.presentations?2:3;
    return rank(a)-rank(b)||b.presentations-a.presentations||a.grade-b.grade;
  }).slice(0,3);
  const tiles=el('div','pi-opportunities');
  for(const skill of relevant){
    const card=el('article','pi-opportunity');
    card.append(el('strong','',skill.title),el('span','',opportunityText(skill)));
    tiles.append(card);
  }
  if(!relevant.length)tiles.append(el('p','','Choose a skill to begin collecting practice evidence.'));
  focus.append(tiles);wrap.append(focus);
  const details=el('details','pi-all-skills');
  const practiced=report.skills.filter(s=>s.presentations>0);
  details.append(el('summary','','See all skill details ('+practiced.length+' practiced)'));
  const grid=el('div','pi-skills');
  for(const skill of practiced)grid.append(skillCard(skill));
  if(!practiced.length)grid.append(el('p','','No completed learning evidence yet. Your child's first activities will appear here.'));
  details.append(grid);wrap.append(details);
  host.append(wrap);
}