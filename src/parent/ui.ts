import './style.css';
import { captureParentSnapshot, type ParentSnapshot } from './snapshot';
import type { ParentEvidence, ParentOpportunity, ParentRange, ParentSkillRow, ParentSubjectId, ParentSubjectReport } from './model';
import { hasRecordedSupport } from './model';
import { PROBLEM_SOLVING_KEY } from '../problem-solving/model';

type Tab = 'overview' | 'skills' | 'evidence' | 'school' | 'settings';
const labels: Record<ParentSubjectId, string> = { math: 'Math', language: 'Language Arts', creation: 'Computational Thinking', 'problem-solving': 'Problem Solving' };
const symbols: Record<ParentSubjectId, string> = { math: '+', language: 'Aa', creation: '{ }', 'problem-solving': '↗' };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n;
};
const button = (text: string, action: () => void, cls = 'pd-button') => {
  const b = node('button', cls, text); b.type = 'button'; b.onclick = action; return b;
};
const date = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const number = (value: number) => value.toLocaleString();
const titleBlock = (title: string, detail?: string) => {
  const h = node('div', 'pd-section-heading'); h.append(node('h2', '', title)); if (detail) h.append(node('p', '', detail)); return h;
};
function link(label: string, url: string) { const a = node('a', 'pd-source-link', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function empty(title: string, detail: string) { const box = node('div', 'pd-empty'); box.append(node('span', 'pd-empty-mark', '◇'), node('h3', '', title), node('p', '', detail)); return box; }

/** One parent surface in the existing application. No second learner store or network reporting. */
export function installParentDashboard() {
  const FG = (window as any).FG;
  if (FG.parentDashboard) return FG.parentDashboard;
  const host = document.getElementById('page-parent');
  if (!host) return;
  let selectedTab: Tab = 'overview', range: ParentRange = 30;
  let subject: ParentSubjectId | 'all' = 'all', skillFilter = 'all', query = '';
  let evidenceSkill = '', evidenceId = '', evidenceIds: string[] = [], evidenceSource = 'all', evidenceLimit = 30;
  let snapshot: ParentSnapshot | null = null;
  let owner = '';
  const legacyHead = host.querySelector<HTMLElement>(':scope > .page-head');
  if (legacyHead) legacyHead.hidden = true;
  host.classList.add('parent-dashboard-page');
  const shell = node('div', 'pd-shell'); shell.id = 'parentDashboard';
  const heading = node('header', 'pd-hero');
  const heroCopy = node('div', 'pd-hero-copy');
  heroCopy.append(node('div', 'pd-eyebrow', 'JEMS FOR GROWN-UPS'), node('h1', '', 'Small discoveries. Real progress.'), node('p', '', 'See what they tried, how they did it, and what could help next.'));
  const art = node('img', 'pd-companion'); art.src = './jems-art/character_spark_wave.webp'; art.alt = ''; art.width = 130; art.height = 130; art.loading = 'lazy'; art.decoding = 'async';
  heading.append(heroCopy, art); shell.append(heading);
  const toolbar = node('div', 'pd-toolbar');
  const childLabel = node('label', 'pd-select-label'); childLabel.append(node('span', '', 'Learner'));
  const childSelect = node('select'); childSelect.id = 'parentReportLearner'; childSelect.setAttribute('aria-label', 'Learner to review'); childLabel.append(childSelect);
  const rangeLabel = node('label', 'pd-select-label'); rangeLabel.append(node('span', '', 'Report period'));
  const rangeSelect = node('select'); rangeSelect.id = 'parentReportRange';
  for (const [value, title] of [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All retained history']]) { const option = node('option', '', title); option.value = value; rangeSelect.append(option); }
  rangeSelect.value = '30'; rangeLabel.append(rangeSelect);
  const local = node('span', 'pd-local-badge', '● Saved on this browser');
  const download = button('↓ Save conversation summary', () => downloadSummary(), 'pd-button pd-button-quiet'); download.id = 'parentDownloadSummary';
  toolbar.append(childLabel, rangeLabel, local, download); shell.append(toolbar);
  const tabs = node('div', 'pd-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Parent report sections');
  const panels = new Map<Tab, HTMLElement>();
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const sections: [Tab, string][] = [['overview', 'Overview'], ['skills', 'Skills & progress'], ['evidence', 'Evidence journal'], ['school', 'School connections'], ['settings', 'Settings']];
  sections.forEach(([id, label], index) => {
    const b = button(label, () => openTab(id), 'pd-tab'); b.id = `parentTab-${id}`; b.dataset.parentTab = id;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', `parentPanel-${id}`);
    b.onkeydown = e => { let next = index; if (e.key === 'ArrowRight') next = (index + 1) % sections.length; else if (e.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length; else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = sections.length - 1; else return; e.preventDefault(); openTab(sections[next][0]); tabButtons.get(sections[next][0])?.focus(); };
    tabs.append(b); tabButtons.set(id, b);
    const panel = node('section', 'pd-tab-panel'); panel.id = `parentPanel-${id}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id); panels.set(id, panel);
  });
  const status = node('p', 'pd-status'); status.id = 'parentReportStatus'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
  shell.append(tabs, status, ...panels.values());
  const settings = panels.get('settings')!;
  settings.append(titleBlock('Learning, privacy & saved work', 'Your existing family controls, together in one place.'));
  const notice = host.querySelector<HTMLElement>(':scope > .notice');
  if (notice) { notice.textContent = 'These learning reports are stored on this browser and are visible to people who use it. Remote workshop access and guardian permissions are managed separately below.'; settings.append(notice); }
  const controls = host.querySelector<HTMLElement>(':scope > .two-column');
  if (controls) {
    settings.append(controls);
    const oldReport = controls.querySelector<HTMLElement>('#parentStats');
    if (oldReport) { const detail = node('details', 'pd-legacy-report'); detail.append(node('summary', '', 'Original learning report')); oldReport.before(detail); detail.append(oldReport); }
    const rightTitle = controls.querySelector<HTMLElement>('.panel:nth-child(2) > h2'); if (rightTitle) rightTitle.textContent = 'Backups & existing reports';
  }
  host.append(shell);
  const legacyObservations = node('details', 'pd-legacy-report');
  legacyObservations.append(node('summary', '', 'Original creation reports'));
  legacyObservations.hidden = true; settings.append(legacyObservations);
  const problemControls = node('section', 'pd-card'); problemControls.id = 'problemSolvingParentControls';
  problemControls.hidden = true; settings.append(problemControls);
  function adoptPrivacyPanels() {
    for (const id of ['builderPrivacyPanel']) { const panel = document.getElementById(id); if (panel && !settings.contains(panel)) settings.append(panel); }
    for (const id of ['creationParentProgress']) { const panel = document.getElementById(id); if (panel && !legacyObservations.contains(panel)) { legacyObservations.append(panel); legacyObservations.hidden = false; } }
  }
  adoptPrivacyPanels();
  new MutationObserver(adoptPrivacyPanels).observe(host, { childList: true });
  function current() { return !!snapshot && String(FG.store.current().id) === snapshot.ownerId; }
  function message(text: string) { status.textContent = text; status.hidden = !text; }
  function renderProblemControls() {
    problemControls.replaceChildren(); problemControls.hidden = true;
    const api = FG.problemSolvingEvidence;
    if (!current() || !api) return;
    const capturedOwner = snapshot!.ownerId;
    problemControls.hidden = false;
    problemControls.append(titleBlock('Problem-solving observations', 'Saved on this browser and included in the family backup. Skills & progress and the Evidence journal show results for the selected report period.'));
    if (FG.problemSolving?.open) problemControls.append(button('Open Try an idea', () => { if (String(FG.store.current().id) === capturedOwner) FG.problemSolving.open(); }));
    problemControls.append(node('p', 'pd-fine', 'Clearing these observations also clears this profile’s unfinished Try an idea activities. Original Math, Language Arts, creation work and engagement rewards keep their own histories.'));
    const clear = button('Clear these observations for this profile', () => {
      if (String(FG.store.current().id) !== capturedOwner) return;
      if (!confirm('Clear this profile’s problem-solving observations and unfinished Try an idea activities on this browser?')) return;
      if (String(FG.store.current().id) !== capturedOwner) return;
      try { api.clearCurrent(); refresh(); message('This profile’s problem-solving observations and unfinished activities were cleared.'); }
      catch (error) { message((error as Error).message); }
    }, 'pd-text-button');
    clear.id = 'clearProblemSolving';
    clear.disabled = snapshot!.dashboard.subjects.find(domain => domain.id === 'problem-solving')?.availability !== 'available';
    problemControls.append(clear);
  }
  function openTab(tab: Tab) { selectedTab = tab; render(); }
  function showEvidence(skill: string, domain: ParentSubjectId, id = '', ids: string[] = []) { subject = domain; evidenceSkill = skill; evidenceId = id; evidenceIds = [...ids]; evidenceSource = 'all'; evidenceLimit = 30; openTab('evidence'); panels.get('evidence')?.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  function defaultSkillFilter(data: ParentSnapshot, area: ParentSubjectId | 'all' = 'all') {
    return data.dashboard.subjects.some(domain => (area === 'all' || domain.id === area) && domain.period.records > 0) ? 'observed' : 'all';
  }
  function chooseSubject(id: ParentSubjectId) { if (!snapshot || !current()) return; subject = id; skillFilter = defaultSkillFilter(snapshot, id); query = ''; openTab('skills'); }
  childSelect.onchange = () => {
    const id = childSelect.value; if (id === String(FG.store.current().id)) return;
    if (!FG.store.choose(id)) { refresh(); return; }
    FG.app.refreshProfiles(); window.dispatchEvent(new Event('factory-profile')); FG.app.page('parent');
  };
  rangeSelect.onchange = () => { range = rangeSelect.value === 'all' ? 'all' : Number(rangeSelect.value) as ParentRange; evidenceLimit = 30; refresh(); };
  function resetFilters(data: ParentSnapshot) { subject = 'all'; skillFilter = defaultSkillFilter(data); query = ''; evidenceSkill = ''; evidenceId = ''; evidenceIds = []; evidenceSource = 'all'; evidenceLimit = 30; }
  function refresh() {
    try {
      const next = captureParentSnapshot(FG, range);
      if (next.ownerId !== owner) { owner = next.ownerId; resetFilters(next); for (const [id, panel] of panels) if (id !== 'settings') panel.replaceChildren(); }
      snapshot = next; download.disabled = false;
      renderProblemControls();
      childSelect.replaceChildren();
      const profiles = FG.store.familyProfiles();
      if (next.adult) { const option = node('option', '', 'Adult test workspace'); option.value = next.ownerId; childSelect.append(option); }
      for (const profile of profiles) { const option = node('option', '', String(profile.name || 'Learner')); option.value = String(profile.id); childSelect.append(option); }
      childSelect.value = next.ownerId;
      message(next.warnings.join(' '));
      render();
    } catch (error) { snapshot = null; download.disabled = true; renderProblemControls(); for (const [id, panel] of panels) if (id !== 'settings') panel.replaceChildren(empty('Report unavailable', 'Your saved work has not been changed. Open Settings to review recovery and backup options.')); message((error as Error).message); }
  }
  function render() {
    for (const [id, panel] of panels) { panel.hidden = selectedTab !== id; const b = tabButtons.get(id)!; b.setAttribute('aria-selected', String(id === selectedTab)); b.tabIndex = id === selectedTab ? 0 : -1; }
    if (!snapshot || !current()) return;
    const panel = panels.get(selectedTab)!;
    if (selectedTab === 'settings') { adoptPrivacyPanels(); renderProblemControls(); return; }
    panel.replaceChildren();
    if (selectedTab === 'overview') renderOverview(panel);
    else if (selectedTab === 'skills') renderSkills(panel);
    else if (selectedTab === 'evidence') renderEvidence(panel);
    else renderSchool(panel);
  }
  function periodLabel() { return range === 'all' ? 'All retained history' : `Last ${range} days`; }
  function renderOverview(panel: HTMLElement) {
    const data = snapshot!.dashboard;
    const intro = node('div', 'pd-overview-intro');
    intro.append(titleBlock(`${snapshot!.name}’s learning, at a glance`, `${periodLabel()} · Four different ways to learn. Every observation has its own story.`));
    panel.append(intro);
    if (snapshot!.adult) panel.append(node('p', 'pd-note', 'Adult test workspace. These are test records, separate from family learner histories.'));
    const cards = node('div', 'pd-domain-grid');
    for (const domain of data.subjects) {
      const card = button('', () => chooseSubject(domain.id), `pd-domain-card pd-${domain.id}`); card.dataset.parentSubject = domain.id; card.dataset.parentDomain = domain.id;
      card.append(node('span', 'pd-domain-icon', symbols[domain.id]), node('h3', '', labels[domain.id]));
      if (!domain.available) { card.append(node('strong', 'pd-domain-value pd-domain-unavailable', domain.availability === 'read-error' ? 'Records unavailable' : 'Not connected'), node('p', '', domain.availability === 'read-error' ? 'Saved records could not be read. See the report notice for recovery options.' : 'This build does not yet supply this evidence.')); }
      else if (!domain.period.records) { card.append(node('strong', 'pd-domain-value pd-domain-unavailable', domain.contextRecords ? 'Activity recorded' : 'Ready to explore'), node('p', '', domain.contextRecords ? `No structured practice decisions in this period. ${number(domain.contextRecords)} unscored activity ${domain.contextRecords === 1 ? 'record' : 'records'} available in the journal.` : 'No retained observations in this period.')); }
      else {
        const count = domain.id === 'problem-solving' ? domain.period.records : domain.period.completed;
        card.append(node('strong', 'pd-domain-value', number(count)), node('span', 'pd-domain-measure', domain.id === 'creation' ? 'scene versions matched' : domain.id === 'problem-solving' ? 'structured practice decisions' : 'activities completed'));
        card.append(node('p', '', domain.id === 'problem-solving' ? `Task-level results and recorded support · ${number(domain.contextRecords)} separate unscored activity records` : domain.id === 'creation' ? `${number(domain.period.matchedWithoutHint)} matches without a recorded hint · ${number(domain.period.matchedWithHint)} with a hint` : `${number(domain.period.independent)} independent · ${number(domain.period.supported)} with support`));
      }
      card.append(node('span', 'pd-card-action', 'Explore evidence →')); cards.append(card);
    }
    panel.append(cards);
    const middle = node('div', 'pd-overview-grid');
    const chartCard = node('section', 'pd-card'); chartCard.append(titleBlock('Practice over time', 'Recorded independent and supported completions. Activity volume is not a measure of ability.'));
    const chartSelector = subjectSelector(subject === 'language' ? 'language' : 'math', false, value => { subject = value; render(); });
    chartSelector.setAttribute('aria-label', 'Subject in practice chart'); chartCard.append(chartSelector);
    const chartSubject = data.subjects.find(s => s.id === (subject === 'language' ? 'language' : 'math'))!;
    chartCard.append(renderChart(chartSubject)); middle.append(chartCard);
    const support = node('section', 'pd-card pd-next-card'); support.append(node('div', 'pd-eyebrow', 'A LITTLE HELP GOES A LONG WAY'), titleBlock('A useful next step', 'Small, specific suggestions grounded in the records.'));
    if (data.opportunities.length) for (const opportunity of data.opportunities.slice(0, 2)) support.append(opportunityCard(opportunity));
    else support.append(empty('Let the evidence build', 'A few activities on different days will give us more to discuss. Nothing here is a judgment about ability.'));
    middle.append(support); panel.append(middle);
    const comparisons = node('section', 'pd-card');
    comparisons.append(titleBlock('See what changed', 'Two comparable practice examples, side by side. We keep the task conditions and the help visible.'));
    if (!data.comparisons.length) comparisons.append(empty('More than one moment matters', 'When retained examples share a skill, task form and difficulty on different days, you can compare them here. One result is not a growth score.'));
    for (const pair of data.comparisons.slice(0, 2)) {
      const earlier = data.evidence.find(item => item.id === pair.earlierId), later = data.evidence.find(item => item.id === pair.laterId);
      if (!earlier || !later) continue;
      const section = node('article', 'pd-example-pair'); section.append(node('h3', '', pair.title), node('p', 'pd-fine', pair.conditionNote));
      const grid = node('div', 'pd-comparable-grid');
      for (const [label, item] of [['Earlier retained example', earlier], ['Latest comparable example', later]] as const) {
        const example = node('div', 'pd-comparable-example');
        example.append(node('span', 'pd-eyebrow', label), node('strong', 'pd-comparable-date', date(item.at)), node('p', 'pd-comparable-prompt', item.prompt), node('p', 'pd-comparable-response', `First response: ${item.firstResponse ?? 'Not recorded'}`), node('span', 'pd-fine', item.firstCorrect === null ? 'First-response result unavailable' : item.firstCorrect ? 'First response matched' : 'First response did not match'), node('p', 'pd-fine', item.support.join(' · ') || 'No support recorded; help outside Jems is unknown.'), button('Inspect this example →', () => showEvidence(item.skillId, item.subject, item.id), 'pd-text-button'));
        grid.append(example);
      }
      section.append(grid); comparisons.append(section);
    }
    comparisons.append(node('p', 'pd-fine', 'Same skill, form and difficulty do not make two items a calibrated assessment. These examples support a conversation; they do not establish a measured gain.'));
    panel.append(comparisons);
    const recent = node('section', 'pd-card'); const recentHead = titleBlock('A window into their thinking', 'Open an example to see the task, response, support and source.');
    recentHead.append(button('View the evidence journal →', () => { subject = 'all'; evidenceSkill = ''; evidenceId = ''; evidenceIds = []; evidenceSource = 'all'; openTab('evidence'); }, 'pd-text-button'));
    recent.append(recentHead);
    if (!data.evidence.length) recent.append(empty('Their first discoveries will appear here', 'Math and Language Arts activities, checked Creation Studio scenes, and Try an idea decisions will add concrete examples as they play.'));
    else for (const item of data.evidence.slice(0, 3)) recent.append(evidenceCard(item));
    panel.append(recent, methodNote());
  }
  function renderChart(domain: ParentSubjectReport) {
    const wrap = node('div', 'pd-chart-wrap');
    const days = domain.trend;
    if (!days.some(d => d.records)) { wrap.append(empty('No practice to chart yet', 'This period has no retained records for this subject.')); return wrap; }
    // Bin calendar days, including days with zero records. Civil-day indices keep
    // daylight-saving transitions from shifting evidence into the wrong bin.
    const dayIndex = (at: number) => { const d = new Date(at); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000); };
    const localDay = (index: number) => { const d = new Date(index * 86_400_000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(); };
    const first = dayIndex(snapshot!.dashboard.from ?? days[0].at), last = dayIndex(snapshot!.dashboard.through);
    const span = Math.max(1, last - first + 1), binDays = Math.max(1, Math.ceil(span / 14));
    const buckets = Array.from({ length: Math.ceil(span / binDays) }, (_, index) => ({ at: localDay(first + index * binDays), last: localDay(Math.min(last, first + (index + 1) * binDays - 1)), independent: 0, supported: 0 }));
    for (const day of days) { const index = Math.floor((dayIndex(day.at) - first) / binDays); if (buckets[index]) { buckets[index].independent += day.independent; buckets[index].supported += day.supported; } }
    const chart = node('div', 'pd-chart'); chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${labels[domain.id]} completions by calendar period, including zero-record days. ` + buckets.map(b => `${date(b.at)}${b.at !== b.last ? ' through ' + date(b.last) : ''}: ${b.independent} independent, ${b.supported} supported`).join('; '));
    const max = Math.max(1, ...buckets.map(d => d.independent + d.supported));
    const labelEvery = Math.ceil(buckets.length / 6), lastLabelIndex = buckets.length - 1;
    for (const [index, bucket] of buckets.entries()) {
      const column = node('div', 'pd-chart-column'); column.title = `${date(bucket.at)}${bucket.at !== bucket.last ? ' – ' + date(bucket.last) : ''}: ${bucket.independent} independent, ${bucket.supported} with support`;
      const stack = node('div', 'pd-chart-stack');
      const helped = node('span', 'pd-chart-supported'); helped.style.height = `${bucket.supported / max * 135}px`;
      const independent = node('span', 'pd-chart-independent'); independent.style.height = `${bucket.independent / max * 135}px`;
      // Reserve one normal label interval before the final date; a forced final
      // label must not crowd an adjacent regular label on narrow screens.
      const showLabel = index === lastLabelIndex || index % labelEvery === 0 && lastLabelIndex - index >= labelEvery;
      stack.append(helped, independent); column.append(stack, node('span', 'pd-chart-label', showLabel ? new Date(bucket.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''));
      chart.append(column);
    }
    const legend = node('div', 'pd-legend'); legend.append(node('span', 'pd-legend-independent', domain.id === 'creation' ? 'No recorded hint' : 'Independent'), node('span', 'pd-legend-supported', 'With support'));
    wrap.append(chart, legend, node('p', 'pd-fine', `${binDays === 1 ? 'Each bar is one calendar day.' : `Each bar spans ${binDays} calendar days; the final bar may be shorter.`} Empty periods have no retained completions. Tasks can differ in difficulty; this chart does not establish a learning gain.`));
    return wrap;
  }
  function opportunityCard(item: ParentOpportunity) {
    const card = node('article', 'pd-opportunity'); card.append(node('span', 'pd-subject-label', labels[item.subject]), node('h3', '', item.title), node('p', '', item.reason), node('p', 'pd-opportunity-action', item.action));
    const prompt = node('blockquote', 'pd-parent-prompt', item.prompt); card.append(prompt);
    const actions = node('div', 'pd-row'); actions.append(button(item.evidenceIds.length ? 'See supporting examples' : 'Open skill history', () => showEvidence(item.skillId, item.subject, '', item.evidenceIds), 'pd-text-button'));
    if (item.subject === 'math' || item.subject === 'language') actions.append(button('Choose a practice focus', () => focusSkill(item.skillId, item.subject), 'pd-text-button'));
    card.append(actions); return card;
  }
  function focusSkill(skillId: string, domain: ParentSubjectId) {
    if (!current()) return;
    openTab('settings');
    const control = document.getElementById(domain === 'math' ? 'parentSkill' : 'parentLanguageSkill') as HTMLSelectElement | null;
    const subjectControl = document.getElementById('parentSubject') as HTMLSelectElement | null;
    if (subjectControl && subjectControl.value !== domain && subjectControl.value !== 'both') { subjectControl.value = domain; subjectControl.dispatchEvent(new Event('change')); }
    if (control && [...control.options].some(o => o.value === skillId)) { control.value = skillId; control.focus(); message('Practice focus selected. Review the learning settings and choose “Save learning settings” to apply it.'); }
    else message('Review the learning settings to choose an available focus within the current content range.');
  }
  function subjectSelector(value: ParentSubjectId | 'all', all: boolean, onChange: (value: any) => void) {
    const select = node('select', 'pd-filter-select');
    if (all) { const opt = node('option', '', 'All learning areas'); opt.value = 'all'; select.append(opt); }
    for (const [id, name] of Object.entries(labels)) { if (!all && id !== 'math' && id !== 'language') continue; const opt = node('option', '', name); opt.value = id; select.append(opt); }
    select.value = value; select.onchange = () => onChange(select.value); return select;
  }
  function renderSkills(panel: HTMLElement) {
    panel.append(titleBlock('Skills & progress', 'Math and Language Arts skill status: all recorded practice. Activity counts: selected period. Creation and Problem Solving status: selected-period observations.'));
    const filters = node('div', 'pd-filters');
    const domain = subjectSelector(subject, true, (value: ParentSubjectId | 'all') => { subject = value; render(); }); domain.setAttribute('aria-label', 'Filter skills by learning area');
    const state = node('select'); state.setAttribute('aria-label', 'Filter skills by evidence');
    for (const [value, label] of [['all', 'All skills'], ['observed', 'Observed in this period'], ['review', 'Ready for review'], ['support', 'With recorded support'], ['uncertain', 'Help or authorship unknown'], ['unobserved', 'Not observed in this period']]) { const option = node('option', '', label); option.value = value; state.append(option); }
    state.value = skillFilter; state.onchange = () => { skillFilter = state.value; render(); };
    const search = node('input'); search.type = 'search'; search.placeholder = 'Find a skill'; search.setAttribute('aria-label', 'Search skill names'); search.value = query;
    search.oninput = () => { query = search.value; renderSkillRows(rows); };
    filters.append(domain, state, search); panel.append(filters);
    const summary = node('p', 'pd-fine', '“Not observed” means no retained evidence here. It does not mean your child cannot do it. Grade labels describe content, not overall ability.'); panel.append(summary);
    if (subject === 'problem-solving') panel.append(problemSolvingNote('problemSolvingSkillsNote'));
    const rows = node('div', 'pd-skill-list'); renderSkillRows(rows); panel.append(rows, methodNote());
  }
  function renderSkillRows(rows: HTMLElement) {
    rows.replaceChildren();
    const domains = snapshot!.dashboard.subjects.filter(d => subject === 'all' || d.id === subject);
    let total = 0;
    for (const domain of domains) {
      const matching = domain.skills.filter(skill => (!query || skill.title.toLowerCase().includes(query.toLowerCase())) && (skillFilter === 'all' || skillFilter === 'observed' && skill.period.records > 0 || skillFilter === 'unobserved' && !skill.period.records || skillFilter === 'review' && skill.reviewDue || skillFilter === 'uncertain' && skill.period.unknownAttribution > 0 || skillFilter === 'support' && hasRecordedSupport(skill)));
      const section = node('section', `pd-skill-section pd-${domain.id}`); section.append(titleBlock(labels[domain.id]));
      if (!domain.available) { section.append(domain.availability === 'read-error' ? empty('Could not read saved records', 'This is a reporting problem, not a learner result. Existing data has not been changed. Open Settings to review backup and recovery options.') : empty('Not connected in this build', 'This learning area will show evidence when its reviewed observation source is connected.')); rows.append(section); continue; }
      if (!matching.length) continue;
      for (const skill of matching) { section.append(skillCard(skill)); total++; }
      rows.append(section);
    }
    if (!total && !rows.childElementCount) rows.append(empty('No skills match these filters', 'Try another learning area, a wider period, or a different search.'));
  }
  function skillCard(skill: ParentSkillRow) {
    const detail = node('details', 'pd-skill'); detail.dataset.parentSkill = skill.id;
    const summary = node('summary', 'pd-skill-summary'); const title = node('div'); title.append(node('strong', '', skill.title), node('span', 'pd-fine', skill.grade ? `Grade ${skill.grade} content · ${number(skill.period.records)} records in this period` : `${number(skill.period.records)} records in this period`));
    summary.append(title, node('span', `pd-state pd-state-${skill.state}`, skill.stateLabel)); detail.append(summary);
    const body = node('div', 'pd-skill-detail'); body.append(node('p', '', skill.note));
    const counts = node('div', 'pd-detail-counts');
    const entries: [number, string][] = skill.subject === 'problem-solving' ? [[skill.period.completed, 'matched the task rule'], [skill.period.noContentHelp, 'no content help recorded'], [skill.period.withContentHelp, 'content help recorded'], [skill.period.unknownAttribution, 'support or authorship unknown']] : skill.subject === 'creation' ? [[skill.period.completed, 'scene versions matched'], [skill.period.matchedWithoutHint, 'matches without a hint'], [skill.period.matchedWithHint, 'matches with a hint'], [skill.period.records - skill.period.completed, 'checks not matched yet']] : [[skill.period.independent, 'independent completions'], [skill.period.supported, 'with recorded support'], [skill.period.retries, 'with retries'], [skill.period.readAloud, 'with read-aloud']];
    for (const [n, label] of entries) { const box = node('div'); box.append(node('strong', '', number(n)), node('span', '', label)); counts.append(box); }
    body.append(counts, node('p', 'pd-fine', skill.stateBasis === 'all-recorded-practice' ? 'Skill status uses all recorded practice. Counts above use the selected period and retained history.' : 'This status describes checks in the selected period, not generalized mastery.'));
    if (skill.standards.length) body.append(node('p', 'pd-standard', 'Task references: ' + skill.standards.join(' · ') + '. References are not proof of curriculum coverage.'));
    const actions = node('div', 'pd-row'); actions.append(button('See the examples →', () => showEvidence(skill.id, skill.subject), 'pd-button pd-button-quiet'));
    if (skill.subject === 'math' || skill.subject === 'language') actions.append(button('Choose as practice focus', () => focusSkill(skill.id, skill.subject), 'pd-text-button'));
    body.append(actions); detail.append(body); return detail;
  }
  function problemSolvingNote(id: string) {
    const domain = snapshot!.dashboard.subjects.find(item => item.id === 'problem-solving')!;
    const note = node('aside', 'pd-note'); note.id = id;
    note.append(node('p', '', `${number(domain.period.records)} structured practice decisions · ${number(domain.contextRecords)} separate unscored activity records · ${periodLabel()}.`));
    const sources: Record<string, string> = { math: 'Math', language: 'Language Arts', creation: 'scene checks', studio: 'game design', practice: 'unfinished or unscored practice' };
    const context = Object.entries(domain.contextBySource).map(([source, count]) => `${sources[source] || source}: ${number(count)}`);
    if (context.length) note.append(node('p', '', `Unscored source records — ${context.join('; ')}. These provide activity context and do not add to skill results.`));
    for (const text of domain.notices) note.append(node('p', 'pd-fine', text));
    return note;
  }
  function renderEvidence(panel: HTMLElement) {
    panel.append(titleBlock('The evidence journal', 'The task, the response, the help, and the result. Concrete examples make progress understandable.'));
    const filters = node('div', 'pd-filters'); const select = subjectSelector(subject, true, (value: ParentSubjectId | 'all') => { subject = value; evidenceSkill = ''; evidenceId = ''; evidenceIds = []; evidenceSource = 'all'; evidenceLimit = 30; render(); }); select.setAttribute('aria-label', 'Filter evidence by learning area'); filters.append(select);
    const sourceFor = (item: ParentEvidence) => item.context.source || item.context.gameId || labels[item.subject];
    const available = snapshot!.dashboard.evidence.filter(item => subject === 'all' || item.subject === subject);
    const sources = node('select'); sources.setAttribute('aria-label', 'Filter evidence by activity source');
    const anySource = node('option', '', 'All activity sources'); anySource.value = 'all'; sources.append(anySource);
    for (const source of [...new Set(available.map(sourceFor))].sort()) { const option = node('option', '', source); option.value = source; sources.append(option); }
    if (![...sources.options].some(option => option.value === evidenceSource)) evidenceSource = 'all';
    sources.value = evidenceSource; sources.onchange = () => { evidenceSource = sources.value; evidenceLimit = 30; render(); }; filters.append(sources);
    if (evidenceSkill || evidenceId || evidenceIds.length) filters.append(button('Clear skill filter ×', () => { evidenceSkill = ''; evidenceId = ''; evidenceIds = []; render(); }, 'pd-button pd-button-quiet'));
    panel.append(filters);
    if (subject === 'problem-solving') panel.append(problemSolvingNote('problemSolvingEvidenceNote'));
    const evidence = available.filter(item => (!evidenceSkill || item.skillId === evidenceSkill) && (!evidenceId || item.id === evidenceId) && (!evidenceIds.length || evidenceIds.includes(item.id)) && (evidenceSource === 'all' || sourceFor(item) === evidenceSource));
    panel.append(node('p', 'pd-fine', `${number(evidence.length)} retained ${evidence.length === 1 ? 'record' : 'records'} · ${periodLabel()}. Repeated checks stay visible here; summaries combine identical scene/version checks.`));
    if (!evidence.length) panel.append(empty('No examples in this view yet', 'Choose a wider period or another learning area. Missing evidence is not an unsuccessful attempt.'));
    for (const item of evidence.slice(0, evidenceLimit)) panel.append(evidenceCard(item, !!evidenceSkill));
    if (evidence.length > evidenceLimit) panel.append(button(`Show ${Math.min(30, evidence.length - evidenceLimit)} more examples`, () => { evidenceLimit += 30; render(); }, 'pd-button pd-button-quiet'));
    panel.append(methodNote());
  }
  function evidenceCard(item: ParentEvidence, open = false) {
    const detail = node('details', `pd-evidence pd-${item.subject}`); detail.open = open; detail.dataset.evidenceId = item.id;
    const summary = node('summary'); const icon = node('span', 'pd-evidence-icon', symbols[item.subject]);
    const copy = node('div', 'pd-evidence-copy'); copy.append(node('span', 'pd-evidence-meta', labels[item.subject] + ' · ' + date(item.at)), node('strong', '', item.observation), node('span', 'pd-fine', item.skillTitle));
    summary.append(icon, copy, node('span', 'pd-evidence-outcome', item.outcomeLabel)); detail.append(summary);
    const body = node('div', 'pd-evidence-body');
    body.append(node('h4', '', 'What was asked'), node('p', 'pd-task-prompt', item.prompt));
    if (item.passage) { const passage = node('details'); passage.append(node('summary', '', 'Read the task passage'), node('p', 'pd-task-prompt', item.passage)); body.append(passage); }
    const responses = node('div', 'pd-response-grid');
    if (item.firstResponse !== null) { const first = node('div'); first.append(node('h4', '', 'First response'), node('p', 'pd-response', item.firstResponse)); responses.append(first); }
    if (item.finalResponse !== null && (item.firstResponse === null || item.finalResponse !== item.firstResponse)) { const final = node('div'); final.append(node('h4', '', item.subject === 'creation' ? 'Checked scene' : item.subject === 'problem-solving' ? 'Recorded decision note' : item.outcome === 'explored' ? 'Saved writing response' : item.firstResponse === null ? 'Recorded response' : 'Later response'), node('p', 'pd-response', item.finalResponse)); responses.append(final); }
    if (responses.childElementCount) body.append(responses);
    else body.append(node('p', 'pd-fine', 'A response transcript was not recorded for this activity.'));
    body.append(node('h4', '', 'Recorded support'), node('p', '', item.support.length ? item.support.join(' · ') : 'No help recorded. Support outside Jems cannot be observed here.'));
    const provenance = node('dl', 'pd-provenance');
    const pairs: [string, string | undefined][] = [['Learning area', labels[item.subject]], ['Source', item.context.source], ['Recorded', new Date(item.at).toLocaleString()], ['Task', item.context.itemId], ['Game', item.context.gameId], ['Project', item.context.projectId], ['Exact revision', item.context.revisionId], ['Task form', item.context.form], ['Task family', item.context.taskFamily], ['Task version', item.context.taskVersion], ['Task demand', item.context.demand], ['Exposure', item.context.exposure], ['First attempt', item.context.firstAttempt === undefined ? undefined : item.context.firstAttempt ? 'Yes' : 'No'], ['Authorship', item.provenance?.authorship], ['Help type', item.provenance?.support], ['Prompted or spontaneous', item.provenance?.elicitation], ['Content reference', item.standards.join(', ') || undefined]];
    for (const [label, value] of pairs) if (value) provenance.append(node('dt', '', label), node('dd', '', value)); body.append(provenance); detail.append(body); return detail;
  }
  function renderSchool(panel: HTMLElement) {
    panel.append(titleBlock('Connect the dots with school', 'A familiar way to discuss learning—without turning a game observation into a test score.'));
    const intro = node('section', 'pd-school-intro'); intro.append(node('span', 'pd-domain-icon', '↔'), node('div'));
    intro.lastElementChild!.append(node('h3', '', 'Bring examples, not a conversion chart'), node('p', '', 'Jems can help you discuss a specific skill with a teacher. Its observations do not convert to an IXL SmartScore, reading age, grade-equivalent score, or national percentile.')); panel.append(intro);
    const comparison = node('div', 'pd-comparison');
    const rows: [string, string, string][] = [
      ['IXL SmartScore', 'A proprietary skill-practice measure. It is not percent correct.', 'Jems shows task results, support, retries and the evidence behind each observation.'],
      ['IXL Diagnostic', 'A separate assessment with working-grade levels; some reports also offer national percentile ranks.', 'Jems does not yet provide a calibrated diagnostic level or national comparison.'],
      ['Khan Academy', 'Course mastery reports the share of course skills at Proficient or Mastered under its current rules.', 'Our counts describe retained Jems activities. They are not the percent of a grade or course mastered.'],
      ['Prodigy', 'Shows recent activity, curriculum progress and monthly reports alongside the game.', 'Play and learning activity give context. A streak, gems or time played do not establish durable learning.'],
    ];
    const table = node('table'); const thead = node('thead'); const headRow = node('tr'); ['Familiar system', 'What its report means', 'How to read Jems'].forEach(x => headRow.append(node('th', '', x))); thead.append(headRow); table.append(thead);
    const tbody = node('tbody'); rows.forEach(row => { const tr = node('tr'); row.forEach((text, i) => tr.append(node(i === 0 ? 'th' : 'td', '', text))); tbody.append(tr); }); table.append(tbody); comparison.append(table); panel.append(comparison);
    const sources = node('div', 'pd-source-row'); sources.append(link('IXL SmartScore', 'https://www.ixl.com/help-center/article/1272663/how_does_the_smartscore_work'), link('IXL diagnostic levels', 'https://www.ixl.com/help-center/article/2909803/what_do_the_levels_in_ixl_assessments_mean'), link('IXL national norms', 'https://blog.ixl.com/2026/07/13/the-levelup-diagnostic-is-nationally-normed/'), link('Khan mastery definitions', 'https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery'), link('Prodigy parent reports', 'https://prodigygame.zendesk.com/hc/en-us/articles/115001744726-Parent-Dashboard')); panel.append(sources);
    const frameworks = node('div', 'pd-framework-grid');
    const definitions = [
      ['Math & Language Arts', 'Common Core content references', 'Some Jems tasks carry references to grade-level topics. Those tags describe the intended content, not educator-validated coverage of every standard, the child’s school placement, or a complete curriculum.', 'See the content standards', 'https://www.thecorestandards.org/'],
      ['Computational thinking', 'CSTA concepts & practices', 'Scene challenges create opportunities to sequence actions, use events and debug behavior. A passed scene check describes that exact task. Any CSTA mappings based on the 2017 standards need review against the 2026 standards before stronger alignment claims.', 'See CSTA standards', 'https://csteachers.org/pk12standards/'],
      ['Problem solving', 'ISTE learning practices', 'Planning a test, using a result and revising an idea are useful examples to discuss. Jems observations are not an ISTE certification or a validated general problem-solving score.', 'See ISTE student standards', 'https://iste.org/standards/students'],
    ];
    for (const [area, title, copy, source, url] of definitions) { const card = node('article', 'pd-card'); card.append(node('div', 'pd-eyebrow', area), node('h3', '', title), node('p', '', copy), link(source, url)); frameworks.append(card); } panel.append(frameworks);
    const conversation = node('section', 'pd-card pd-conversation'); conversation.append(titleBlock('An easier conversation with their teacher', 'Save a private summary of the selected period, then choose what you want to share.'));
    const prompts = node('ol'); ['“Here is an example they completed independently. Does it match what you see in class?”', '“They used a hint here. What kind of support would you suggest at home?”', '“Which one skill should we revisit next?”'].forEach(x => prompts.append(node('li', '', x)));
    conversation.append(prompts, button('↓ Save this learner’s summary', () => downloadSummary()), node('p', 'pd-fine', 'The summary is generated locally from the selected records. Nothing is sent to a teacher or uploaded. It may contain private learning responses.')); panel.append(conversation);
  }
  function methodNote() { const detail = node('details', 'pd-method'); detail.append(node('summary', '', 'How to read this report'), node('p', '', 'Independent means no hint, retry or other support recorded by that activity’s rules. Help outside Jems is not observable. Creation checks describe the checked scene and version. Problem-solving observations describe reviewed tasks and their recorded help; they are not aptitude or mastery scores.'), node('p', '', 'The date filter applies to retained dated records. Older records may have been trimmed while the original skill totals remain. Skill status can therefore summarize more history than the examples shown. Missing, interrupted or unscored work is not automatically an incorrect answer.'), node('p', '', 'Different tasks have different demands. More activity, a changing support mix or a matched scene does not prove a learning gain. Grade labels describe content. Jems does not calculate a global thinking score or a comparison with other children.')); return detail; }
  function downloadSummary() {
    if (!current()) return;
    const captured = snapshot!;
    const lines = ['JEMS · PARENT CONVERSATION SUMMARY', captured.name, `${periodLabel()} · Generated ${date(captured.dashboard.through)}`, '', 'LOCAL FORMATIVE OBSERVATIONS', 'These are Jems task observations, not a standardized score, school grade, diagnosis, or comparison with other children.', 'Only retained dated records are included. Each subject uses its own activity rules.', '', ...captured.warnings.map(warning => 'REPORT NOTICE: ' + warning), ...captured.dashboard.notes.map(note => 'RECORD LIMIT: ' + note), ''];
    for (const domain of captured.dashboard.subjects) {
      lines.push(labels[domain.id], !domain.available ? domain.availability === 'read-error' ? 'Saved records could not be read. No learner performance result is inferred.' : 'Not connected in this build.' : domain.id === 'problem-solving' ? `${domain.period.records} structured practice decisions; ${domain.period.completed} matched the task rule; ${domain.period.noContentHelp} with no content help recorded; ${domain.period.withContentHelp} with content help recorded; ${domain.period.unknownAttribution} with unknown attribution. ${domain.contextRecords} separate unscored activity records. These are task observations, not mastery.` : domain.id === 'creation' ? `${domain.period.records} scene/version checks; ${domain.period.completed} matched; ${domain.period.matchedWithoutHint} matches without a recorded hint; ${domain.period.matchedWithHint} matches with a hint. A scene match is not an independent ability score.` : `${domain.period.records} retained records; ${domain.period.completed} completed; ${domain.period.independent} independent completions; ${domain.period.supported} completed with recorded support.`, ...domain.notices.map(note => 'SOURCE NOTE: ' + note), ...(domain.id === 'problem-solving' ? Object.entries(domain.contextBySource).map(([source, count]) => `Unscored source records · ${source}: ${count}`) : []), '');
    }
    lines.push('EXAMPLES TO DISCUSS');
    for (const item of captured.dashboard.evidence.slice(0, 12)) lines.push(`${date(item.at)} · ${labels[item.subject]} · ${item.skillTitle}`, item.observation, `Task: ${item.prompt.slice(0, 2000)}`, `First response: ${item.firstResponse?.slice(0, 1000) ?? 'Not recorded'}`, `${item.subject === 'problem-solving' ? 'Recorded decision note' : 'Final response'}: ${item.finalResponse?.slice(0, 1000) ?? 'Not recorded'}`, `Support: ${item.support.join('; ') || 'No support recorded; help outside Jems is unknown.'}`, `Source: ${[item.context.source, item.context.gameId, item.context.projectId, item.context.revisionId, item.context.itemId].filter(Boolean).join(' / ') || 'Local activity'}`, ...(item.provenance ? [`Authorship: ${item.provenance.authorship}; help: ${item.provenance.support}; elicitation: ${item.provenance.elicitation}`, `Task family: ${item.context.taskFamily ?? 'Unknown'}; version: ${item.context.taskVersion ?? 'Unknown'}; exposure: ${item.context.exposure ?? 'Unknown'}; first attempt: ${String(item.context.firstAttempt ?? 'Unknown')}`] : []), '');
    lines.push('SUGGESTED NEXT STEPS'); for (const action of captured.dashboard.opportunities.slice(0, 4)) lines.push(`${action.title}: ${action.reason}`, action.action, action.prompt, '');
    lines.push('QUESTIONS FOR A TEACHER', 'Does this match what you see in class?', 'What kind of support would help?', 'Which one skill should we revisit next?', '', 'This file may contain private learner information. Share only with people you choose.');
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const a = node('a'); a.href = url; a.download = `jems-learning-summary-${new Date(captured.dashboard.through).toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
    message('Download requested for this learner’s selected records. No report was sent or uploaded.');
  }
  window.addEventListener('factory-profile-changing', () => { snapshot = null; owner = ''; download.disabled = true; renderProblemControls(); for (const [id, panel] of panels) if (id !== 'settings') panel.replaceChildren(); message(''); });
  window.addEventListener('factory-profile', refresh);
  window.addEventListener('factory-page', event => { if ((event as CustomEvent).detail === 'parent') refresh(); });
  window.addEventListener('factory-problem-solving-updated', refresh);
  window.addEventListener('storage', event => { if (event.key === null || event.key.endsWith(PROBLEM_SOLVING_KEY)) refresh(); });
  FG.parentDashboard = { refresh, openTab };
  refresh();
  return FG.parentDashboard;
}
