const {readFile,writeFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {observation}=require('./test-frontend.cjs');
const {fixture,live}=require('./test-journeys.cjs');
async function main(){
  const mode=process.env.FAMILY_OPERATION,target=JSON.parse(process.env.TEST_TARGET),token=process.env.TEST_IAP_TOKEN;
  assert(['uat','qualify-fixture','prepare-uat','live-uat'].includes(mode)&&target.source===process.env.GITHUB_SHA&&target.project==='jems-jzw-nonprod'&&token);
  const out=name=>path.join(process.env.RUNNER_TEMP,name);
  const frontend=await observation(target,token);
  if(mode==='prepare-uat'){await writeFile(out('frontend.json'),JSON.stringify(frontend));return;}
  const bound=JSON.parse(await readFile(out('test-bound.json'),'utf8'));
  assert.equal(bound.frontend.sha256,frontend.frontendSha256);
  if (mode==='uat'&&process.env.PRIOR_FIXTURE_RUN) {
    // The trusted follow-up step independently retrieves the original private-run-qualified artifact.
    await writeFile(out('test-reuse-frontend.json'),JSON.stringify({sha256:frontend.frontendSha256}));
    return;
  }
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try{
    const creds=JSON.parse(process.env.TEST_CREDENTIALS);
    const proof=mode!=='live-uat'?await fixture(browser,target,bound,token,creds):await live(browser,target,bound,token,creds,JSON.parse(process.env.TEST_FUNDING));
    const after=await observation(target,token);assert.deepEqual(frontend,after);
    const {frontend:registered,...identity}=bound;
    await writeFile(out(mode!=='live-uat'?'test-browser.json':'receipt.json'),JSON.stringify({...identity,...proof,frontendIdentity:registered,target:mode==='qualify-fixture'?'deployed-test-fixture-qualification':'deployed-test'}));
  }finally{await browser.close();}
}
main().catch(error=>{console.error('INTEGRATED_TEST_ACCEPTANCE_FAILED',error.code==='ERR_ASSERTION'?error.name:'route, browser or service unavailable');process.exitCode=1;});
