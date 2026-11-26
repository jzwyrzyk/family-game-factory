// Reviewed generated-module-v2 fixture. Input, collision and outcomes are explicit game rules.
export function createGame(slots, speed) {
  const has = role => Object.hasOwn(slots,role);
  const image = (role,x,y,width) => ({
    type:'image',key:role,assetId:slots[role].id,x,y,width,height:width*slots[role].aspect,
  });
  return {
    init: () => ({x:85,y:240,points:0,blocked:false}),
    step(s,input) {
      const pressed=input.pressed;
      const nextX=Math.max(38,Math.min(680,s.x+speed*(Number(pressed.includes('right'))-Number(pressed.includes('left')))));
      s.y=Math.max(60,Math.min(355,s.y+speed*(Number(pressed.includes('down'))-Number(pressed.includes('up')))));
      s.blocked=has('obstacle') && Math.abs(nextX-440)<50 && Math.abs(s.y-240)<48;
      if(!s.blocked)s.x=nextX;
      if(has('collectible') && Math.abs(s.x-245)<46 && Math.abs(s.y-240)<48)s.points=1;
      return s;
    },
    draw(s) {
      const commands=[image('background',360,200,720)];
      for(const [role,x,y,width] of [
        ['environment',110,115,85],['decoration',540,115,56],['challenge',560,250,64],
        ['vehicle',160,320,70],['character',620,225,100],['obstacle',440,240,83],
      ])if(has(role))commands.push(image(role,x,y,width));
      if(has('collectible')&&!s.points)commands.push(image('collectible',245,240,50));
      commands.push(has('player')?image('player',s.x,s.y,65):{type:'sprite',key:'pilot',spriteId:'hero',x:s.x,y:s.y,width:45,height:55});
      return commands;
    },
    outcome(s){return {status:s.x>=635 && (!has('collectible')||s.points)?'won':'playing',score:s.points};},
  };
}
