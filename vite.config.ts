import { defineConfig } from 'vite';
import {offlineBuild} from './tools/offline-build';
// Relative assets keep project-site paths (/<repository>/) deployable on Pages.
export default defineConfig({ base: './', plugins:[offlineBuild()] });
