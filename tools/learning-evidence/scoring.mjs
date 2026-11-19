/**
 * Jems Learning Evidence — R&D deterministic score kernel.
 *
 * NOT connected to the app. NOT a normed instrument or proficiency engine.
 * Scored test material/answer keys MUST live outside this public repo.
 * No child identity, persistence, network or LLM dependency.
 */
export const DOMAINS = Object.freeze(["math", "ela", "computational_thinking", "active_problem_solving"]);
const ALLOWED_HELP = new Set(["none", "neutral_instructions", "adult_help", "ai_help", "other"]);
const ALLOWED_STATES = new Set(["answered", "skipped", "technical_invalid"]);
const clean = value => String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const fail = message => { throw new Error(message); };

export function validateItem(item) {
  if (!item || typeof item !== "object") fail("item required");
  if (typeof item.id !== "string" || !item.id.trim()) fail("item id required");
  if (!DOMAINS.includes(item.domain)) fail("unknown domain");
  if (![1,2,3,4].includes(item.grade)) fail("grade must be 1–4");
  if (typeof item.formId !== "string" || !item.formId.trim()) fail("form id required");
  if (typeof item.strand !== "string" || !item.strand.trim()) fail("strand required");
  if (item.kind === "objective") {
    if (item.maxPoints !== 1 || !Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0) fail("invalid objective schema");
    if (item.acceptedAnswers.some(x => typeof x !== "string" || !x.trim())) fail("empty accepted answer");
    if (new Set(item.acceptedAnswers.map(clean)).size !== item.acceptedAnswers.length) fail("duplicate accepted answers");
  } else if (item.kind === "rubric") {
    if (!Array.isArray(item.criteria) || item.criteria.length === 0) fail("rubric needs criteria");
    const ids = item.criteria.map(x => x.id);
    if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) fail("duplicate/missing rubric criteria");
    if (item.criteria.some(x => !Number.isInteger(x.maxPoints) || x.maxPoints <= 0)) fail("invalid rubric criterion maximum");
    if (item.criteria.reduce((s,x) => s + x.maxPoints,0) !== item.maxPoints) fail("rubric maximum mismatch");
  } else fail("unknown item kind");
  return true;
}

/**
 * Response: {itemId, status:'answered'|'skipped'|'technical_invalid',
 * firstResponse?:string, assistance:'none'|'neutral_instructions'|'adult_help'|'ai_help'|'other',
 * rubricMarks?:Record<string,number>}
 */
export function scoreItem(item, response) {
  validateItem(item);
  if (!response || typeof response !== "object" || response.itemId !== item.id) fail("response identity mismatch");
  if (!ALLOWED_STATES.has(response.status)) fail("invalid response status");
  if (!ALLOWED_HELP.has(response.assistance)) fail("assistance status required");
  const base = { itemId:item.id, domain:item.domain, grade:item.grade, formId:item.formId, strand:item.strand, maxPoints:item.maxPoints };
  if (response.status === "technical_invalid") return {...base, validity:"technical_invalid", points:null};
  const hasIndependentResponse = response.firstResponse !== null && response.firstResponse !== undefined &&
    (typeof response.firstResponse !== "string" || Boolean(response.firstResponse.trim())) &&
    (!Array.isArray(response.firstResponse) || response.firstResponse.length > 0) &&
    (typeof response.firstResponse !== "object" || Array.isArray(response.firstResponse) || Object.keys(response.firstResponse).length > 0);
  if (response.status === "skipped" || !hasIndependentResponse)
    return {...base, validity:"missing", points:null};
  if (!["none","neutral_instructions"].includes(response.assistance))
    return {...base, validity:"assisted", points:null};
  if (item.kind === "objective") {
    if (typeof response.firstResponse !== "string") return {...base, validity:"technical_invalid", points:null};
    return {...base, validity:"scorable", points:item.acceptedAnswers.map(clean).includes(clean(response.firstResponse)) ? 1 : 0};
  }
  const marks = response.rubricMarks;
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) return {...base, validity:"scoring_pending", points:null};
  const keys = Object.keys(marks);
  if (keys.length !== item.criteria.length || item.criteria.some(c => !Object.hasOwn(marks,c.id))) fail("rubric criteria incomplete");
  for (const c of item.criteria) if (!Number.isInteger(marks[c.id]) || marks[c.id] < 0 || marks[c.id] > c.maxPoints) fail("rubric mark out of range");
  const points = item.criteria.reduce((sum,c)=>sum+marks[c.id],0);
  return {...base, validity:"scorable", points};
}

/**
 * Summarizes ONE grade, ONE domain, ONE locked form. An incomplete or contaminated
 * form has no total score. Output is explicitly an uncalibrated raw score.
 */
export function summarizeForm(itemScores, expectedItemIds) {
  if (!Array.isArray(itemScores) || !Array.isArray(expectedItemIds) || expectedItemIds.length === 0) fail("form inputs required");
  if (new Set(expectedItemIds).size !== expectedItemIds.length) fail("duplicate expected item ids");
  const seen = new Map();
  for (const x of itemScores) {
    if (!x || typeof x.itemId !== "string" || seen.has(x.itemId)) fail("duplicate/missing scored item");
    seen.set(x.itemId,x);
  }
  const first = itemScores[0];
  if (!first) fail("no scored items");
  for (const x of itemScores) {
    if (x.domain !== first.domain || x.grade !== first.grade || x.formId !== first.formId) fail("mixed grade/domain/form");
  }
  if (itemScores.length !== expectedItemIds.length || expectedItemIds.some(id=>!seen.has(id))) 
    return {status:"incomplete", grade:first.grade, domain:first.domain, formId:first.formId, points:null, possible:null, scale:"uncalibrated_raw", invalidReasons:["missing_items"]};
  const failures = itemScores.filter(x=>x.validity!=="scorable").map(x=>x.itemId+":"+x.validity);
  if (failures.length) return {status:"incomplete", grade:first.grade, domain:first.domain, formId:first.formId, points:null, possible:null, scale:"uncalibrated_raw", invalidReasons:failures};
  const points=itemScores.reduce((n,x)=>n+x.points,0);
  const possible=itemScores.reduce((n,x)=>n+x.maxPoints,0);
  if (!Number.isFinite(points) || points<0 || points>possible || possible<=0) fail("score bounds violated");
  return {status:"complete", grade:first.grade, domain:first.domain, formId:first.formId, points, possible, rawFraction:points/possible, scale:"uncalibrated_raw", growthClaimAllowed:false};
}
