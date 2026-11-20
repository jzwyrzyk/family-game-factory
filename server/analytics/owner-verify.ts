/** Run only after independent guardian verification for this analytics notice. */
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FileRepository} from '../pipeline/repository';
import {FirestoreRepository} from '../pipeline/firestore';
import {GcsPrivateArtifacts} from '../storage/artifacts';
import {verifyAnalyticsChoice} from './consent';
async function main() {
  if (process.env.GITHUB_ACTIONS || process.env.K_SERVICE || !process.env.FACTORY_PRIVATE_CONFIG ||
      process.argv.slice(2).join(' ') !== '--confirm-external-verification') throw Error('TRUSTED_OWNER_AND_EXTERNAL_VERIFICATION_REQUIRED');
  const choiceId = process.env.FACTORY_ANALYTICS_CHOICE_ID || '', receipt = process.env.FACTORY_ANALYTICS_GUARDIAN_RECEIPT || '';
  const c = JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG, 'utf8')) as {
    familyId: string; workspace: string; projectId?: string; artifactBucket?: string; localFile?: string;
  };
  if (!c || !/^[A-Za-z0-9_-]{1,100}$/.test(c.familyId) || !/^[A-Za-z0-9_-]{1,100}$/.test(c.workspace) || (!c.localFile && !c.projectId)) throw Error('PRIVATE_FAMILY_CONFIG_REQUIRED');
  const repo = c.localFile ? await FileRepository.open(c.localFile) : new FirestoreRepository(new Firestore({projectId: c.projectId}), c.workspace,
    c.artifactBucket ? new GcsPrivateArtifacts(c.artifactBucket, c.workspace) : undefined);
  await verifyAnalyticsChoice(repo, {familyId: c.familyId, choiceId, receipt, verifiedByOwner: true});
  console.log('The separate Jems analytics choice is verified. No analytics configuration or service was activated.');
}
if (process.argv.some(x => /[/\\]owner-verify\.(?:ts|mjs)$/.test(x))) void main().catch(() => {
  console.error('Analytics verification was not recorded. No private details are printed.'); process.exitCode = 1;
});
