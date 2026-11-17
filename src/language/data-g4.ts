import type {LanguageTemplateBank} from './content';
/** Curated Grade 4 advanced language, comprehension and unscored expression. */
export const LANGUAGE_G4: Record<string,LanguageTemplateBank> = {
  "g4-roots": {
    "h": [
      "Look for a root that carries meaning across many words.",
      "Tele is far, port is carry, spect is look, and geo is earth.",
      "Combine the root with the rest of the word before selecting a meaning."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does the root tele suggest in telephone?",
        "a": "distance",
        "d": [
          "color",
          "water",
          "speed"
        ],
        "ex": "Tele relates to distance; a telephone carries a voice across distance.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does transport most closely mean?",
        "a": "carry across or from place to place",
        "d": [
          "look again",
          "draw pictures",
          "stay still"
        ],
        "ex": "Port means carry; transport means carry from one place to another.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does inspect most nearly mean?",
        "a": "look at carefully",
        "d": [
          "carry quickly",
          "write again",
          "grow larger"
        ],
        "ex": "Spect means look.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word uses a root meaning earth?",
        "a": "geology",
        "d": [
          "telephone",
          "inspect",
          "transport"
        ],
        "ex": "Geo means earth.",
        "t": 2
      }
    ]
  },
  "g4-word-meanings": {
    "h": [
      "The same written word can have different meanings.",
      "Use the sentence around it to identify the intended meaning.",
      "Choose the definition that fits the action and context."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does bank mean here?",
        "a": "the side of a river",
        "d": [
          "a money business",
          "a row of buttons",
          "a container"
        ],
        "ex": "The sentence describes sitting beside a river.",
        "t": 0,
        "passage": "We ate lunch on the grassy bank beside the river."
      },
      {
        "kind": "choice",
        "q": "What does light mean here?",
        "a": "not heavy",
        "d": [
          "a lamp",
          "sunshine",
          "a pale color"
        ],
        "ex": "Lifting a box easily suggests it is not heavy.",
        "t": 0,
        "passage": "The box was light enough for Jo to lift with one hand."
      },
      {
        "kind": "choice",
        "q": "What does draft mean here?",
        "a": "an early version of writing",
        "d": [
          "a cool breeze",
          "a drawing compass",
          "a sports team selection"
        ],
        "ex": "Revising writing suggests the early-version meaning of draft.",
        "t": 1,
        "passage": "Before sharing her report, Nia read the first draft and revised two paragraphs."
      },
      {
        "kind": "choice",
        "q": "What does scale mean in this sentence?",
        "a": "a tool for measuring weight",
        "d": [
          "the skin of a fish",
          "a series of musical notes",
          "to climb a wall"
        ],
        "ex": "Placing oranges on the scale shows a weighing instrument.",
        "t": 2,
        "passage": "At the market, the seller put the oranges on a scale to check their weight."
      }
    ]
  },
  "g4-precise-words": {
    "h": [
      "Words can differ in strength even when they are related.",
      "Ask how much intensity the sentence needs.",
      "Choose a word that is neither too weak nor too strong for the facts."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word best conveys a very loud sound?",
        "a": "deafening",
        "d": [
          "soft",
          "quiet",
          "faint"
        ],
        "ex": "Deafening means extremely loud.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word means a small amount of anger?",
        "a": "annoyed",
        "d": [
          "furious",
          "enraged",
          "livid"
        ],
        "ex": "Annoyed can express less intense anger than furious.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word suggests walking slowly and without energy?",
        "a": "trudged",
        "d": [
          "sprinted",
          "dashed",
          "bounded"
        ],
        "ex": "Trudged suggests slow, effortful walking.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word best shows that a child looked quickly at a clock?",
        "a": "glanced",
        "d": [
          "stared",
          "studied",
          "examined"
        ],
        "ex": "Glanced suggests a brief look.",
        "t": 2
      }
    ]
  },
  "g4-simile-metaphor": {
    "h": [
      "A simile compares using like or as.",
      "A metaphor directly says one thing is another to suggest a quality.",
      "Find the shared quality; do not take a figurative comparison literally."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does as quiet as a mouse suggest?",
        "a": "very quiet",
        "d": [
          "small and gray",
          "afraid of cheese",
          "running fast"
        ],
        "ex": "The simile compares quietness.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does the metaphor 'Her smile was sunshine' suggest?",
        "a": "her smile brought warmth or happiness",
        "d": [
          "her face emitted actual light",
          "she went outside",
          "she wore yellow"
        ],
        "ex": "A metaphor describes the happy effect of her smile.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which sentence contains a simile?",
        "a": "The river glittered like diamonds.",
        "d": [
          "The river is cold.",
          "The river moved quickly.",
          "The river crossed a valley."
        ],
        "ex": "Like marks an explicit comparison in a simile.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "What does the classroom was a beehive of activity mean?",
        "a": "everyone was busy and active",
        "d": [
          "there were real bees inside",
          "the classroom was made of wax",
          "nobody was working"
        ],
        "ex": "The metaphor compares bustling activity to a beehive.",
        "t": 2
      }
    ]
  },
  "g4-complex-sentences": {
    "h": [
      "Conjunctions show relationships between ideas.",
      "Because explains a reason; although can show contrast.",
      "Choose a connector that matches the logic of the two clauses."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word gives the reason? We stayed inside ___ it was raining.",
        "a": "because",
        "d": [
          "although",
          "unless",
          "until"
        ],
        "ex": "Because introduces the reason for staying inside.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word shows a contrast? ___ the race was hard, Eva kept going.",
        "a": "Although",
        "d": [
          "Because",
          "Before",
          "Unless"
        ],
        "ex": "Although shows contrast between difficulty and persistence.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which sentence shows a condition?",
        "a": "If the rain stops, we will play outside.",
        "d": [
          "The rain stopped, and we played.",
          "We played after lunch.",
          "The rain was loud."
        ],
        "ex": "If introduces a condition.",
        "t": 1
      },
      {
        "kind": "sentence-tiles",
        "q": "Arrange a clear sentence about a reason.",
        "a": "We stayed home because the roads were icy.",
        "ex": "Because connects the icy roads to the decision to stay home.",
        "t": 2
      }
    ]
  },
  "g4-pronouns": {
    "h": [
      "A pronoun should refer clearly to a noun.",
      "Singular pronouns should match singular subjects; plural pronouns match plural ones.",
      "Read the entire sentence and identify who each pronoun means."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Choose: Mia found her hat. ___ put it on.",
        "a": "She",
        "d": [
          "They",
          "We",
          "It"
        ],
        "ex": "She refers to the singular person Mia.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: The players packed ___ bags.",
        "a": "their",
        "d": [
          "his",
          "its",
          "her"
        ],
        "ex": "Their agrees with plural players.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: Ben and Kai finished, and ___ went home.",
        "a": "they",
        "d": [
          "he",
          "it",
          "she"
        ],
        "ex": "They refers to the two people.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which sentence has the clearest pronoun reference?",
        "a": "When Liam spoke to Noah, Liam smiled.",
        "d": [
          "When Liam spoke to Noah, he smiled.",
          "After he saw him, he waved.",
          "He spoke to him and smiled."
        ],
        "ex": "Repeating Liam removes uncertainty about who smiled.",
        "t": 2
      }
    ]
  },
  "g4-transitions": {
    "h": [
      "First identify whether the next sentence contrasts, adds, or concludes.",
      "However signals contrast; for example introduces evidence.",
      "A transition should connect ideas logically, not decorate the sentence."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Choose: The hike was long. ___, we enjoyed every minute.",
        "a": "However",
        "d": [
          "For example",
          "First",
          "Because"
        ],
        "ex": "However shows a contrast between length and enjoyment.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: Many birds migrate. ___, swallows fly south for winter.",
        "a": "For example",
        "d": [
          "However",
          "Instead",
          "Nevertheless"
        ],
        "ex": "For example introduces a supporting example.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: We planned the garden, planted seeds, and watered them. ___, the first sprouts appeared.",
        "a": "Finally",
        "d": [
          "On the other hand",
          "Despite that",
          "For instance"
        ],
        "ex": "Finally describes the outcome at the end of a sequence.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Choose the best transition: The first proposal costs less. ___, the second lasts longer.",
        "a": "On the other hand",
        "d": [
          "As a result",
          "For instance",
          "Similarly"
        ],
        "ex": "On the other hand presents a contrasting advantage.",
        "t": 2
      }
    ]
  },
  "g4-viewpoint": {
    "h": [
      "I, me, and we often signal first-person narration.",
      "He, she, and they commonly appear in third-person narration.",
      "Identify who is telling the story, not just who is in it."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which point of view is this?",
        "a": "first person",
        "d": [
          "third person",
          "second person",
          "unknown"
        ],
        "ex": "The narrator says I and tells their own actions.",
        "t": 0,
        "passage": "I carried my lantern along the path. I hoped to reach camp before dark."
      },
      {
        "kind": "choice",
        "q": "Which point of view is this?",
        "a": "third person",
        "d": [
          "first person",
          "second person",
          "both"
        ],
        "ex": "The story describes Lena using she.",
        "t": 0,
        "passage": "Lena found a shell and put it in her pocket. She smiled."
      },
      {
        "kind": "choice",
        "q": "Which word best shows a first-person narrator?",
        "a": "we",
        "d": [
          "she",
          "they",
          "Maya"
        ],
        "ex": "We indicates the narrator is participating.",
        "t": 1,
        "passage": "We waited for the gates to open, holding tickets in our hands."
      },
      {
        "kind": "choice",
        "q": "Which clue shows this passage uses third-person narration?",
        "a": "The narrator describes someone else as he",
        "d": [
          "The narrator says I",
          "The passage has only dialogue",
          "Every sentence is a question"
        ],
        "ex": "He refers to Arlo from outside his own viewpoint.",
        "t": 2,
        "passage": "Arlo held the map tightly. He checked the trail signs before crossing the bridge."
      }
    ]
  },
  "g4-theme": {
    "h": [
      "Theme is a bigger message, not just a plot event.",
      "Look at the challenge, the choice, and its result.",
      "Pick an idea supported by the whole story without claiming more than it shows."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which theme fits the story?",
        "a": "Helping others can bring people together",
        "d": [
          "Bread is always delicious",
          "Rain ruins every day",
          "Dogs love swimming"
        ],
        "ex": "Everyone contributes and shares the result.",
        "t": 0,
        "passage": "When the bake sale was almost canceled, friends helped set up tables. Each person brought one thing, and they enjoyed the day together."
      },
      {
        "kind": "choice",
        "q": "Which theme fits the passage?",
        "a": "Practice can improve a skill",
        "d": [
          "Music is always easy",
          "All performances are perfect",
          "Only adults can learn music"
        ],
        "ex": "The character improves by repeated practice.",
        "t": 0,
        "passage": "Jo kept making mistakes on the piano. She practiced a little each day. At the recital, she played the song with confidence."
      },
      {
        "kind": "choice",
        "q": "Which theme fits the story?",
        "a": "Honesty helps rebuild trust",
        "d": [
          "Losing keys is fun",
          "Every secret is harmless",
          "The oldest child always wins"
        ],
        "ex": "Admitting a mistake leads to a more trusting response.",
        "t": 1,
        "passage": "Cal accidentally broke a cup and hid the pieces. His sister worried that the cup had vanished. Cal finally told the truth and helped clean up."
      },
      {
        "kind": "choice",
        "q": "Which theme is best supported?",
        "a": "Courage means acting despite fear",
        "d": [
          "Bridges are always safe",
          "Fear proves you are weak",
          "Friends never need help"
        ],
        "ex": "Despite fear, Mina crosses carefully to assist.",
        "t": 2,
        "passage": "Mina feared the narrow bridge. When her friend needed help on the other side, she checked the rails, took one careful step at a time, and crossed."
      }
    ]
  },
  "g4-compare-texts": {
    "h": [
      "Identify what each author says about the same topic.",
      "Find a detail common to both passages or a difference between them.",
      "Do not combine claims that only one passage supports."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What do both texts say?",
        "a": "Both animals use shelters",
        "d": [
          "Both animals live underwater",
          "Both animals eat only leaves",
          "Both animals sleep in trees"
        ],
        "ex": "One describes a den, the other a burrow.",
        "t": 0,
        "passage": "Text A: A fox rests in a den under the ground.\nText B: A rabbit hides in a burrow below the soil."
      },
      {
        "kind": "choice",
        "q": "How are the texts different?",
        "a": "A discusses wind power; B discusses solar power",
        "d": [
          "Both describe the same technology",
          "A describes ocean currents; B describes trees",
          "Neither mentions energy"
        ],
        "ex": "Wind turbines are discussed in A, and sunlight in B.",
        "t": 0,
        "passage": "Text A: Wind turbines use moving air to generate electricity.\nText B: Solar panels use sunlight to generate electricity."
      },
      {
        "kind": "choice",
        "q": "What is a shared idea?",
        "a": "Both writers describe ways to keep soil healthy",
        "d": [
          "Both recommend never watering plants",
          "Both discuss sports",
          "Both say soil does not matter"
        ],
        "ex": "Compost and mulch both support soil health.",
        "t": 1,
        "passage": "Text A: Adding compost can improve garden soil.\nText B: Covering soil with mulch helps it hold moisture."
      },
      {
        "kind": "choice",
        "q": "What is one difference in focus?",
        "a": "A stresses exploration; B stresses protecting the habitat",
        "d": [
          "Both focus only on safety equipment",
          "A argues nobody should visit",
          "B discusses spaceship design"
        ],
        "ex": "The first stresses discovery; the second stresses caring for visited places.",
        "t": 2,
        "passage": "Text A: Visiting natural parks lets people discover plants and wildlife.\nText B: Park visitors should stay on trails to protect fragile habitats."
      }
    ]
  },
  "g4-evidence-inference": {
    "h": [
      "An inference goes beyond exact words but needs proof.",
      "Find the details that support the conclusion.",
      "Reject conclusions that sound possible but have no supporting evidence."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which inference is best supported?",
        "a": "The shop is likely closed",
        "d": [
          "The shop sells fruit",
          "The owner is asleep",
          "The shop has moved"
        ],
        "ex": "A locked door and closed sign are evidence the shop is closed.",
        "t": 0,
        "passage": "The door was locked, the lights were off, and a sign read Closed."
      },
      {
        "kind": "choice",
        "q": "Which inference is best supported?",
        "a": "The team worked together",
        "d": [
          "The team refused help",
          "The project was canceled",
          "Only one person did the work"
        ],
        "ex": "Each person completed a part of the project.",
        "t": 0,
        "passage": "Maya drew the plan, Theo collected supplies, and Inez assembled the model. Together, they finished on time."
      },
      {
        "kind": "choice",
        "q": "Which detail supports that the hill was difficult to climb?",
        "a": "The hikers paused often to catch their breath",
        "d": [
          "The sun was bright",
          "They had backpacks",
          "The trail began early"
        ],
        "ex": "Frequent breaks for breath support difficulty.",
        "t": 1,
        "passage": "The path rose sharply. The hikers paused again and again to catch their breath before reaching the top."
      },
      {
        "kind": "choice",
        "q": "Which conclusion is most defensible?",
        "a": "The scientist repeated the trial to check the result",
        "d": [
          "The scientist disliked the lab",
          "The scientist had no tools",
          "The result was certainly wrong"
        ],
        "ex": "Repeating a trial is consistent with checking whether a result is reliable.",
        "t": 2,
        "passage": "The scientist recorded a surprising measurement. Before reporting it, she cleaned the tools and repeated the trial twice."
      }
    ]
  },
  "g4-revision": {
    "h": [
      "Think of one clear idea you want the reader to understand.",
      "Add a specific detail or example to make it easier to imagine.",
      "Read your sentence back and revise one part for clarity."
    ],
    "items": [
      {
        "kind": "creative",
        "q": "Write one sentence about a place your game character discovers. Add one detail a reader could picture.",
        "a": "",
        "ex": "This is open-ended expression. Ask the child to reread for a vivid detail.",
        "t": 0
      },
      {
        "kind": "creative",
        "q": "Write two sentences explaining how a character solves a problem. Try using because or so.",
        "a": "",
        "ex": "This is unscored writing practice; check that the reason connects clearly.",
        "t": 0
      },
      {
        "kind": "creative",
        "q": "Describe a strange new invention. Give it a name and explain one thing it does.",
        "a": "",
        "ex": "This is open-ended practice; notice specificity and clarity, not a single answer.",
        "t": 1
      },
      {
        "kind": "creative",
        "q": "Revise this plain idea into two vivid sentences: The dragon went somewhere.",
        "a": "",
        "ex": "This is creative composition; model how to add where, why, and an action without assigning a mastery grade.",
        "t": 2
      }
    ]
  }
};
