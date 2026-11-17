import type {LanguageTemplateBank} from './content';
/** Curated, local Grade 1 exemplars. Reading recognition here is not an oral-fluency assessment. */
export const LANGUAGE_G1: Record<string,LanguageTemplateBank> = {
  "g1-initial-letters": {
    "h": [
      "Look at the first letter in each word.",
      "Say the beginning of the example word slowly.",
      "Find a word that begins with the same letter and sound."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word begins like sun?",
        "a": "sit",
        "d": [
          "map",
          "tap",
          "bed"
        ],
        "ex": "Sun and sit both begin with s.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word begins like moon?",
        "a": "mat",
        "d": [
          "lip",
          "net",
          "sun"
        ],
        "ex": "Moon and mat both begin with m.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word begins like fish?",
        "a": "fan",
        "d": [
          "pig",
          "van",
          "hat"
        ],
        "ex": "Fish and fan both begin with f.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word begins like rabbit?",
        "a": "red",
        "d": [
          "let",
          "bat",
          "sun"
        ],
        "ex": "Rabbit and red both begin with r.",
        "t": 2
      }
    ]
  },
  "g1-cvc-patterns": {
    "h": [
      "Find the vowel in the middle of the word.",
      "A short vowel sits between two consonants here.",
      "Read each word from left to right; blend its parts."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word has three letters: consonant, vowel, consonant?",
        "a": "dog",
        "d": [
          "rain",
          "tree",
          "ship"
        ],
        "ex": "Dog follows d-o-g, a consonant-vowel-consonant pattern.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word matches the CVC pattern?",
        "a": "fin",
        "d": [
          "feet",
          "gate",
          "train"
        ],
        "ex": "Fin has the three-letter pattern f-i-n.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word follows CVC?",
        "a": "mud",
        "d": [
          "milk",
          "moon",
          "kite"
        ],
        "ex": "Mud is m-u-d, a CVC word.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word has the CVC pattern and ends in t?",
        "a": "hat",
        "d": [
          "heat",
          "hand",
          "hose"
        ],
        "ex": "Hat has three letters and ends with t.",
        "t": 2
      }
    ]
  },
  "g1-short-a-e": {
    "h": [
      "Find the one vowel in the middle.",
      "Read the example aloud slowly if you can.",
      "Short a is like apple; short e is like egg."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word uses short a, as in cat?",
        "a": "map",
        "d": [
          "me",
          "mine",
          "moon"
        ],
        "ex": "Map uses the short-a spelling pattern.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word uses short e, as in bed?",
        "a": "pen",
        "d": [
          "pan",
          "pine",
          "pond"
        ],
        "ex": "Pen has the short-e sound.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has the same middle vowel as bag?",
        "a": "tap",
        "d": [
          "ten",
          "top",
          "tip"
        ],
        "ex": "Bag and tap both have middle a.",
        "t": 1
      },
      {
        "kind": "word-tiles",
        "q": "Build the word for something you wear on your head. It has three letters.",
        "a": "hat",
        "ex": "Hat is spelled h-a-t with short a.",
        "t": 2
      }
    ]
  },
  "g1-short-i-o-u": {
    "h": [
      "Look in the middle for i, o, or u.",
      "Say the vowel briefly, not its letter name.",
      "Blend the first sound, short vowel, and last sound."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word has short i, as in sit?",
        "a": "pig",
        "d": [
          "peg",
          "pug",
          "page"
        ],
        "ex": "Pig has short i.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has short o, as in hot?",
        "a": "log",
        "d": [
          "leg",
          "lag",
          "lake"
        ],
        "ex": "Log has short o.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has short u, as in cup?",
        "a": "sun",
        "d": [
          "sin",
          "son",
          "seen"
        ],
        "ex": "Sun has short u.",
        "t": 1
      },
      {
        "kind": "word-tiles",
        "q": "Build the three-letter word for the star that lights our day.",
        "a": "sun",
        "ex": "Sun has three letters: s-u-n.",
        "t": 2
      }
    ]
  },
  "g1-digraph-sh-ch": {
    "h": [
      "Two letters can make one sound.",
      "Look for sh and ch side by side.",
      "Compare the word beginning or ending with the taught letter pair."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word begins with sh?",
        "a": "shop",
        "d": [
          "chop",
          "stop",
          "top"
        ],
        "ex": "Shop begins with s-h.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word begins with ch?",
        "a": "chip",
        "d": [
          "ship",
          "slip",
          "flip"
        ],
        "ex": "Chip begins with c-h.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends with sh?",
        "a": "fish",
        "d": [
          "fit",
          "find",
          "fin"
        ],
        "ex": "Fish ends with s-h.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word ends with ch?",
        "a": "rich",
        "d": [
          "ring",
          "rise",
          "rush"
        ],
        "ex": "Rich ends with c-h.",
        "t": 2
      }
    ]
  },
  "g1-digraph-th-wh": {
    "h": [
      "Find a pair of letters that works together.",
      "Th is t and h together; wh is w and h together.",
      "Look at the first two letters of each answer."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word begins with th?",
        "a": "thin",
        "d": [
          "tin",
          "ten",
          "win"
        ],
        "ex": "Thin begins with t-h.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word begins with wh?",
        "a": "when",
        "d": [
          "wen",
          "hen",
          "wet"
        ],
        "ex": "When begins with w-h.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends with th?",
        "a": "bath",
        "d": [
          "bat",
          "back",
          "bank"
        ],
        "ex": "Bath ends with t-h.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word contains the letters th?",
        "a": "three",
        "d": [
          "tree",
          "free",
          "green"
        ],
        "ex": "Three has t-h at the beginning.",
        "t": 2
      }
    ]
  },
  "g1-final-blends": {
    "h": [
      "Look at the last two consonants.",
      "Say the ending letters separately, then together.",
      "Find two consonants together at the end."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word ends with st?",
        "a": "nest",
        "d": [
          "net",
          "need",
          "nice"
        ],
        "ex": "Nest ends with s-t.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends with nd?",
        "a": "hand",
        "d": [
          "hat",
          "hang",
          "hard"
        ],
        "ex": "Hand ends in n-d.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word ends with mp?",
        "a": "lamp",
        "d": [
          "lap",
          "late",
          "lime"
        ],
        "ex": "Lamp ends in m-p.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word ends with nk?",
        "a": "sink",
        "d": [
          "sip",
          "side",
          "sick"
        ],
        "ex": "Sink ends in n-k.",
        "t": 2
      }
    ]
  },
  "g1-silent-e": {
    "h": [
      "Look at the last letter of the word.",
      "A final e can change how an earlier vowel is read.",
      "Compare the short vowel word with the word that has an extra e."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word has a silent final e?",
        "a": "cake",
        "d": [
          "cat",
          "cap",
          "can"
        ],
        "ex": "Cake ends in e; a can say its long sound.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has the same a_e pattern as make?",
        "a": "lake",
        "d": [
          "lack",
          "lamp",
          "land"
        ],
        "ex": "Lake has a consonant between a and final e.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which new word comes from adding final e to kit?",
        "a": "kite",
        "d": [
          "kitee",
          "kits",
          "kith"
        ],
        "ex": "Adding e to kit gives kite.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which pair shows a change made by final e?",
        "a": "hop → hope",
        "d": [
          "hat → hats",
          "pet → pets",
          "sit → sits"
        ],
        "ex": "Hop changes to hope when final e is added.",
        "t": 2
      }
    ]
  },
  "g1-plural-s": {
    "h": [
      "One item is singular; more than one is plural.",
      "For these regular nouns, add s at the end.",
      "Keep the rest of the word unchanged."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "You have two cats. Choose the plural word.",
        "a": "cats",
        "d": [
          "cat",
          "cates",
          "catz"
        ],
        "ex": "Add s to cat to make cats.",
        "t": 0
      },
      {
        "kind": "word-tiles",
        "q": "Build the word for more than one dog.",
        "a": "dogs",
        "ex": "The regular plural of dog is dogs.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word means more than one cup?",
        "a": "cups",
        "d": [
          "cup",
          "cuppe",
          "cupes"
        ],
        "ex": "Cup becomes cups with -s.",
        "t": 1
      },
      {
        "kind": "word-tiles",
        "q": "Build the word for three frogs.",
        "a": "frogs",
        "ex": "Frog becomes frogs when you add -s.",
        "t": 2
      }
    ]
  },
  "g1-irregular-words": {
    "h": [
      "Some common words do not follow the simplest sound pattern.",
      "Look carefully at the letter order.",
      "Think of the whole word you have seen in books."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word is spelled correctly?",
        "a": "said",
        "d": [
          "sed",
          "saed",
          "sayed"
        ],
        "ex": "Said has the letters s-a-i-d.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word is spelled correctly?",
        "a": "does",
        "d": [
          "duz",
          "doze",
          "dos"
        ],
        "ex": "Does is spelled d-o-e-s.",
        "t": 0
      },
      {
        "kind": "word-tiles",
        "q": "Build the word that completes: I ___ a red ball. The missing word rhymes with have.",
        "a": "have",
        "ex": "Have is a common irregular word.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Choose the correct spelling to finish: ___ are my shoes.",
        "a": "These",
        "d": [
          "Thees",
          "Theze",
          "Thes"
        ],
        "ex": "These is spelled t-h-e-s-e.",
        "t": 2
      }
    ]
  },
  "g1-punctuation": {
    "h": [
      "Ask whether it is a statement, question, or exclamation.",
      "Questions usually end with a question mark.",
      "Match the sentence purpose to . ? or !."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which mark ends: Where is my hat",
        "a": "?",
        "d": [
          ".",
          "!",
          ","
        ],
        "ex": "A direct question ends in a question mark.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which mark ends: The dog is asleep",
        "a": ".",
        "d": [
          "?",
          "!",
          ","
        ],
        "ex": "A statement ends with a period.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which mark best ends: Wow, that is huge",
        "a": "!",
        "d": [
          ".",
          ",",
          "?"
        ],
        "ex": "An exciting exclamation can end with an exclamation mark.",
        "t": 1
      },
      {
        "kind": "edit",
        "q": "Write this sentence with a capital and an ending mark: the sun is hot",
        "a": "The sun is hot.",
        "ex": "A statement begins with a capital and ends with a period.",
        "t": 2
      }
    ]
  },
  "g1-story-details": {
    "h": [
      "Read the short passage once all the way through.",
      "Look back for the exact detail mentioned.",
      "Choose what the passage tells you—not what could happen."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What color is the hat?",
        "a": "red",
        "d": [
          "blue",
          "yellow",
          "green"
        ],
        "ex": "The passage says the hat is red.",
        "t": 0,
        "passage": "Sam has a red hat. He puts it on."
      },
      {
        "kind": "choice",
        "q": "What does Kim feed the pet?",
        "a": "fish",
        "d": [
          "cake",
          "corn",
          "rice"
        ],
        "ex": "The text says Kim gives the cat fish.",
        "t": 0,
        "passage": "Kim has a cat. She gives it fish. The cat eats."
      },
      {
        "kind": "choice",
        "q": "Where did the ball go?",
        "a": "under a bench",
        "d": [
          "into a pond",
          "on a roof",
          "inside a bag"
        ],
        "ex": "The ball rolls under a bench.",
        "t": 1,
        "passage": "Ben kicks a ball. It rolls under a bench. Ben bends down to get it."
      },
      {
        "kind": "choice",
        "q": "Why did Mia get a coat?",
        "a": "It began to rain",
        "d": [
          "She wanted to swim",
          "The day became hot",
          "Her shoes were lost"
        ],
        "ex": "The passage says rain began before Mia picked up her coat.",
        "t": 2,
        "passage": "Mia sees gray clouds. Rain drops fall. She gets her coat from the hook."
      }
    ]
  }
};
