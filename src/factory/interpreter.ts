import { diff, validateConfig } from '../runtime/manifests';
import type { GameId, Mechanics } from '../runtime/types';
export type Intent = { kind: 'supported'; config: Mechanics; summary: string } | { kind: 'generation-needed' | 'invalid' | 'unchanged'; message: string };
// Deliberately bounded local language rules, never represented as an LLM.
export function interpret(game: GameId, current: Mechanics, prompt: string): Intent {
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
    if ((match=text.match(/^give me (\d+) gum sticks$/))) patch.gumBudget=Number(match[1]);
    else if (/^make joints stronger$/.test(text)) patch.jointStrength=Number(current.jointStrength)+.25;
    else if (/^(?:show|highlight) (?:the )?matching pieces$/.test(text)) patch.highlightMatches = true;
    else if (/^(?:hide|stop highlighting) (?:the )?matching pieces$/.test(text)) patch.highlightMatches = false;
    else if ((match = text.match(/^(?:add|use|give me) (\d+) extra (?:silly )?pieces$/))) patch.extraDecoys = Number(match[1]);
  } else {
    if ((match=text.match(/^give the island (\d+) resilience$/))) patch.groundResilience=Number(match[1]);
    else if (/^make fireballs slower$/.test(text)) patch.fireballCadence=Number(current.fireballCadence)-.25;
    else if (/^make shield wider$/.test(text)) patch.shieldRadius=Number(current.shieldRadius)+10;
    else if ((match = text.match(/^(?:(?:give me|use|i want) )?(\d+) hearts$/))) patch.hearts = Number(match[1]);
    else if (/^(?:make (?:the )?dragon breath|dragon breath) slower$/.test(text)) patch.breathSpeed = Math.round((Number(current.breathSpeed) - .2) * 100) / 100;
    else if (/^(?:make (?:the )?dragon breath|dragon breath) faster$/.test(text)) patch.breathSpeed = Math.round((Number(current.breathSpeed) + .2) * 100) / 100;
  }
  if(current.originalRules && ['hearts','breathSpeed','highlightMatches','extraDecoys'].some(k=>k in patch)) return {kind:'invalid',message:'That setting belongs to a saved legacy game. Use the restored game examples below.'};
  if (!Object.keys(patch).length) return { kind: 'generation-needed', message: 'I cannot build that change with these local tools yet. No game changed. Try an example below, or save your idea for later. No AI service is connected.' };
  try {
    const config = validateConfig(game, { ...current, ...patch }), changes = diff(game, current, config);
    if (!changes.length) return { kind: 'unchanged', message: 'Your game already works that way. Try a different change!' };
    return { kind: 'supported', config, summary: changes.map(c => `${c.label}: ${c.before} → ${c.after}`).join('; ') };
  } catch (err) { return { kind: 'invalid', message: (err as Error).message + ' Your last working version is safe.' }; }
}
export const examples: Record<GameId, string[]> = {
  buckets: ['Give me four buckets', 'Show the safe bucket', 'Make the splash last 1 second', 'Hide the safe bucket', 'Make it slower'],
  gum: ['Give me ten gum sticks', 'Give me six gum sticks', 'Make joints stronger'],
  dragon: ['Give the island 120 resilience', 'Make fireballs slower', 'Make shield wider'],
};
