import * as rasters from './game-assets.cjs';
export type VisualStyle='pixel'|'flat-2d'|'illustrated'|'dimensional'|'realistic';
export interface RasterAsset {
 id:string;role:'background'|'actor'|'object'|'effect';mime:'image/png'|'image/webp';
 width:number;height:number;sha256:string;data:string;sampling:'pixelated'|'smooth';
 provenance:{kind:'approved-library'|'generated';sourceId:string};
}
export interface GameAssetPack {version:'game-assets-v1';style:VisualStyle;assets:RasterAsset[]}
export const ASSET_LIMITS=rasters.ASSET_LIMITS;
export const VISUAL_STYLES=rasters.VISUAL_STYLES as readonly VisualStyle[];
export const validateAssetPack=rasters.validateAssetPack as (value:unknown)=>GameAssetPack;
export const assetPackHash=rasters.assetPackHash as (value:GameAssetPack|undefined)=>string|undefined;
export const inspectRaster=rasters.inspectRaster as (bytes:Uint8Array,mime:RasterAsset['mime'])=>{width:number;height:number;bytes:number;sha256:string};
export const makeRasterAsset=rasters.makeRasterAsset as (options:{id:string;role:RasterAsset['role'];mime:RasterAsset['mime'];bytes:Uint8Array;sampling?:RasterAsset['sampling'];provenance:RasterAsset['provenance']})=>RasterAsset;
