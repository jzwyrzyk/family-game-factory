/** Private runtime configuration only; source integration does not enable a migration. */
export function artifactEncoding(config:{storageEncoding?:unknown;artifactBucket?:string;localFile?:string}):{splitGamePayloads?:boolean}{
 if(config.storageEncoding===undefined)return {};
 if(config.storageEncoding!=='private-game-v2'||!config.artifactBucket||config.localFile)throw Error('STORAGE_ENCODING_CONFIGURATION_REQUIRED');
 return {splitGamePayloads:true};
}
