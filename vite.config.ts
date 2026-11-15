import { defineConfig } from 'vite';
// Relative assets keep project-site paths (/<repository>/) deployable on Pages.
export default defineConfig({ base: './' });
