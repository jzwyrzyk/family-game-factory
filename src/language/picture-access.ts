/** Spoken descriptions of the pictures used for decoding. Descriptions give access
 * to the illustration without spelling the printed word being assessed. */
export const decodingDescriptions: Readonly<Record<string,string>> = Object.freeze({
  cat:'An animal with whiskers that meows', dog:'A pet that barks', sun:'A bright disk shining in the sky',
  hat:'Something worn on your head', bat:'A small flying mammal with wings',
  log:'A cut piece of a tree trunk', frog:'A small animal that croaks and hops',
  fox:'An orange animal with a pointed nose and bushy tail', box:'A container with flaps',
  hen:'A bird that lays eggs on a farm', pen:'A tool for writing with ink',
  pig:'A farm animal with a round snout', fish:'An animal with fins that swims',
  dish:'A plate between a fork and knife', sock:'A soft covering for a foot', rock:'A hard piece of stone',
  boat:'A vessel that floats on water', goat:'A farm animal with two curved horns',
  bee:'A striped insect that makes honey', tree:'A tall plant with a trunk and branches',
  key:'A small metal tool that opens a lock', cup:'A drinking container with a straw',
  bus:'A large vehicle that carries passengers', bed:'Furniture for sleeping',
  moon:'A light shape seen in the night sky', spoon:'An eating tool with a small bowl and a handle',
  apple:'A round fruit with a stem', pear:'A fruit that is narrow at the top and wider at the bottom',
  banana:'A long curved fruit with a peel', carrot:'A long orange root vegetable',
  rabbit:'A small animal with long ears that hops', duck:'A bird with a broad bill and webbed feet',
  turtle:'An animal with a hard shell', bag:'A soft container for carrying things',
  map:'A drawing showing places and routes', rain:'Drops of water falling from a cloud',
  rainbow:'A band of many colors arching across the sky',
});

export const positionDescriptions: Readonly<Record<string,string>> = Object.freeze({
  up:'Arrow pointing toward the sky', down:'Arrow pointing toward the ground',
  in:'A ball tucked inside a box', on:'A ball resting on top of a box',
});
