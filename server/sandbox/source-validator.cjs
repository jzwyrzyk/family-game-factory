// Structural checks supplement, and never replace, the credential-free gVisor/Worker boundary.
const ts=require('typescript');
const {PURE_GLOBALS}=require('./language-v2.cjs');
const forbidden=new Set(['eval','Function','fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','importScripts','navigator','window','document','globalThis','self','postMessage','location','parent','top','opener','localStorage','sessionStorage','indexedDB','caches','process','require','Deno','Bun','setTimeout','setInterval']);
function validateSource(game){
 if(!game||!['generated-module-v1','generated-module-v2'].includes(game.kind)||typeof game.source!=='string'||Buffer.byteLength(game.source)>30000)throw Error('GENERATED_ARTIFACT_REJECTED');
 const v2=game.kind==='generated-module-v2',tree=ts.createSourceFile('game.ts',game.source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);let nodes=0;
 function visit(node){if(++nodes>12000)throw Error('SOURCE_TOO_COMPLEX');if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)||node.kind===ts.SyntaxKind.ImportKeyword)throw Error('IMPORTS_NOT_ALLOWED');if(ts.isIdentifier(node)&&(forbidden.has(node.text)||(v2&&['Date','performance'].includes(node.text))))throw Error('FORBIDDEN_CAPABILITY:'+node.text);ts.forEachChild(node,visit);}visit(tree);
 if(v2){
  const allowed=new Set(PURE_GLOBALS),host={fileExists:name=>name==='game.ts',readFile:name=>name==='game.ts'?game.source:undefined,getSourceFile:name=>name==='game.ts'?tree:undefined,writeFile(){},getDefaultLibFileName:()=>'',getCurrentDirectory:()=>'',getDirectories:()=>[],getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'};
  const program=ts.createProgram(['game.ts'],{noLib:true,noResolve:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},host),checker=program.getTypeChecker();
  function check(node){
   if(ts.isIdentifier(node)){
    const parent=node.parent,property=ts.isPropertyAccessExpression(parent)&&parent.name===node||ts.isPropertyAssignment(parent)&&parent.name===node||ts.isBindingElement(parent)&&parent.propertyName===node||ts.isLabeledStatement(parent)&&parent.label===node||ts.isBreakOrContinueStatement(parent)&&parent.label===node;
    let typeOnly=false;for(let ancestor=parent;ancestor&&!ts.isStatement(ancestor)&&!ts.isBlock(ancestor);ancestor=ancestor.parent)if(ts.isTypeNode(ancestor)){typeOnly=true;break;}
    if(!property&&!typeOnly&&!allowed.has(node.text)){let symbol=checker.getSymbolAtLocation(node);if(ts.isShorthandPropertyAssignment(parent))symbol=checker.getShorthandAssignmentValueSymbol(parent);if(!symbol?.declarations?.some(declaration=>declaration.getSourceFile()===tree))throw Error('UNAPPROVED_GLOBAL:'+node.text);}
   }
   ts.forEachChild(node,check);
  }check(tree);
 }
}
module.exports={validateSource};
