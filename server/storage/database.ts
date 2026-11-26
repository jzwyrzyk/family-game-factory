import {Firestore} from '@google-cloud/firestore';

const testProject = 'jems-jzw-nonprod';
const testBucket = 'jems-jzw-nonprod-jems-test-artifacts';
const testServices = new Set(['jems-test-gateway', 'jems-test-preview', 'jems-test-household']);

/** Bind the same database for service, recovery and offline administrator entry points. */
export function databaseFor(config: {projectId?: string; artifactBucket?: string}, service = process.env.K_SERVICE) {
  const usesTestBucket = config.artifactBucket === testBucket;
  if (usesTestBucket || (service && testServices.has(service))) {
    if (config.projectId !== testProject || !usesTestBucket) throw Error('TEST_DATABASE_BINDING_REQUIRED');
    return new Firestore({projectId: testProject, databaseId: 'jems-test'});
  }
  return new Firestore({projectId: config.projectId});
}
