/* Browser and unit checks share the actual opaque control colors and computed CSS
 * filter. Unsupported rendering stays a failed measurement, never a pass. */
exports.filteredContrast=function filteredContrast({color,backgroundColor,backgroundImage='none',filter='none'}){
 const result={ratio:null,color,background:backgroundColor,image:backgroundImage,filter,
  filteredForeground:null,filteredBackground:null};
 const rgb=value=>{
  const match=/^rgba?\(([^)]+)\)$/.exec(value);
  if(!match)return null;
  const values=match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if((values.length!==3&&values.length!==4)||values.some(value=>!Number.isFinite(value))||
   values.slice(0,3).some(value=>value<0||value>255)||(values[3]??1)!==1)return null;
  return values.slice(0,3).map(value=>value/255);
 };
 const front=rgb(color),back=rgb(backgroundColor);
 if(backgroundImage!=='none'||!front||!back)return result;
 const operations=[];let remaining=filter==='none'?'':filter.trim();
 while(remaining){
  const match=/^(brightness|saturate)\(\s*([+\-]?(?:\d*\.)?\d+(?:e[+\-]?\d+)?)(%)?\s*\)\s*/i.exec(remaining);
  if(!match)return result;
  const amount=Number(match[2])/(match[3]?100:1);
  if(!Number.isFinite(amount)||amount<0)return result;
  operations.push({kind:match[1].toLowerCase(),amount});remaining=remaining.slice(match[0].length);
 }
 const apply=channels=>{
  let current=channels;
  for(const {kind,amount} of operations){
   // CSS filter functions use sRGB. This is the feColorMatrix saturation
   // operation, followed in declaration order by each remaining function.
   // https://www.w3.org/TR/filter-effects-1/#feColorMatrixElement
   const grey=current[0]*.213+current[1]*.715+current[2]*.072;
   current=current.map(value=>Math.min(1,Math.max(0,kind==='brightness'?value*amount:grey+(value-grey)*amount)));
  }
  return current;
 };
 const foreground=apply(front),background=apply(back);
 const light=channels=>channels.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
  .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
 const a=light(foreground),b=light(background);
 return {...result,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),
  filteredForeground:foreground.map(value=>value*255),filteredBackground:background.map(value=>value*255)};
};
