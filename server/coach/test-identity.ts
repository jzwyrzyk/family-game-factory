export const testGatewayPrincipal='jems-test-gateway@jems-jzw-nonprod.iam.gserviceaccount.com';
export const testHouseholdPrincipal='jems-test-household@jems-jzw-nonprod.iam.gserviceaccount.com';
export function trialExpiry(env:NodeJS.ProcessEnv){
 const iso=env.JEMS_TEST_TRIAL_EXPIRES_AT??'',end=Date.parse(iso);
 if(env.JEMS_TEST_FUNDED_HOUSEHOLD!=='true'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(iso)||
    !Number.isSafeInteger(end)||!/^[a-f0-9]{64}$/.test(env.JEMS_TEST_TRIAL_AUTHORIZATION_SHA256??''))throw Error('TEST_TRIAL_AUTHORIZATION_REQUIRED');
 return end;
}
export function testCoachOrigin(env:NodeJS.ProcessEnv){
 const number=env.JEMS_TEST_PROJECT_NUMBER;
 if(number!=='1092405124984')throw Error('TEST_PROJECT_NUMBER_REQUIRED');
 return 'https://jems-test-coach-'+number+'.us-east5.run.app';
}
