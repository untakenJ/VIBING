import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Using adapter-node for explicit Node.js support (required for Render deployment)
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			out: '.output'
		})
	}
};

export default config;
