import type {LanguageTemplateBank} from './content';
/** Curated Grade 2 practice, including short text-supported comprehension. */
export const LANGUAGE_G2: Record<string,LanguageTemplateBank> = {
  "g2-vowel-ai-ay": {
    "h": [
      "Look for ai inside a word or ay at its end.",
      "Both spell common long-a sounds.",
      "Compare the pattern with rain and day."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word contains ai?",
        "a": "rain",
        "d": [
          "ran",
          "ring",
          "run"
        ],
        "ex": "Rain contains the vowel team ai.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends with the team ay?",
        "a": "play",
        "d": [
          "plan",
          "plum",
          "plug"
        ],
        "ex": "Play ends in ay.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word follows the same long-a pattern as train?",
        "a": "paint",
        "d": [
          "past",
          "plant",
          "part"
        ],
        "ex": "Paint contains ai.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which pair contains two long-a vowel teams?",
        "a": "day and sail",
        "d": [
          "dad and sell",
          "dog and sit",
          "plan and flat"
        ],
        "ex": "Day has ay and sail has ai.",
        "t": 2
      }
    ]
  },
  "g2-vowel-ee-ea": {
    "h": [
      "Look for two vowels together.",
      "The ee and ea teams can spell long e.",
      "Check the vowels in the middle of the written word."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word contains ee?",
        "a": "seed",
        "d": [
          "sad",
          "side",
          "sand"
        ],
        "ex": "Seed contains ee.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word contains ea?",
        "a": "beach",
        "d": [
          "bench",
          "batch",
          "bunch"
        ],
        "ex": "Beach has ea.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word uses the same vowel team as green?",
        "a": "sheep",
        "d": [
          "ship",
          "shop",
          "shape"
        ],
        "ex": "Sheep and green have ee.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which pair shows the common long-e vowel teams?",
        "a": "feet and leaf",
        "d": [
          "fish and loaf",
          "fell and lap",
          "fast and lift"
        ],
        "ex": "Feet has ee and leaf has ea.",
        "t": 2
      }
    ]
  },
  "g2-vowel-oa-ow": {
    "h": [
      "Look for oa or ow.",
      "These teams often represent a long-o vowel.",
      "Find the pattern inside each answer before choosing."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word has oa?",
        "a": "boat",
        "d": [
          "bat",
          "bite",
          "but"
        ],
        "ex": "Boat uses oa.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends in ow for long o?",
        "a": "snow",
        "d": [
          "snack",
          "snip",
          "snap"
        ],
        "ex": "Snow uses ow.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has the same vowel team as road?",
        "a": "coat",
        "d": [
          "cot",
          "cut",
          "cat"
        ],
        "ex": "Road and coat have oa.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which pair uses two common long-o teams?",
        "a": "goat and grow",
        "d": [
          "got and grin",
          "gone and glad",
          "gum and grin"
        ],
        "ex": "Goat uses oa; grow uses ow.",
        "t": 2
      }
    ]
  },
  "g2-r-controlled": {
    "h": [
      "R changes how the vowel sounds.",
      "Look for ar, or, and er patterns.",
      "Underline the vowel and the r next to it."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word contains ar?",
        "a": "star",
        "d": [
          "stay",
          "step",
          "stem"
        ],
        "ex": "Star contains ar.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word contains or?",
        "a": "corn",
        "d": [
          "coin",
          "can",
          "cone"
        ],
        "ex": "Corn contains or.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word contains er?",
        "a": "herd",
        "d": [
          "hard",
          "hired",
          "heard"
        ],
        "ex": "Herd includes er.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which pair both show r-controlled spelling?",
        "a": "farm and fork",
        "d": [
          "film and fill",
          "fine and five",
          "fast and face"
        ],
        "ex": "Farm uses ar, and fork uses or.",
        "t": 2
      }
    ]
  },
  "g2-two-syllables": {
    "h": [
      "Each syllable is a beat in a spoken word.",
      "Say the word naturally, then listen for two beats.",
      "Choose the letter chunks that divide the word into familiar spoken parts."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which split gives the two syllables in sunset?",
        "a": "sun + set",
        "d": [
          "s + unset",
          "suns + et",
          "su + nset"
        ],
        "ex": "Sunset separates into sun and set.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which split fits rabbit?",
        "a": "rab + bit",
        "d": [
          "r + abbit",
          "ra + bbit",
          "rabb + it"
        ],
        "ex": "Rabbit has the syllables rab and bit.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has two syllables?",
        "a": "picnic",
        "d": [
          "cat",
          "tree",
          "fish"
        ],
        "ex": "Picnic can be spoken pic-nic.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which split fits paper?",
        "a": "pa + per",
        "d": [
          "pap + er",
          "p + aper",
          "pape + r"
        ],
        "ex": "Paper divides naturally into pa-per.",
        "t": 2
      }
    ]
  },
  "g2-inflections": {
    "h": [
      "The ending -ed often signals past time.",
      "The ending -ing often signals something happening.",
      "Check whether the base word stays the same or changes."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word tells that a jump already happened?",
        "a": "jumped",
        "d": [
          "jump",
          "jumping",
          "jumps"
        ],
        "ex": "Jumped is past tense.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word correctly adds -ing to help?",
        "a": "helping",
        "d": [
          "helped",
          "helpping",
          "helpinged"
        ],
        "ex": "Helping is help plus ing.",
        "t": 0
      },
      {
        "kind": "word-tiles",
        "q": "Build the past-tense word for play.",
        "a": "played",
        "ex": "Play becomes played.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which spelling correctly adds -ing to make?",
        "a": "making",
        "d": [
          "makeing",
          "makking",
          "maker"
        ],
        "ex": "Drop final e before adding -ing to make.",
        "t": 2
      }
    ]
  },
  "g2-prefix-un-re": {
    "h": [
      "A prefix goes at the beginning of a word.",
      "Un- often means not; re- often means again.",
      "Keep the meaning of the base word in mind."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does unhappy mean?",
        "a": "not happy",
        "d": [
          "very happy",
          "happy again",
          "almost happy"
        ],
        "ex": "The prefix un- means not.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does rewrite mean?",
        "a": "write again",
        "d": [
          "never write",
          "write less",
          "write quickly"
        ],
        "ex": "The prefix re- means again.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word means do again?",
        "a": "redo",
        "d": [
          "undo",
          "done",
          "doing"
        ],
        "ex": "Redo means do again.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word means not fair?",
        "a": "unfair",
        "d": [
          "refair",
          "fairly",
          "fairness"
        ],
        "ex": "Unfair adds un- meaning not.",
        "t": 2
      }
    ]
  },
  "g2-compounds": {
    "h": [
      "A compound word joins two smaller words.",
      "Read the parts, then think of the new idea.",
      "Choose the two words that combine into the correct expression."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which two words make sunshine?",
        "a": "sun + shine",
        "d": [
          "sun + ship",
          "sand + shine",
          "sun + sign"
        ],
        "ex": "Sunshine combines sun and shine.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which two words make toothbrush?",
        "a": "tooth + brush",
        "d": [
          "tool + brush",
          "tooth + bush",
          "tooth + broom"
        ],
        "ex": "Toothbrush combines tooth and brush.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word means a house for birds?",
        "a": "birdhouse",
        "d": [
          "treehouse",
          "doghouse",
          "greenhouse"
        ],
        "ex": "Birdhouse joins bird and house.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which two words form raincoat?",
        "a": "rain + coat",
        "d": [
          "rain + boat",
          "ray + coat",
          "rain + cat"
        ],
        "ex": "Raincoat joins rain and coat.",
        "t": 2
      }
    ]
  },
  "g2-contractions": {
    "h": [
      "A contraction shortens two words.",
      "An apostrophe marks missing letters.",
      "Read both forms to see whether they mean the same thing."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which contraction means do not?",
        "a": "don't",
        "d": [
          "doesn't",
          "didn't",
          "isn't"
        ],
        "ex": "Don't means do not.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which contraction means I am?",
        "a": "I'm",
        "d": [
          "I'll",
          "I've",
          "isn't"
        ],
        "ex": "I'm means I am.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which two words become can't?",
        "a": "cannot",
        "d": [
          "can do",
          "can have",
          "can go"
        ],
        "ex": "Can't contracts cannot.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which contraction means they are?",
        "a": "they're",
        "d": [
          "their",
          "there",
          "they'll"
        ],
        "ex": "They're means they are.",
        "t": 2
      }
    ]
  },
  "g2-adjectives": {
    "h": [
      "An adjective describes a person, place, or thing.",
      "Ask which word tells what a noun is like.",
      "Check which word adds a detail about the named object."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word describes the noun in: The fluffy cat slept?",
        "a": "fluffy",
        "d": [
          "cat",
          "slept",
          "the"
        ],
        "ex": "Fluffy describes the cat.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word describes the ball: a red ball?",
        "a": "red",
        "d": [
          "ball",
          "a",
          "bounce"
        ],
        "ex": "Red tells the color of ball.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose a describing word for: The ___ soup was hot.",
        "a": "spicy",
        "d": [
          "eat",
          "bowl",
          "stir"
        ],
        "ex": "Spicy is an adjective that describes soup.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word is an adjective in: Five bright stars shone?",
        "a": "bright",
        "d": [
          "stars",
          "shone",
          "five times"
        ],
        "ex": "Bright describes the stars.",
        "t": 2
      }
    ]
  },
  "g2-complete-sentences": {
    "h": [
      "A sentence needs a complete thought.",
      "Check for a subject and an action or description.",
      "A fragment can leave you waiting for something more."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which is a complete sentence?",
        "a": "The bird sings.",
        "d": [
          "Under the tall tree.",
          "Because it is sunny.",
          "A red and blue."
        ],
        "ex": "The bird sings has a subject and verb.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which is a complete sentence?",
        "a": "I opened the box.",
        "d": [
          "In the green box.",
          "After the big game.",
          "On a yellow."
        ],
        "ex": "I opened the box forms a complete thought.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which choice completes: The puppy ___ .",
        "a": "ran home",
        "d": [
          "in the house",
          "very soft",
          "under the"
        ],
        "ex": "The puppy ran home is a sentence.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which is a fragment?",
        "a": "When the bell rang.",
        "d": [
          "The bell rang.",
          "We packed our bags.",
          "The room became quiet."
        ],
        "ex": "When the bell rang leaves the reader expecting a main clause.",
        "t": 2
      }
    ]
  },
  "g2-cause-effect": {
    "h": [
      "Find what happened first and what happened next.",
      "Look for a word like because or so.",
      "A cause explains why an event happened."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Why did Ava put on boots?",
        "a": "The ground was wet",
        "d": [
          "Her books were heavy",
          "She wanted a snack",
          "Her lamp was broken"
        ],
        "ex": "The wet ground explains why Ava chose boots.",
        "t": 0,
        "passage": "Rain fell all night. The path was wet. Ava put on her boots."
      },
      {
        "kind": "choice",
        "q": "What happened because the bird was hungry?",
        "a": "It searched for seeds",
        "d": [
          "It went swimming",
          "It made a nest",
          "It flew to the moon"
        ],
        "ex": "The bird looked for seeds because it was hungry.",
        "t": 0,
        "passage": "The bird had no food. It was hungry, so it searched the ground for seeds."
      },
      {
        "kind": "choice",
        "q": "What made the picnic move indoors?",
        "a": "Dark clouds and rain",
        "d": [
          "A bright sun",
          "A missing plate",
          "A loud song"
        ],
        "ex": "Rain caused the picnic to move inside.",
        "t": 1,
        "passage": "Clouds covered the sky and drops began to fall. The family carried the picnic inside."
      },
      {
        "kind": "choice",
        "q": "Why did Milo return to the garden?",
        "a": "He had left his watering can",
        "d": [
          "He wanted to read",
          "The bus had arrived",
          "His toy broke"
        ],
        "ex": "The passage says Milo remembered the watering can.",
        "t": 2,
        "passage": "Milo walked home after planting seeds. At the gate, he remembered his watering can beside the flowers. He turned around."
      }
    ]
  }
};
