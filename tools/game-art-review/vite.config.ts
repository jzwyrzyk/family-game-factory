import {defineConfig} from 'vite';
import {reviewPackage} from './package.cjs';
export default defineConfig({
  base:'./',
  plugins:[{
    name:'local-synthetic-art-package',enforce:'pre',
    resolveId(id){if(id==='./review-package')return '\0reviewed-game-art';},
    load(id){if(id==='\0reviewed-game-art')return 'export default '+JSON.stringify(reviewPackage());},
  }],
});
