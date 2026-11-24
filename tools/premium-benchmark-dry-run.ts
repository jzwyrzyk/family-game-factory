// Run the two real adapter entry points with an injected, in-memory transport.
// Every case deliberately receives the SAME authored module, which cannot be a
// quality comparison. This exercises equal input, model routing and plan binding.
import { OpenAIResponsesAgent } from '../server/agent/openai';
import { INITIAL_PREMIUM_MODELS, PREMIUM_POLICY_VERSION, premiumModelRates, type PremiumApproval, type AgentApproval } from '../server/agent/model-policy';
import type { GeneratedGame } from '../server/agent/generated';
import { fixtureModuleReply, fixturePlanProposal, fixturePremiumPlanProposal } from '../server/testing/presentation-quality-fixtures';
import { robotRouteFixture } from '../server/testing/working-game-fixtures';
import { cases, caseIdentity } from './premium-benchmark-cases';

export async function dryRun() {
  const today = new Date().toISOString().slice(0, 10);
  const legacy: AgentApproval = { approvalId: 'offline-fixture', enabled: true, model: 'synthetic-legacy', reasoningEffort: 'medium',
    maxInputTokens: 64000, maxOutputTokens: 3000, inputUsdPerMillion: 1, outputUsdPerMillion: 1, priceReviewedOn: today };
  const stages = Object.fromEntries(Object.entries(INITIAL_PREMIUM_MODELS).map(([stage, model]) => [stage, {
    maxInputTokens: 64000, maxOutputTokens: 3000, priceReviewedOn: today, providerAccessReviewedOn: today, zdrApproved: true,
    model, reasoningEffort: 'high', lowDetailImageTokens: 4096, inputUsdPerMillion: premiumModelRates(model)!.input,
    outputUsdPerMillion: premiumModelRates(model)!.output,
  }])) as PremiumApproval['stages'];
  const premium: PremiumApproval = { version: PREMIUM_POLICY_VERSION, enabled: true, approvalId: 'offline-fixture', maxRepairAttempts: 1, stages };
  const trials = [];
  for (const item of cases) for (const lane of ['legacy', 'premium'] as const) {
    const calls: { stage: string; model: string; effort: string }[] = [];
    const adapter = new OpenAIResponsesAgent(lane === 'legacy' ? legacy : premium, () => 'offline-synthetic-key', async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const stage = request.text.format.name;
      if (JSON.parse(request.input).idea !== item.request || !['family_game_plan', 'family_game_module'].includes(stage))
        throw Error('BENCHMARK_MOCK_REQUEST');
      const plan = lane === 'premium' ? fixturePremiumPlanProposal(request) : fixturePlanProposal(request);
      const value = stage === 'family_game_module' ? fixtureModuleReply(robotRouteFixture) : plan;
      calls.push({ stage, model: request.model, effort: request.reasoning.effort });
      return Response.json({ status: 'completed', model: request.model, service_tier: 'default',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
        usage: { input_tokens: 10, output_tokens: 10, output_tokens_details: { reasoning_tokens: 1 } } });
    });
    const result = await adapter.generate({ childIntent: item.request, gameManifest: { id: 'new', allowedMechanics: ['generated-module-v2'] },
      baseRevision: { id: 'new' }, allowedCapabilities: ['generated-module-v2'], signal: new AbortController().signal,
      budget: { maxUnits: 2_000_000, timeoutMs: 60_000 } });
    const game = result.candidate.game as GeneratedGame;
    if (game.productionPlan?.requestHash !== caseIdentity(item).requestHash || game.source !== robotRouteFixture.source ||
      calls.length !== 2 || calls[0].stage !== 'family_game_plan' || calls[1].stage !== 'family_game_module') throw Error('BENCHMARK_MOCK_BINDING');
    trials.push({ caseId: item.id, lane, requestHash: game.productionPlan.requestHash, plan: game.productionPlan.version, calls });
  }
  return { origin: 'mock-adapter-transport', actualModelComparison: 'pending', paidCalls: 0, trials };
}
