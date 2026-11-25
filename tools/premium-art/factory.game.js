export function createGame(api) {
  return {
    init() { return {lot:0, t:0, route:0, last:0, flash:0, travel:0, latch:false}; },
    step(s,input) {
      s.t++;
      if(s.flash>0)s.flash--;
      if(s.lot===4)return s;
      const choice=input.pressed.includes('left')?-1:input.pressed.includes('right')?1:0;
      if(!choice)s.latch=false;
      if(!s.route && choice && !s.latch){s.route=choice;s.latch=true;s.travel=0;api.sound('snap',.2);}
      if(s.route) {
        s.travel++;
        if(s.travel===34) {
          const match=s.route===(s.lot%2===0?-1:1);
          if(match)s.lot++;
          s.last=match?1:-1;s.flash=25;s.route=0;s.travel=0;api.sound(match?'attach':'bounce',.25);
        }
      }
      return s;
    },
    draw(s) {
      const path=s.travel/34, station=s.route===1?1:-1;
      const x=300+path*(station===1?185:-142), y=182+path*(station===1?-76:58);
      const items=[{type:'image',key:'floor',assetId:'floor',x:360,y:200,width:720,height:400}];
      for(let i=0;i<2;i++){
        const sx=i===0?158:485,sy=i===0?240:106;
        items.push({type:'image',key:'press'+i,assetId:'press',x:sx,y:sy-21-(s.flash>0&&s.last>0?4:0),width:78,height:78},
          {type:'text',key:'station'+i,x:sx-5,y:sy-30,text:i===0?'L':'R',size:16,color:'#fff2c6'});
      }
      if(s.lot<4)items.push({type:'line',key:'contact',x:x-15,y:y+13,x2:x+14,y2:y+13,width:5,color:'#536e70'},
        {type:'image',key:'shipment',assetId:'crystal',x,y:y-6+Math.sin(s.t/12)*2,width:56,height:56,angle:Math.sin(path*3)*.2});
      for(let i=0;i<s.lot;i++)items.push({type:'image',key:'packed'+i,assetId:'crystal',x:390+i*37,y:280-i*14,width:43,height:43});
      items.push({type:'rect',x:18,y:15,width:285,height:64,color:'#334f55'},
        {type:'text',x:32,y:41,size:21,color:'#fff2cc',text:s.lot===4?'Shipment complete!':'Copperline  ·  '+s.lot+' / 4'},
        {type:'text',x:32,y:65,size:16,color:'#ffe0a9',text:s.lot===4?'Four cuts for the morning train':s.last===-1&&s.flash?'Returned · choose the other die':s.lot%2===0?'Order: left die   ←':'Order: right die   →'});
      return items;
    },
    outcome(s) { return {status:s.lot===4?'won':'playing',score:s.lot}; }
  };
}
