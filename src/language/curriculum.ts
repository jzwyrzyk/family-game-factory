import {EARLY_LANGUAGE} from './early';
import type {LanguageSkill} from './types';
/** Reviewed-content planning catalog. Standards references describe alignment targets, not certified coverage. */
export const LANGUAGE_SKILLS: LanguageSkill[] = [
  ...EARLY_LANGUAGE,
  {
    "id": "g1-initial-letters",
    "title": "Beginning letters and sounds",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3"
    ],
    "prerequisites": [],
    "objective": "Recognize common first-letter sound correspondences in print"
  },
  {
    "id": "g1-cvc-patterns",
    "title": "Short-vowel CVC words",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.B"
    ],
    "prerequisites": [],
    "objective": "Identify common consonant-vowel-consonant spelling patterns"
  },
  {
    "id": "g1-short-a-e",
    "title": "Short a and short e",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.B"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Distinguish short a/e spelling patterns"
  },
  {
    "id": "g1-short-i-o-u",
    "title": "Short i, o, and u",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.B"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Distinguish short i/o/u spelling patterns"
  },
  {
    "id": "g1-digraph-sh-ch",
    "title": "sh and ch digraphs",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.A"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Recognize sh/ch two-letter graphemes"
  },
  {
    "id": "g1-digraph-th-wh",
    "title": "th and wh digraphs",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.A"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Recognize th/wh graphemes in written words"
  },
  {
    "id": "g1-final-blends",
    "title": "Ending consonant blends",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.A"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Identify common final consonant blends"
  },
  {
    "id": "g1-silent-e",
    "title": "Final-e word patterns",
    "grade": 1,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.C"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Recognize vowel-consonant-e spelling patterns"
  },
  {
    "id": "g1-plural-s",
    "title": "Nouns with plural -s",
    "grade": 1,
    "domain": "spelling",
    "standards": [
      "CCSS.ELA-LITERACY.L.1.1.C"
    ],
    "prerequisites": [],
    "objective": "Construct and identify regular plural nouns"
  },
  {
    "id": "g1-irregular-words",
    "title": "Common irregular words",
    "grade": 1,
    "domain": "spelling",
    "standards": [
      "CCSS.ELA-LITERACY.RF.1.3.G"
    ],
    "prerequisites": [],
    "objective": "Recognize and spell taught common irregular words"
  },
  {
    "id": "g1-punctuation",
    "title": "Sentence ending marks",
    "grade": 1,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.1.2.B"
    ],
    "prerequisites": [],
    "objective": "Choose the appropriate end punctuation for a sentence"
  },
  {
    "id": "g1-story-details",
    "title": "Remember story details",
    "grade": 1,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RL.1.1"
    ],
    "prerequisites": [],
    "objective": "Answer text-dependent questions about a short connected passage"
  },
  {
    "id": "g2-vowel-ai-ay",
    "title": "ai and ay patterns",
    "grade": 2,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.2.3.B"
    ],
    "prerequisites": [
      "g1-silent-e"
    ],
    "objective": "Distinguish written long-a vowel teams"
  },
  {
    "id": "g2-vowel-ee-ea",
    "title": "ee and ea patterns",
    "grade": 2,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.2.3.B"
    ],
    "prerequisites": [
      "g1-silent-e"
    ],
    "objective": "Recognize common long-e vowel teams"
  },
  {
    "id": "g2-vowel-oa-ow",
    "title": "oa and ow patterns",
    "grade": 2,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.2.3.B"
    ],
    "prerequisites": [
      "g1-silent-e"
    ],
    "objective": "Recognize common long-o vowel teams"
  },
  {
    "id": "g2-r-controlled",
    "title": "r-controlled vowel patterns",
    "grade": 2,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.2.3.B"
    ],
    "prerequisites": [
      "g1-cvc-patterns"
    ],
    "objective": "Identify ar/or/er spelling patterns"
  },
  {
    "id": "g2-two-syllables",
    "title": "Two-syllable spelling patterns",
    "grade": 2,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.2.3.C"
    ],
    "prerequisites": [
      "g1-final-blends"
    ],
    "objective": "Recognize syllable chunks in familiar two-syllable words"
  },
  {
    "id": "g2-inflections",
    "title": "Inflectional endings",
    "grade": 2,
    "domain": "spelling",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.2.D"
    ],
    "prerequisites": [
      "g1-plural-s"
    ],
    "objective": "Form familiar words with -ing and -ed"
  },
  {
    "id": "g2-prefix-un-re",
    "title": "un- and re- prefixes",
    "grade": 2,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.4.B"
    ],
    "prerequisites": [],
    "objective": "Use common prefixes to infer meaning"
  },
  {
    "id": "g2-compounds",
    "title": "Compound word meaning",
    "grade": 2,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.4.D"
    ],
    "prerequisites": [],
    "objective": "Interpret and build familiar compound words"
  },
  {
    "id": "g2-contractions",
    "title": "Contractions and apostrophes",
    "grade": 2,
    "domain": "spelling",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.2.C"
    ],
    "prerequisites": [],
    "objective": "Relate common contractions to their expanded forms"
  },
  {
    "id": "g2-adjectives",
    "title": "Adjectives and descriptions",
    "grade": 2,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.1.E"
    ],
    "prerequisites": [],
    "objective": "Recognize words that describe nouns"
  },
  {
    "id": "g2-complete-sentences",
    "title": "Complete sentences",
    "grade": 2,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.2.1.F"
    ],
    "prerequisites": [
      "g1-punctuation"
    ],
    "objective": "Distinguish a complete thought from a fragment"
  },
  {
    "id": "g2-cause-effect",
    "title": "Cause and effect in stories",
    "grade": 2,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RL.2.3"
    ],
    "prerequisites": [
      "g1-story-details"
    ],
    "objective": "Identify causes and consequences explicitly supported by short text"
  },
  {
    "id": "g3-multisyllable",
    "title": "Common multisyllabic patterns",
    "grade": 3,
    "domain": "phonics",
    "standards": [
      "CCSS.ELA-LITERACY.RF.3.3.C"
    ],
    "prerequisites": [
      "g2-two-syllables"
    ],
    "objective": "Identify meaningful syllable divisions in longer words"
  },
  {
    "id": "g3-prefixes",
    "title": "Meaningful prefixes",
    "grade": 3,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.RF.3.3.A"
    ],
    "prerequisites": [
      "g2-prefix-un-re"
    ],
    "objective": "Use re-, un-, dis-, and pre- to interpret new words"
  },
  {
    "id": "g3-suffixes",
    "title": "Meaningful suffixes",
    "grade": 3,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.RF.3.3.B"
    ],
    "prerequisites": [
      "g2-inflections"
    ],
    "objective": "Use familiar suffixes to determine word meanings"
  },
  {
    "id": "g3-context-clues",
    "title": "Vocabulary from context",
    "grade": 3,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.4.A"
    ],
    "prerequisites": [
      "g2-compounds"
    ],
    "objective": "Use adjacent context to select a word meaning"
  },
  {
    "id": "g3-syn-ant",
    "title": "Synonyms and antonyms",
    "grade": 3,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.5.C"
    ],
    "prerequisites": [],
    "objective": "Distinguish similar and opposite meanings"
  },
  {
    "id": "g3-figurative",
    "title": "Literal and figurative meanings",
    "grade": 3,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.5.A"
    ],
    "prerequisites": [],
    "objective": "Interpret simple figurative language in context"
  },
  {
    "id": "g3-agreement",
    "title": "Subject–verb agreement",
    "grade": 3,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.1.F"
    ],
    "prerequisites": [
      "g2-complete-sentences"
    ],
    "objective": "Select correct present-tense verbs for singular/plural subjects"
  },
  {
    "id": "g3-tense",
    "title": "Consistent verb tense",
    "grade": 3,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.1.E"
    ],
    "prerequisites": [
      "g2-complete-sentences"
    ],
    "objective": "Use correct time relationships in sentence verbs"
  },
  {
    "id": "g3-quotation",
    "title": "Commas and quotation marks",
    "grade": 3,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.3.2.C"
    ],
    "prerequisites": [
      "g1-punctuation"
    ],
    "objective": "Apply conventions to simple dialogue"
  },
  {
    "id": "g3-main-idea",
    "title": "Main idea and supporting details",
    "grade": 3,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RI.3.2"
    ],
    "prerequisites": [
      "g2-cause-effect"
    ],
    "objective": "Identify the main idea of a short informational text"
  },
  {
    "id": "g3-inference",
    "title": "Evidence-based inference",
    "grade": 3,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RL.3.1"
    ],
    "prerequisites": [
      "g1-story-details"
    ],
    "objective": "Infer a character feeling or unstated cause from textual clues"
  },
  {
    "id": "g3-text-evidence",
    "title": "Support answers with text evidence",
    "grade": 3,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RI.3.1"
    ],
    "prerequisites": [
      "g3-main-idea"
    ],
    "objective": "Select passage details that support a claim"
  },
  {
    "id": "g4-roots",
    "title": "Greek and Latin roots",
    "grade": 4,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.4.B"
    ],
    "prerequisites": [
      "g3-prefixes"
    ],
    "objective": "Infer words from recurring roots such as tele, port, and spect"
  },
  {
    "id": "g4-word-meanings",
    "title": "Multiple-meaning vocabulary",
    "grade": 4,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.4.A"
    ],
    "prerequisites": [
      "g3-context-clues"
    ],
    "objective": "Disambiguate word meanings using sentence context"
  },
  {
    "id": "g4-precise-words",
    "title": "Precise word choices",
    "grade": 4,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.5.C"
    ],
    "prerequisites": [
      "g3-syn-ant"
    ],
    "objective": "Choose words with appropriate intensity and tone"
  },
  {
    "id": "g4-simile-metaphor",
    "title": "Similes and metaphors",
    "grade": 4,
    "domain": "vocabulary",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.5.A"
    ],
    "prerequisites": [
      "g3-figurative"
    ],
    "objective": "Interpret comparisons as literary language"
  },
  {
    "id": "g4-complex-sentences",
    "title": "Compound and complex sentences",
    "grade": 4,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.1.F"
    ],
    "prerequisites": [
      "g3-agreement"
    ],
    "objective": "Choose conjunctions that clarify relationships"
  },
  {
    "id": "g4-pronouns",
    "title": "Pronoun agreement",
    "grade": 4,
    "domain": "grammar",
    "standards": [
      "CCSS.ELA-LITERACY.L.4.1.A"
    ],
    "prerequisites": [
      "g3-agreement"
    ],
    "objective": "Match pronouns to clear, appropriate antecedents"
  },
  {
    "id": "g4-transitions",
    "title": "Paragraph transitions",
    "grade": 4,
    "domain": "writing",
    "standards": [
      "CCSS.ELA-LITERACY.W.4.2.C"
    ],
    "prerequisites": [
      "g3-main-idea"
    ],
    "objective": "Select transitions that accurately connect ideas"
  },
  {
    "id": "g4-viewpoint",
    "title": "Narrator point of view",
    "grade": 4,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RL.4.6"
    ],
    "prerequisites": [
      "g3-inference"
    ],
    "objective": "Identify the viewpoint used to tell a passage"
  },
  {
    "id": "g4-theme",
    "title": "Theme and supporting evidence",
    "grade": 4,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RL.4.2"
    ],
    "prerequisites": [
      "g3-inference"
    ],
    "objective": "Infer a story theme from events and outcomes"
  },
  {
    "id": "g4-compare-texts",
    "title": "Compare two texts",
    "grade": 4,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RI.4.9"
    ],
    "prerequisites": [
      "g3-text-evidence"
    ],
    "objective": "Compare explicit ideas across short passages"
  },
  {
    "id": "g4-evidence-inference",
    "title": "Evidence and inference",
    "grade": 4,
    "domain": "comprehension",
    "standards": [
      "CCSS.ELA-LITERACY.RI.4.1"
    ],
    "prerequisites": [
      "g3-text-evidence"
    ],
    "objective": "Identify which evidence justifies an inference"
  },
  {
    "id": "g4-revision",
    "title": "Revise an explanation",
    "grade": 4,
    "domain": "writing",
    "standards": [
      "CCSS.ELA-LITERACY.W.4.5"
    ],
    "prerequisites": [
      "g4-transitions"
    ],
    "objective": "Practice communicating an idea with concrete detail; open-ended work is unscored"
  }
];
const byId: ReadonlyMap<string,LanguageSkill> = new Map(LANGUAGE_SKILLS.map(s=>[s.id,s]));
export function getLanguageSkill(id:string):LanguageSkill { const skill=byId.get(id); if(!skill)throw Error('Unknown reviewed language skill: '+id); return skill; }
