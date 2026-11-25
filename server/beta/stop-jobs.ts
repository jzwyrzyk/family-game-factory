import type {PipelineState} from '../pipeline/types';
import {settleStoppedJob} from '../pipeline/premium-policy';

export function stopJobs(s:PipelineState){
 for(const j of s.jobs)if(['queued','building','testing'].includes(j.status)){
  settleStoppedJob(s,j);j.status='cancelled';j.errorCode='AUTHORIZATION_WITHDRAWN';
  if(j.execution){delete j.execution.candidate;delete j.execution.qualityEvidence;}
  s.audit.push({jobId:j.id,familyId:j.familyId,status:'cancelled',at:new Date().toISOString(),code:'AUTHORIZATION_WITHDRAWN'});
 }
}
