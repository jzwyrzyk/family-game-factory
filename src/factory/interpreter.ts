import { diff, validateConfig } from '../runtime/manifests';
import type { GameId, Mechanics } from '../runtime/types';
export type Intent = { kind: 'supported'; config: Mechanics; summary: string } | { kind: 'generation-needed' | 'invalid' | 'unchanged'; message: string };
// Deliberately bounded local language rules, never represented as an LLM.
export function interpret(game: GameId, current: Mechanics, prompt: string): Intent {
  // Tier 2: combine up to four known local edits into one atomic experiment.
  // Unsupported or invalid clauses change nothing; never silently partially apply.
  const clauses=prompt.trim().split(/\s+(?:and|then)\s+|[,;]\s*/i).map(s=>s.trim());
  if(clauses.length>1&&clauses.length<=4&&clauses.every(Boolean)){
    let config=current;const summaries:string[]=[];
    for(const clause of clauses){
      const step=interpret(game,config,clause);
      if(step.kind!=='supported')return step;
      config=step.config;summaries.push(step.summary);
    }
    return {kind:'supported',config,summary:summaries.join(' · ')};
  }
  let text = prompt.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/^please\s+/, '').replace(/\s+please$/, '');
  const numbers: Record<string, string> = { one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10' };
  text = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, word => numbers[word]);
  const patch: Mechanics = {}; let match: RegExpMatchArray | null;
  if (game === 'buckets') {
    if ((match = text.match(/^(?:(?:give me|use|add|make it|i want) )?(\d+) buckets$/))) patch.bucketCount = Number(match[1]);
    else if (/^(?:show|reveal) (?:me )?(?:the )?safe bucket$/.test(text)) patch.revealSafe = true;
    else if (/^(?:hide|stop showing) (?:the )?safe bucket$/.test(text)) patch.revealSafe = false;
    else if ((match = text.match(/^(?:make (?:the )?splash (?:last|take)|splash for) (\d+(?:\.\d+)?) seconds?$/))) patch.splashMs = Number(match[1]) * 1000;
    else if (/^(?:make it|make the splash) faster$/.test(text)) patch.splashMs = Number(current.splashMs) - 300;
    else if (/^(?:make it|make the splash) slower$/.test(text)) patch.splashMs = Number(current.splashMs) + 300;
  } else if (game === 'gum') {
    if ((match=text.match(/^(?:give me|add|use|show) (\d+) extra stickers?$/))) patch.extraDecoys=Number(match[1]);
    else if (/^show all (?:the )?(?:stickers|sticker choices)$/.test(text)) patch.extraDecoys=2;
    else if (/^show (?:the )?basic (?:stickers|sticker choices)$/.test(text)) patch.extraDecoys=0;
    else if ((match=text.match(/^give me (\d+) gum sticks$/))) patch.gumBudget=Number(match[1]);
    else if (/^make joints stronger$/.test(text)) patch.jointStrength=Number(current.jointStrength)+.25;
    else if (/^(?:make (?:the )?)gum (?:weaker|stretchier)$/.test(text)) patch.jointStrength=Number(current.jointStrength)-.25;
    else if (/^(?:make (?:the )?)gravity (?:lower|lighter)$/.test(text)) patch.gravity=Number(current.gravity)-2;
    else if (/^(?:make (?:the )?)gravity (?:higher|stronger)$/.test(text)) patch.gravity=Number(current.gravity)+2;
    else if (/^(?:make (?:the )?)fan (?:stronger|faster)$/.test(text)) patch.thrust=Math.round((Number(current.thrust)+.1)*10)/10;
    else if (/^(?:make (?:the )?)fan (?:weaker|slower)$/.test(text)) patch.thrust=Math.round((Number(current.thrust)-.1)*10)/10;
    else if (/^(?:show|highlight) (?:the )?matching pieces$/.test(text)) patch.highlightMatches = true;
    else if (/^(?:hide|stop highlighting) (?:the )?matching pieces$/.test(text)) patch.highlightMatches = false;
    else if ((match = text.match(/^(?:add|use|give me) (\d+) extra (?:silly )?pieces$/))) patch.extraDecoys = Number(match[1]);
  } else if (game === 'hill') {
    if (/^(?:make (?:the )?)motor (?:stronger|faster)$/.test(text)) patch.enginePower=Math.round((Number(current.enginePower)+.2)*10)/10;
    else if (/^(?:make (?:the )?)motor (?:gentler|slower)$/.test(text)) patch.enginePower=Math.round((Number(current.enginePower)-.2)*10)/10;
    else if (/^(?:make (?:the )?)wheels bigger$/.test(text)) patch.wheelSize=Math.round((Number(current.wheelSize)+.05)*100)/100;
    else if (/^(?:make (?:the )?)wheels smaller$/.test(text)) patch.wheelSize=Math.round((Number(current.wheelSize)-.05)*100)/100;
    else if (/^(?:make (?:the )?)(?:springs|suspension) softer$/.test(text)) patch.suspension=Number(current.suspension)-.5;
    else if (/^(?:make (?:the )?)(?:springs|suspension) stiffer$/.test(text)) patch.suspension=Number(current.suspension)+.5;
    else if (/^(?:make (?:the )?)(?:car|body) heavier$/.test(text)) patch.chassisMass=Math.round((Number(current.chassisMass)+.2)*10)/10;
    else if (/^(?:make (?:the )?)(?:car|body) lighter$/.test(text)) patch.chassisMass=Math.round((Number(current.chassisMass)-.2)*10)/10;
  } else if(game==='dragon'){
    if ((match=text.match(/^give the island (\d+) resilience$/))) patch.groundResilience=Number(match[1]);
    else if (/^make fireballs slower$/.test(text)) patch.fireballCadence=Number(current.fireballCadence)-.25;
    else if (/^make shield wider$/.test(text)) patch.shieldRadius=Number(current.shieldRadius)+10;
    else if ((match = text.match(/^(?:(?:give me|use|i want) )?(\d+) hearts$/))) patch.hearts = Number(match[1]);
    else if (/^(?:make (?:the )?dragon breath|dragon breath) slower$/.test(text)) patch.breathSpeed = Math.round((Number(current.breathSpeed) - .2) * 100) / 100;
    else if (/^(?:make (?:the )?dragon breath|dragon breath) faster$/.test(text)) patch.breathSpeed = Math.round((Number(current.breathSpeed) + .2) * 100) / 100;
  } else if(game==='moon'){
    if((match=text.match(/^(?:give me|collect|use) (\d+) donuts?$/)))patch.donutGoal=Number(match[1]);
    else if(/^make (?:the )?(?:moon )?gravity (?:lower|lighter)$/.test(text))patch.moonGravity=Math.round((Number(current.moonGravity)-0.1)*10)/10;
    else if(/^make (?:the )?(?:moon )?gravity (?:higher|stronger)$/.test(text))patch.moonGravity=Math.round((Number(current.moonGravity)+0.1)*10)/10;
    else if(/^make meteors (?:slower|less frequent)$/.test(text))patch.meteorRate=Number(current.meteorRate)-0.25;
    else if(/^make meteors (?:faster|more frequent)$/.test(text))patch.meteorRate=Number(current.meteorRate)+0.25;
    else if(/^(?:add|turn on) (?:a |the )?(?:bounce pads?|trampolines?)$/.test(text))patch.bouncePads=true;
    else if(/^(?:remove|turn off|hide) (?:the )?(?:bounce pads?|trampolines?)$/.test(text))patch.bouncePads=false;
  } else if(game==='factory'){
    if((match=text.match(/^(?:(?:give me|use|make|pack) )?(\d+) gems?(?: (?:in |per |for )?(?:each |an? )?order)?$/)))patch.orderSize=Number(match[1]);
    else if(/^make (?:the )?cutter faster$/.test(text))patch.cutterSpeed=Number(current.cutterSpeed)+0.25;
    else if(/^make (?:the )?cutter slower$/.test(text))patch.cutterSpeed=Number(current.cutterSpeed)-0.25;
    else if(/^(?:add|show|turn on) (?:extra |more )?sparkles$/.test(text))patch.sparkleBoost=true;
    else if(/^(?:remove|hide|turn off) (?:extra )?sparkles$/.test(text))patch.sparkleBoost=false;
  } else if(game==='robot'){
    if(/^make (?:the )?robot faster$/.test(text))patch.robotSpeed=Number(current.robotSpeed)+0.25;
    else if(/^make (?:the )?robot slower$/.test(text))patch.robotSpeed=Number(current.robotSpeed)-0.25;
    else if(/^(?:show|draw) (?:my |the )?path$/.test(text))patch.showTrail=true;
    else if(/^(?:hide|remove) (?:my |the )?path$/.test(text))patch.showTrail=false;
    else if(/^(?:add|turn on) (?:a |the )?portals?$/.test(text))patch.portalEnabled=true;
    else if(/^(?:remove|turn off|hide) (?:the )?portals?$/.test(text))patch.portalEnabled=false;
  }
  if (game==='gum' && current.qualityVersion===2 && ['gumBudget','jointStrength','gravity','thrust','highlightMatches'].some(k=>k in patch)) return {kind:'invalid',message:'This sticker world is animated, not powered by physics. Try decorating the machine with different stickers, or use a physical workshop version for those changes.'};
  if (game==='gum' && current.qualityVersion===0 && ['gravity','thrust'].some(k=>k in patch)) return {kind:'invalid',message:'This earlier version uses the original construction rules. Start a physical workshop to try gravity and fan changes.'};
  if(current.originalRules && ['hearts','breathSpeed','highlightMatches',...(current.qualityVersion===2?[]:['extraDecoys'])].some(k=>k in patch)) return {kind:'invalid',message:'That setting belongs to a saved legacy game. Use the restored game examples below.'};
  if (!Object.keys(patch).length) return { kind: 'generation-needed', message: 'I cannot build that change with these local tools yet. No game changed. Try an example below, or save your idea for later. No AI service is connected.' };
  try {
    const config = validateConfig(game, { ...current, ...patch }), changes = diff(game, current, config);
    if (!changes.length) return { kind: 'unchanged', message: 'Your game already works that way. Try a different change!' };
    return { kind: 'supported', config, summary: changes.map(c => `${c.label}: ${c.before} → ${c.after}`).join('; ') };
  } catch (err) { return { kind: 'invalid', message: (err as Error).message + ' Your last working version is safe.' }; }
}
export const examples: Record<GameId, string[]> = {
  factory: ['Make the cutter slower','Add extra sparkles','Pack 4 gems per order','Make the cutter faster and add extra sparkles'],
  moon: ['Give me 8 donuts','Add bounce pads','Make moon gravity lower','Add bounce pads and make meteors faster'],
  robot: ['Make robot faster','Add portals','Show my path','Add portals and make robot slower'],
  buckets: ['Give me four buckets', 'Show the safe bucket', 'Make the splash last 1 second', 'Hide the safe bucket', 'Make it slower'],
  gum: ['Give me ten gum sticks', 'Make joints stronger', 'Make gravity lower', 'Make fan stronger', 'Make gum stretchier'],
  dragon: ['Give the island 120 resilience', 'Make fireballs slower', 'Make shield wider'],
  hill: ['Make wheels bigger', 'Make springs softer', 'Make motor gentler', 'Make car lighter', 'Make motor stronger'],
};

export const examplesFor=(game:GameId,config:Mechanics):string[]=>game==='gum'&&config.qualityVersion===2?
  ['Give me 2 extra stickers','Show the basic stickers']:examples[game];
