export function createGame(api) {
  // Two navigable forks and a loop. Either entrance can reach the ribbon.
  const links=[[1,2],[0,3],[3,0],[2,4],[4,4]];
  const names=['Willow fork','Fern hollow','Alder bridge','Bell orchard','Ribbon meadow'];
  const signs=[['Fern','Alder'],['Return','Bells'],['Bells','Return'],['Alder','Ribbon'],['','']];
  return {
    init(){return {node:0,from:0,to:0,turn:0,step:0,latch:false,clock:0,visited:1};},
    step(s,input){
      s.clock++;
      const k=input.pressed.includes('left')?-1:input.pressed.includes('right')?1:0;
      if(!k)s.latch=false;
      if(s.node!==4 && !s.turn && k && !s.latch){
        s.from=s.node;s.turn=k;s.to=links[s.node][k===-1?0:1];s.step=0;s.latch=true;api.sound('snap',.15);
      }
      if(s.turn){
        s.step++;
        if(s.step>=36){s.node=s.to;s.turn=0;s.visited|=1<<s.node;if(s.node===4)api.sound('success',.45);}
      }
      return s;
    },
    draw(s){
      const phase=s.turn?s.step/36:0, drift=s.turn*Math.sin(phase*Math.PI), zoom=1+Math.sin(phase*Math.PI)*.09;
      const items=[{type:'image',key:'valley',assetId:'valley',x:360-22*drift,y:205,width:775*zoom,height:431*zoom}];
      if(s.node===2){
        for(let i=0;i<6;i++){
          const y=222+i*13,half=21+i*11;
          items.push({type:'line',key:'plank'+i,x:360-half,y,x2:360+half,y2:y,width:3+i,color:'#a37b58'});
        }
      }
      if(s.node===3||s.node===4){
        for(let i=0;i<3;i++){
          const x=85+i*59,y=202+i*21;
          items.push({type:'line',key:'trunk'+i,x,y,x2:x,y2:y+29,width:5+i,color:'#77594d'},
            {type:'circle',key:'bloom'+i,x,y:y-6,radius:18+i*3,color:'#d6a79a'},
            {type:'circle',key:'petal'+i,x:x-7,y:y-10,radius:9+i,color:'#f1c6ad'});
        }
      }
      for(let i=0;i<2;i++){
        const signX=206+i*300-drift*33, signY=214+phase*18;
        items.push({type:'rect',key:'post'+i,x:signX,y:signY,width:7,height:47,color:'#7b604f'},
          {type:'rect',key:'board'+i,x:signX-43,y:signY-12,width:97,height:26,color:'#564b48'},
          {type:'text',key:'name'+i,x:signX-37,y:signY+7,size:16,color:'#ffebbd',text:(i?'':'← ')+signs[s.node][i]+(i?' →':'')});
      }
      const bob=s.turn?Math.sin(s.step*.53)*5:Math.sin(s.clock/22)*1.5;
      items.push({type:'image',key:'rider',assetId:'horse',x:356+drift*37,y:337+bob,width:157,height:157,angle:drift*.14},
        {type:'rect',x:18,y:15,width:295,height:58,color:'#4d525c'},
        {type:'text',x:30,y:39,size:21,color:'#fff4d7',text:names[s.node]},
        {type:'text',x:30,y:62,size:16,color:'#f4dcae',text:s.node===4?'The valley ribbon is yours':'Choose a sign · find Ribbon meadow'});
      if(s.node===4)items.push({type:'image',key:'prize',assetId:'ribbon',x:438,y:306,width:85,height:85});
      return items;
    },
    outcome(s){return {status:s.node===4?'won':'playing',score:s.node===4?5:s.node};}
  };
}
