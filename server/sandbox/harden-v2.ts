/** Shared-realm intrinsics used by the trusted engine must not be replaceable by a game.
 * This supplements the separate Worker + CSP + gVisor boundary; it is not a standalone sandbox.
 */
import {PURE_GLOBALS} from './language-v2.cjs';
export function hardenIntrinsics(global:Record<string,any>){
 const freezeChain=(object:object|null)=>{while(object){Object.freeze(object);object=Object.getPrototypeOf(object);}};
 // Iterators have hidden prototypes: freezing Map.prototype alone leaves next() replaceable.
 for(const iterator of [[][Symbol.iterator](),new Map().values(),new Set().values(),''[Symbol.iterator](),new Uint8Array()[Symbol.iterator]()])freezeChain(Object.getPrototypeOf(iterator));
 for(const name of PURE_GLOBALS){
  const value=global[name];if(value===undefined||value===null||!['function','object'].includes(typeof value))continue;if(value.prototype)freezeChain(value.prototype);Object.freeze(value);Object.defineProperty(global,name,{value,writable:false,configurable:false});
 }
}
/** Call only after privately binding the trusted channel. All remaining Worker globals are inert. */
export function sealAmbient(global:Record<string,any>){
 const allowed=new Set(PURE_GLOBALS),names=new Set<string>();let current:object|null=global;
 while(current){for(const name of Object.getOwnPropertyNames(current))names.add(name);current=Object.getPrototypeOf(current);}
 for(const name of names){if(allowed.has(name))continue;const descriptor=Object.getOwnPropertyDescriptor(global,name);if(descriptor&&!descriptor.configurable){if('value'in descriptor&&descriptor.value===undefined&&!descriptor.writable)continue;throw Error('AMBIENT_GLOBAL_NOT_SEALABLE');}Object.defineProperty(global,name,{value:undefined,writable:false,configurable:false});}
}
