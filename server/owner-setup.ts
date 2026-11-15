// Account-owner-only setup on a trusted machine with authorized ADC. Never run in public Actions logs.
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGateway,type GatewayConfig} from './gateway';
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS)throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as GatewayConfig,gateway=await createGateway(config);
 const allowance=Number(process.argv[2]);if(!Number.isInteger(allowance)||allowance<0||allowance>50000000)throw Error('EXPLICIT_ALLOWANCE_IN_MICRO_USD_REQUIRED');
 await gateway.service.setAllowance({subject:'account-owner-setup',familyId:config.familyId,role:'parent',expiresAt:Date.now()+60000},allowance,config.active);
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');await gateway.repo.transaction(s=>{s.invitations??=[];s.invitations=s.invitations.filter(x=>x.expiresAt>Date.now()&&!x.used);s.invitations.push({hash,familyId:config.familyId,expiresAt:Date.now()+600000,used:false});return true;});
 console.log('One-use invitation (expires in 10 minutes). Enter only in the Grown-ups connection form. Do not share publicly:');console.log(token);
}
void main().catch(()=>{console.error('Owner setup failed. Check private configuration, IAM, and explicit allowance.');process.exitCode=1;});
