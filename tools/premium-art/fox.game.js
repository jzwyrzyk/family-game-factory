export function createGame(api) {
  const stride = 64;
  function nextLow(s) { return Math.floor(s.cleared / 10) % 2 === 0; }
  return {
    init() { return {cleared:0, distance:0, offset:0, running:false, latch:false, pose:'run', tick:0, finish:0, bump:0}; },
    step(s, input) {
      s.tick++;
      if (s.cleared === 100) { s.finish++; return s; }
      const jump = input.pressed.includes('action'), duck = input.pressed.includes('down');
      if (!jump && !duck) s.latch = false;
      if (s.bump > 0) { s.bump--; return s; }
      if (!s.running && !s.latch && (jump || duck)) { s.running = true; s.latch = true; }
      if (!s.running && !jump && !duck) return s;
      s.pose = jump && !duck ? 'jump' : duck && !jump ? 'duck' : 'run';
      if (!s.running) return s;
      const speed = 5 + Math.floor(s.cleared / 20) * .55;
      s.offset += speed; s.distance += speed;
      if (s.offset >= stride) {
        s.offset -= stride;
        if (s.pose !== (nextLow(s) ? 'jump' : 'duck')) {
          s.bump = 16; s.running = false; s.offset = 0; api.sound('bounce',.15);
          return s;
        }
        s.cleared++;
        if (s.cleared % 10 === 0) { s.running = false; s.offset = 0; api.sound('pickup',.2); }
        if (s.cleared === 100) api.sound('success',.4);
      }
      return s;
    },
    draw(s) {
      const low = nextLow(s), parade = s.cleared === 100;
      const lift = parade ? 22 + 20*Math.sin(s.finish/5) : s.pose === 'jump' ? 58+8*Math.sin(s.offset/stride*Math.PI) : 0;
      const items = [{type:'image',key:'woods',assetId:'forest',x:360-6*Math.sin(s.distance/380),y:200,width:736,height:400}];
      for (let i=0;i<9;i++) {
        const x=220+i*stride-s.offset;
        if (!parade && i < 10-(s.cleared%10)) items.push({type:'image',key:'leaf'+i,assetId:'leaf',x,y:low?283:225,width:42,height:39,angle:Math.sin((s.tick+i*9)/18)*.16});
      }
      items.push({type:'line',key:'shadow',x:131,y:307,x2:184,y2:307,width:7,color:'#a68a67'},
        {type:'image',key:'fox',assetId:parade?'twirl':s.pose==='duck'?'duck':'fox',x:158+(s.bump?Math.sin(s.bump)*5:0),
         y:258-lift+(s.pose==='duck'?9:0),width:116,height:116,angle:parade?Math.sin(s.finish/5)*.22:0});
      if(parade) for(let i=0;i<14;i++)items.push({type:'image',key:'petal'+i,assetId:'leaf',x:45+i*49,y:70+((s.finish*2+i*37)%210),width:16,height:16,angle:s.finish*.08+i});
      items.push({type:'rect',x:18,y:14,width:279,height:61,color:'#344d4b'},
        {type:'text',x:30,y:39,size:20,color:'#fff3d4',text:parade?'The Leafwood jubilee!':'Leafwood  ·  '+s.cleared+' / 100'},
        {type:'text',x:30,y:62,size:16,color:'#f4d696',text:parade?'A hundred leaves!':s.bump?'Brush off and try again':low?'Hold Action to bound over':'Hold Down to slip under'});
      return items;
    },
    outcome(s) { return {score:s.cleared,status:s.finish>=48?'won':'playing'}; }
  };
}
