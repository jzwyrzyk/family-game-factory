// Run independent quality journeys even if one fails, preserving screenshots for review.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const suites=['quality-builder.cjs','quality-hill.cjs','quality-tablet.cjs','drawing-engine-browser.cjs','quality-generated-browser.ts'];
let failed=false;
// Fast source checks run before the expensive physics/Playwright suite.
for(const suite of suites.filter(s=>s.endsWith('.cjs'))){
 const checked=spawnSync(process.execPath,['--check',path.join(__dirname,suite)],{stdio:'inherit',env:process.env,timeout:10000});
 if(checked.status!==0){failed=true;console.error('FAIL quality browser syntax: '+suite);}
}
if(failed)process.exit(1);
for(const suite of suites){
 const result=spawnSync(process.execPath,['--import','tsx',path.join(__dirname,suite)],{stdio:'inherit',env:process.env,timeout:180000});
 if(result.status!==0){failed=true;console.error(`FAIL quality suite ${suite}: ${result.error?.message||result.signal||result.status}`);}
}
process.exitCode=failed?1:0;
