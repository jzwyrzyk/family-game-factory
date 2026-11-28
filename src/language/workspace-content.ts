import type {LanguageTemplate, LanguageTemplateBank} from './content';
import type {LanguageSkill} from './types';

export const WORKSPACE_SKILLS: LanguageSkill[] = [
  {id: 'k-ela-ending', title: 'Match ending sounds', grade: 0, domain: 'phonological-awareness',
    standards: ['RF.K.2d'], prerequisites: ['k-ela-onset'], objective: 'Match the last sound in familiar spoken words'},
  {id: 'k-ela-segment', title: 'Count sounds in short words', grade: 0, domain: 'phonological-awareness',
    standards: ['RF.K.2d'], prerequisites: ['k-ela-onset'], objective: 'Segment short spoken words and count their sounds'},
];

function lineQuestion(lines: string[], correctIndex: number, question: string, explanation: string, tier: number): LanguageTemplate {
  return {kind: 'choice', q: question, a: lines[correctIndex], d: lines.filter((_, index) => index !== correctIndex),
    t: tier, ex: explanation, passage: lines.join(' ')};
}

const endings = [
  ['hat', 'boat', 'dog', 'cup', 'moon'], ['sun', 'hen', 'fish', 'bed', 'sock'],
  ['log', 'pig', 'hat', 'pen', 'cup'], ['map', 'cup', 'dog', 'bus', 'hen'],
  ['dish', 'fish', 'hat', 'bed', 'log'], ['moon', 'pen', 'duck', 'cup', 'goat'],
  ['bed', 'seed', 'sun', 'fish', 'map'], ['sock', 'duck', 'cup', 'boat', 'bee'],
  ['bee', 'key', 'dog', 'hat', 'cup'],
];
const sounds: [string, number][] = [
  ['me', 2], ['cat', 3], ['go', 2],
  ['fish', 3], ['day', 2], ['frog', 4],
  ['spin', 4], ['ship', 3], ['flag', 4],
];

