/** Explicit entrypoint for the IAM-only private coach service. */
import {startPrivateCoach} from './private-http';
void startPrivateCoach().catch(()=>{
 console.error('Private coach refused startup. Review consent, ZDR, IAM and provider entitlements.');
 process.exitCode=1;
});
