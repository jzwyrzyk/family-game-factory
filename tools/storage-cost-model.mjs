// Assumptions, not billing observations. Gross costs exclude free tiers and AI.
import {writeFileSync} from 'node:fs';
const prices={region:'us-central1 reference, actual deployment region unverified',date:'2026-11-24',gcsGiBMonth:.000027397*730,firestoreGiBMonth:.000205479*730,backupGiBMonth:.000041096*730,reads100k:.03,writes100k:.09,classA1000:.005,classB1000:.0004,egressGiB:.12};
const rows=[];
for(const [scenario,gamesPerPersonMonth,revisions,mastersMiB,messagesPerPersonDay,devices] of [['low',1,5,1,10,2],['typical',4,20,4,40,3],['high',12,50,12,100,5]]){
 const family=5,years=5,games=family*years*12*gamesPerPersonMonth,revisionCount=games*revisions;
 const assetGiB=games*mastersMiB/1024,metadataGiB=(revisionCount*12000+family*years*250*messagesPerPersonDay*600)/(1024**3);
 const writesMonth=(revisionCount/(years*12)+family*250/12*messagesPerPersonDay/20)*3; // current+history+receipt, 20-message chapters
 const readsMonth=writesMonth*devices*2,egressGiBMonth=gamesPerPersonMonth*family*mastersMiB*devices/1024;
 const objectWritesMonth=games/(years*12)*10,objectReadsMonth=gamesPerPersonMonth*family*devices*20;
 const cost={assets:assetGiB*prices.gcsGiBMonth,metadata:metadataGiB*prices.firestoreGiBMonth,oneRecoveryCopy:metadataGiB*prices.backupGiBMonth+assetGiB*prices.gcsGiBMonth,reads:readsMonth/1e5*prices.reads100k,writes:writesMonth/1e5*prices.writes100k,objectOperations:objectWritesMonth/1000*prices.classA1000+objectReadsMonth/1000*prices.classB1000,network:egressGiBMonth*prices.egressGiB};
 rows.push({scenario,family,years,games,revisionsPerGame:revisions,revisionCount,mastersMiBPerGame:mastersMiB,messagesPerPersonDay,devices,assetGiB,metadataGiB,writesMonth,readsMonth,egressGiBMonth,duplicatedAssetGiBBefore:assetGiB*revisions,costUSD:cost,totalUSDMonth:Object.values(cost).reduce((n,x)=>n+x,0)});
}
const report={scope:'Projected end-of-year-five monthly run rate. Not live measurements. Original+derivative totals per game; current generated runtime remains capped at 2 MiB. Gross rates, no free-tier credit, tax, compute, model, support, logs or CI charges. Egress $0.12/GiB is a sensitivity assumption, not verified route pricing. Recovery copy is a sizing allowance, not an implemented schedule.',prices,rows,futureFamilies:[100,1000].map(families=>({families,typicalProjectedUSDMonth:rows[1].totalUSDMonth*families,publicLaunchAuthorized:false}))};
writeFileSync('docs/storage/evidence/cost-model.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
