import assert from 'node:assert/strict';
import test from 'node:test';
import {isWebKitHistoryCancellation} from './beta-back';

test('only the exact WebKit history cancellation may reach independent ended-session checks',()=>{
 const message='page.goBack: Navigation canceled by policy check';
 assert.equal(isWebKitHistoryCancellation('webkit',new Error(message)),true);
 assert.equal(isWebKitHistoryCancellation('webkit',new Error(message+'\nCall log:\n  - waiting for navigation')),true);
 for(const engine of ['chromium','firefox'])assert.equal(isWebKitHistoryCancellation(engine,new Error(message)),false);
 for(const error of [message,{message},new Error('page.goBack: Timeout 30000ms exceeded'),new Error('page.goto: Navigation canceled by policy check'),
  new Error('Earlier failure: '+message),new Error(message+' while accessing private content'),new Error('page.goBack: net::ERR_CONNECTION_RESET')]){
  assert.equal(isWebKitHistoryCancellation('webkit',error),false);
 }
});