export const WORKSPACE_LANGUAGE_BANK: Record<string, LanguageTemplateBank> = {
  'g1-plural-s': {
    h: ['Think about the word for just one.', 'Build that word with the letter tiles first.', 'Add the ending for more than one.'],
    items: ([
      ['bell','bells',0], ['book','books',0], ['tree','trees',1], ['shell','shells',2],
    ] as const).map(([one,many,t])=>({kind:'word-tiles',q:'Build the word for more than one '+one+'.',a:many,t,
      ex:'Keep the letters in '+one+' together and add s to make '+many+'.'})),
  },
  'g2-complete-sentences': {
    h: ['Find the person doing the action.', 'Put the action after the person.', 'Check the order and end punctuation.'],
    items: ([
      ['Nell put the book on the shelf.', 'Tell what Nell did with the book. Start with Nell.', 0],
      ['Sam fed the cat in the yard.', 'Tell where Sam fed the cat. Start with Sam.', 0],
      ['Jo left the bag on the bus.', 'Tell where Jo left the bag. Start with Jo.', 1],
      ['Lee took the kite to the park.', 'Tell where Lee took the kite. Start with Lee.', 2],
    ] as const).map(([a,q,t])=>({kind:'sentence-tiles',q,a,t,ex:'Put the person first, then the action, the object, and the place: '+a})),
  },
  'g3-text-evidence': {
    h: ['Look at what the question asks you to prove.', 'Reread the lines, one at a time.', 'Look for the detail that directly supports the idea.'],
    items: [
      lineQuestion(['Jo lifted the lid of the box.', 'A tiny plant bent toward the window.', 'She set down her notebook.', 'The clock rang for lunch.'],
        1, 'Which line shows the plant reaching for light?', 'The plant bends in the direction of the window.', 0),
      lineQuestion(['Ari took a kite to the park.', 'He stood near a tree.', 'His scarf streamed straight out behind him.', 'The kite had a yellow tail.'],
        2, 'Which line shows that the wind was strong?', 'A scarf blowing straight out is a visible sign of strong wind.', 0),
      lineQuestion(['Ben set off with his lunch.', 'The path curved around a hill.', 'A bird called from a branch.', 'Ben stopped to give a lost hiker directions.'],
        3, 'Which line shows Ben helping someone?', 'Ben stopped his own walk to help the lost hiker find the way.', 1),
      lineQuestion(['Before anyone arrived, Nia placed a cup at every seat.', 'Her brother opened the curtains.', 'Outside, the sky was pink.', 'A bus passed the house.'],
        0, 'Which line shows Nia preparing for visitors?', 'Putting cups at the seats before the visitors arrive shows preparation.', 2),
    ],
  },
  'g4-evidence-inference': {
    h: ['Identify the idea in the question.', 'Read each line and look for an action or detail.', 'Which line gives you the strongest reason to believe that idea?'],
    items: [
      lineQuestion(['Leo checked the map.', 'He tucked the last dry blanket around his shivering friend.', 'A pine cone fell nearby.', 'The trail continued around the lake.'],
        1, 'Which line best supports the idea that Leo put his friend first?', 'Leo gave the last dry blanket to his friend.', 0),
      lineQuestion(['Water covered the lowest stair.', 'Cora wore her green boots.', 'The gate latch clicked.', 'A bell rang nearby.'],
        0, 'Which line suggests that the river had risen?', 'Water reaching the stair is evidence of a higher water level.', 0),
      lineQuestion(['The box was square.', 'Its label had faded.', 'After three failed tries, Amal tested another way to open it.', 'The room was quiet.'],
        2, 'Which line supports the idea that Amal was determined?', 'Trying again after repeated failures shows determination.', 1),
      lineQuestion(['Two seedlings stood in pots beside the window.', 'Mia marked each pot with its own label.', 'She wrote the date in her book.', 'She gave both pots equal water and changed only the light.'],
        3, 'Which line best shows that Mia was testing the effect of light?', 'Keeping the water equal while changing light lets Mia compare the effect of light.', 2),
    ],
  },
  'g2-vowel-ai-ay': {
    h: ['Look at the picture or read the clue.', 'Read the letters around the space.', 'Try a vowel team in the space and reread the whole word.'],
    items: ([
      ['rain', 'r__n', 'ai', 'rain', 0], ['day', 'A week has seven of these. One is a d__.', 'ay', '', 0],
      ['tail', 'A dog can wag its t__l.', 'ai', '', 1], ['play', 'We go outside to pl__.', 'ay', '', 1],
      ['rainbow', 'r__nbow', 'ai', 'rainbow', 2], ['tray', 'Carry the cups on a tr__.', 'ay', '', 2],
    ] as const).map(([word, pattern, answer, image, tier]) => ({
      kind: 'choice', q: 'Which letters fill the space?', ...(image ? {stimulus:'picture:' + image} : {}),
      passage: pattern, a: answer, d: ['ai', 'ay', 'oa', 'ee'].filter(pair => pair !== answer), t: tier,
      ex: 'The vowel team ' + answer + ' spells the long a in ' + word + '.',
    })),
  },
  'g2-adjectives': {
    h: ['Find the thing being described.', 'Look for a word that tells what that thing is like.', 'Try the description with the noun and read them together.'],
    items: ([
      ['A small frog hopped away.', 'small', 'frog', 'hopped', 'away', 0],
      ['The red kite flew high.', 'red', 'kite', 'flew', 'high', 0],
      ['We found a smooth pebble.', 'smooth', 'We', 'found', 'pebble', 1],
      ['Our thirsty dog drank water.', 'thirsty', 'dog', 'drank', 'water', 2],
    ] as const).map(([passage,a,b,c,d,t]) => ({kind:'choice', q:'Tap the word that describes the noun.', passage, a, d:[b,c,d], t,
      ex:'The word ' + a + ' describes what the noun is like.'})),
  },
  'g3-agreement': {
    h: ['Find who or what does the action.', 'Check whether the subject is one or more than one.', 'Read the sentence aloud with the verb you chose.'],
    items: ([
      ['The little bird __ a nest.', 'builds', 'build', 'building', 'to build', 0],
      ['The two kittens __ the ball.', 'chase', 'chases', 'chasing', 'to chase', 0],
      ['Our friends __ their lunch in the shade.', 'eat', 'eats', 'eating', 'to eat', 1],
      ['One of the hikers __ a map.', 'carries', 'carry', 'carrying', 'to carry', 2],
    ] as const).map(([passage,a,b,c,d,t])=>({kind:'choice', q:'Which word fits?', passage, a, d:[b,c,d], t,
      ex:'Read the completed sentence aloud: '+passage.replace('__',a)})),
  },
  'g4-revision': {
    h: ['Think about what happened in the passage.', 'Choose a detail you want to explain.', 'Reread your own sentence and check that it says what you mean.'],
    items: [
      ['Mina gathered the fallen apples and shared them with the neighbors.', 'How did Mina help? Use a detail in your sentence.', 0],
      ['Avi found a wet bird beside the open window. He closed the window and put a dry towel nearby.', 'Write one sentence about how Avi cared for the bird.', 0],
      ['Nia planned to paint outdoors. Rain fell, so she spread her paper on the kitchen table.', 'How did Nia change her plan? Use a detail in your answer.', 1],
      ['At first Inez hid her drawing. After her friend asked about the bright colors, she held it up for the class.', 'How did Inez change? Use something she did in your answer.', 2],
    ].map(([passage,question,tier])=>({kind:'creative', q:String(question), passage:String(passage), t:Number(tier), a:'',
      ex:'This is unscored writing. Reread your idea and the detail you chose.'})),
  },
  'k-ela-ending': {
    h: ['Listen to the whole word again.', 'Say the name of each picture.', 'Listen to the very last sound in both words.'],
    items: endings.map(([cue, answer, ...others], i) => ({
      kind: 'choice', q: 'Which picture ends with the same sound as ' + cue + '?', a: answer, d: others,
      ex: cue + ' and ' + answer + ' have the same last sound.', t: Math.floor(i / 3),
    })),
  },
  'k-ela-segment': {
    h: ['Say the word slowly to yourself.', 'Tap once for each sound you hear.', 'Say the word again and check each tap.'],
    items: sounds.map(([word, n], i) => ({
      kind: 'choice', q: 'Listen. ' + word + '. Tap once for each sound.', a: String(n),
      d: ['1', '2', '3', '4'].filter(v => v !== String(n)), t: Math.floor(i / 3),
      ex: 'There are ' + n + ' sounds in the word ' + word + '.',
    })),
  },
};
