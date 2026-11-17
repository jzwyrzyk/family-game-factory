import type {LanguageTemplateBank} from './content';
/** Curated Grade 3 language and short-passage tasks. */
export const LANGUAGE_G3: Record<string,LanguageTemplateBank> = {
  "g3-multisyllable": {
    "h": [
      "Find the vowels in the longer word.",
      "Say the word slowly in spoken beats.",
      "Look for familiar word parts inside it."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which split divides fantastic into syllables?",
        "a": "fan + tas + tic",
        "d": [
          "fant + astic",
          "f + antastic",
          "fanta + stic"
        ],
        "ex": "Fantastic has three common syllable chunks: fan-tas-tic.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word has three syllables?",
        "a": "animal",
        "d": [
          "basket",
          "rabbit",
          "sunset"
        ],
        "ex": "Animal is commonly spoken an-i-mal.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which division fits banana?",
        "a": "ba + na + na",
        "d": [
          "ban + ana",
          "bana + na + na",
          "ba + nan + ana"
        ],
        "ex": "Banana has three spoken syllables: ba-na-na.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word has four syllables?",
        "a": "calculator",
        "d": [
          "computer",
          "elephant",
          "calendar"
        ],
        "ex": "Calculator is commonly pronounced cal-cu-la-tor.",
        "t": 2
      }
    ]
  },
  "g3-prefixes": {
    "h": [
      "A prefix is added before the base word.",
      "Dis- often means not or opposite; pre- means before.",
      "Identify the base word, then apply the prefix meaning."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does disagree mean?",
        "a": "not agree",
        "d": [
          "agree twice",
          "agree loudly",
          "agree later"
        ],
        "ex": "Disagree adds dis- to agree.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does preheat mean?",
        "a": "heat before",
        "d": [
          "heat again",
          "cool down",
          "heat less"
        ],
        "ex": "Preheat uses pre- to mean before.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does rebuild mean?",
        "a": "build again",
        "d": [
          "not build",
          "build early",
          "build smaller"
        ],
        "ex": "Rebuild uses re- meaning again.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word means not honest?",
        "a": "dishonest",
        "d": [
          "rehonest",
          "prehonest",
          "honestly"
        ],
        "ex": "Dishonest means not honest.",
        "t": 2
      }
    ]
  },
  "g3-suffixes": {
    "h": [
      "A suffix is placed after a base word.",
      "-less can mean without and -ful can mean full of.",
      "Keep the meaning of the base word while considering the ending."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does hopeless mean?",
        "a": "without hope",
        "d": [
          "full of hope",
          "hope again",
          "hope soon"
        ],
        "ex": "Hopeless means without hope.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does joyful mean?",
        "a": "full of joy",
        "d": [
          "without joy",
          "joy twice",
          "before joy"
        ],
        "ex": "Joyful uses -ful to mean full of.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does movement mean?",
        "a": "the act or result of moving",
        "d": [
          "a person who moves",
          "moving before",
          "without moving"
        ],
        "ex": "-ment makes a noun related to the action move.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word means without fear?",
        "a": "fearless",
        "d": [
          "fearful",
          "fearsome",
          "fearfully"
        ],
        "ex": "Fearless is without fear.",
        "t": 2
      }
    ]
  },
  "g3-context-clues": {
    "h": [
      "Read the entire sentence, not just the target word.",
      "Look for nearby examples, explanations, or opposites.",
      "Test each meaning by putting it back in the sentence."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does fragile mean here?",
        "a": "easy to break",
        "d": [
          "very heavy",
          "bright and shiny",
          "always wet"
        ],
        "ex": "The warning to handle it gently helps show that fragile means easy to break.",
        "t": 0,
        "passage": "The thin glass cup was fragile, so Max carried it gently."
      },
      {
        "kind": "choice",
        "q": "What does enormous mean?",
        "a": "very large",
        "d": [
          "very old",
          "very slow",
          "very noisy"
        ],
        "ex": "The comparison with the barn suggests enormous means very large.",
        "t": 0,
        "passage": "The enormous pumpkin was nearly as wide as the barn door."
      },
      {
        "kind": "choice",
        "q": "What does reluctant mean?",
        "a": "not eager",
        "d": [
          "very excited",
          "surprised",
          "unable to move"
        ],
        "ex": "Hesitating before agreeing is a clue to being reluctant.",
        "t": 1,
        "passage": "Leah was reluctant to try the new slide. She stood by the stairs for a long time before agreeing."
      },
      {
        "kind": "choice",
        "q": "What does scarce mean?",
        "a": "hard to find or limited",
        "d": [
          "made of stone",
          "unsafe to eat",
          "easy to count"
        ],
        "ex": "Only a few remaining shows that something is scarce.",
        "t": 2,
        "passage": "After weeks without rain, water was scarce. The village saved every bucket."
      }
    ]
  },
  "g3-syn-ant": {
    "h": [
      "Synonyms have similar meanings.",
      "Antonyms have opposite meanings.",
      "Check that both words are used in the same way."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which word is a synonym of joyful?",
        "a": "happy",
        "d": [
          "angry",
          "late",
          "quiet"
        ],
        "ex": "Joyful and happy are similar in meaning.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word is an antonym of ancient?",
        "a": "modern",
        "d": [
          "old",
          "historic",
          "early"
        ],
        "ex": "Modern is opposite to ancient.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which word is closest in meaning to whisper?",
        "a": "murmur",
        "d": [
          "shout",
          "roar",
          "bang"
        ],
        "ex": "Whisper and murmur are both soft speech.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which word is opposite to generous?",
        "a": "selfish",
        "d": [
          "helpful",
          "kind",
          "giving"
        ],
        "ex": "Selfish contrasts with generous.",
        "t": 2
      }
    ]
  },
  "g3-figurative": {
    "h": [
      "Sometimes words describe an idea rather than a literal fact.",
      "Look for comparisons or expressions that would be impossible literally.",
      "Choose the meaning that fits what is happening in the story."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What does the expression 'butterflies in my stomach' mean?",
        "a": "I felt nervous",
        "d": [
          "I ate insects",
          "I was very hungry",
          "I felt sleepy"
        ],
        "ex": "Butterflies in the stomach describes nervous feelings.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does a heart of gold suggest?",
        "a": "a kind person",
        "d": [
          "a metal heart",
          "a sick person",
          "a fast runner"
        ],
        "ex": "A heart of gold is a figurative description of kindness.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "What does time flew by mean?",
        "a": "time seemed to pass quickly",
        "d": [
          "time became a bird",
          "the clock broke",
          "the day stopped"
        ],
        "ex": "Time flying describes time seeming to pass quickly.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "What does the classroom was a zoo suggest?",
        "a": "it was chaotic and noisy",
        "d": [
          "real animals were kept there",
          "the classroom had no windows",
          "the class went on a trip"
        ],
        "ex": "Calling the classroom a zoo describes disorder.",
        "t": 2
      }
    ]
  },
  "g3-agreement": {
    "h": [
      "Find the subject of the sentence.",
      "A single person or thing often needs a verb ending in s in present tense.",
      "A plural subject usually uses the base present form."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Choose: The dog ___ in the yard.",
        "a": "runs",
        "d": [
          "run",
          "running",
          "were run"
        ],
        "ex": "The singular dog takes runs.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: The dogs ___ in the yard.",
        "a": "run",
        "d": [
          "runs",
          "running",
          "is run"
        ],
        "ex": "Plural dogs takes run.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Choose: Maya and Ben ___ ready.",
        "a": "are",
        "d": [
          "is",
          "was",
          "bees"
        ],
        "ex": "Two people take are.",
        "t": 1
      },
      {
        "kind": "sentence-tiles",
        "q": "Arrange the words into a sentence about a single bird.",
        "a": "The bird sings each morning.",
        "ex": "Singular bird takes sings.",
        "t": 2
      }
    ]
  },
  "g3-tense": {
    "h": [
      "Look for clues about when the action happened.",
      "Yesterday signals past time; tomorrow signals future time.",
      "Keep the actions in one consistent time frame."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Yesterday, I ___ to the park.",
        "a": "walked",
        "d": [
          "walk",
          "walking",
          "will walk"
        ],
        "ex": "Yesterday signals past tense: walked.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Tomorrow, we ___ a garden.",
        "a": "will plant",
        "d": [
          "planted",
          "planting",
          "had planted"
        ],
        "ex": "Tomorrow signals future time: will plant.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which sentence stays in past tense?",
        "a": "She opened the door and walked inside.",
        "d": [
          "She opened the door and walks inside.",
          "She will open the door and walked inside.",
          "She opens the door and will walked."
        ],
        "ex": "Both actions are in the past.",
        "t": 1
      },
      {
        "kind": "choice",
        "q": "Which revision keeps the tense consistent?",
        "a": "He studied the map and found the trail.",
        "d": [
          "He studies the map and found the trail.",
          "He studied the map and finds the trail.",
          "He study the map and finding the trail."
        ],
        "ex": "Studied and found both express past time.",
        "t": 2
      }
    ]
  },
  "g3-quotation": {
    "h": [
      "Quotation marks surround a person’s exact words.",
      "A comma may separate a speech tag from the quote.",
      "Place the punctuation inside the closing quotation mark when needed."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which sentence uses quotation marks for speech?",
        "a": "\"Hello,\" said Mia.",
        "d": [
          "Hello, said Mia.",
          "\"Hello, said Mia.",
          "Hello,\" said Mia."
        ],
        "ex": "Direct spoken words are enclosed in quotation marks.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which sentence correctly shows Leo speaking?",
        "a": "Leo said, \"I am ready.\"",
        "d": [
          "Leo said \"I am ready\".",
          "Leo said, I am ready.",
          "Leo \"said, I am ready.\""
        ],
        "ex": "A comma introduces a direct quote; the period is inside the quotation marks.",
        "t": 0
      },
      {
        "kind": "choice",
        "q": "Which sentence punctuates a question in dialogue?",
        "a": "\"Where is it?\" asked Sam.",
        "d": [
          "\"Where is it,\" asked Sam?",
          "Where is it? asked Sam.",
          "\"Where is it.\" asked Sam?"
        ],
        "ex": "The question mark belongs to the quoted question.",
        "t": 1
      },
      {
        "kind": "edit",
        "q": "Edit this dialogue with capitals and punctuation: ella said i can help",
        "a": "Ella said, \"I can help.\"",
        "ex": "Use a comma after said and quotation marks around the spoken words.",
        "t": 2
      }
    ]
  },
  "g3-main-idea": {
    "h": [
      "Read for the topic discussed in every sentence.",
      "Details support the main idea; they are not always the main idea.",
      "Choose the idea that best covers the whole passage."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "What is the main idea?",
        "a": "Bees help many plants grow",
        "d": [
          "Bees have yellow stripes",
          "Flowers smell sweet",
          "Spring is windy"
        ],
        "ex": "The whole passage concerns bees moving pollen between flowers.",
        "t": 0,
        "passage": "Bees visit flowers to gather food. As they fly, they carry pollen from flower to flower. This helps many plants make seeds."
      },
      {
        "kind": "choice",
        "q": "What is the main idea?",
        "a": "Libraries offer many ways to learn",
        "d": [
          "Libraries have chairs",
          "Books have pages",
          "The library closes at six"
        ],
        "ex": "Books, programs and research support the main idea of learning.",
        "t": 0,
        "passage": "A library has books and computers. People can research questions there. Many libraries also offer classes and story times."
      },
      {
        "kind": "choice",
        "q": "What is the main idea?",
        "a": "Trees provide different benefits",
        "d": [
          "Trees have brown bark",
          "Some leaves turn yellow",
          "One tree was planted yesterday"
        ],
        "ex": "Shade, habitats, and oxygen are examples of benefits trees provide.",
        "t": 1,
        "passage": "Trees give shade on hot days. Their branches shelter birds. Trees also help keep the air healthy."
      },
      {
        "kind": "choice",
        "q": "What is the main idea?",
        "a": "Saving water matters in dry places",
        "d": [
          "Water can be cold",
          "Some buckets are blue",
          "Rain makes puddles"
        ],
        "ex": "The whole passage describes ways a town conserves scarce water.",
        "t": 2,
        "passage": "During a dry summer, the town used less water. Families fixed leaks, watered plants at dawn, and collected rainwater. These changes helped save a limited supply."
      }
    ]
  },
  "g3-inference": {
    "h": [
      "Think about what the character does, not just what the passage says.",
      "Find a clue that supports a possible explanation.",
      "Choose an inference with evidence; avoid adding unrelated information."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "How does Nora probably feel?",
        "a": "proud",
        "d": [
          "bored",
          "angry",
          "sleepy"
        ],
        "ex": "She smiles after finishing hard work.",
        "t": 0,
        "passage": "Nora finished a difficult puzzle. She smiled and showed it to her brother."
      },
      {
        "kind": "choice",
        "q": "Why did Max reach for his coat?",
        "a": "He expected chilly weather",
        "d": [
          "He wanted to swim",
          "He lost his hat",
          "He was going to sleep"
        ],
        "ex": "Cold wind and shivering support the inference.",
        "t": 0,
        "passage": "Cold wind blew across the yard. Max shivered and went to get his coat."
      },
      {
        "kind": "choice",
        "q": "Why might Alia return to the room?",
        "a": "She forgot her sketchbook",
        "d": [
          "She wanted to go home",
          "The room was too bright",
          "She had a new game"
        ],
        "ex": "She looked for the sketchbook after leaving.",
        "t": 1,
        "passage": "Alia left the classroom, then reached into her bag. Her sketchbook was missing. She hurried back."
      },
      {
        "kind": "choice",
        "q": "What can we infer about Jun?",
        "a": "He prepared carefully for the race",
        "d": [
          "He dislikes running",
          "He forgot the race",
          "He will certainly win"
        ],
        "ex": "Practicing and checking shoes show preparation; winning is not guaranteed.",
        "t": 2,
        "passage": "For several weeks, Jun ran each morning. On race day, he checked his shoelaces and stretched before the start."
      }
    ]
  },
  "g3-text-evidence": {
    "h": [
      "First identify the claim in the question.",
      "Look for a line that directly backs up that claim.",
      "Choose evidence from the text, not a guess or unrelated detail."
    ],
    "items": [
      {
        "kind": "choice",
        "q": "Which detail shows the turtle was slow?",
        "a": "It took an hour to cross the path",
        "d": [
          "The turtle had a green shell",
          "The path was near a lake",
          "Birds flew overhead"
        ],
        "ex": "Taking an hour to cross a short path supports the claim of slowness.",
        "t": 0,
        "passage": "A turtle crawled across a short path. It took an hour to reach the other side. Its shell was green."
      },
      {
        "kind": "choice",
        "q": "Which detail shows the storm was strong?",
        "a": "Branches bent in the wind",
        "d": [
          "The house had a red door",
          "Mina read a book",
          "The sky was blue yesterday"
        ],
        "ex": "Branches bending in strong wind supports the storm claim.",
        "t": 0,
        "passage": "The wind howled. Branches bent low and rain struck the windows. Mina stayed inside and read a book."
      },
      {
        "kind": "choice",
        "q": "Which detail best supports that Ada was considerate?",
        "a": "She moved so she would not wake the baby",
        "d": [
          "She liked her chair",
          "The baby was asleep",
          "The house had three rooms"
        ],
        "ex": "Her deliberate quiet movement shows consideration.",
        "t": 1,
        "passage": "The baby slept on the couch. Ada quietly moved her chair so it would not squeak and wake him."
      },
      {
        "kind": "choice",
        "q": "Which detail supports that the route was challenging?",
        "a": "The trail climbed steep rocks and crossed a creek",
        "d": [
          "The hikers carried water",
          "The sky was clear",
          "They began in the morning"
        ],
        "ex": "Steep rocks and crossing a creek show difficulty.",
        "t": 2,
        "passage": "The trail climbed over steep rocks and crossed a fast creek. The hikers took many careful steps before reaching the summit."
      }
    ]
  }
};
