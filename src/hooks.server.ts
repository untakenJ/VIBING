import type { Handle } from '@sveltejs/kit';

// Filter out harmless Chrome DevTools requests
export const handle: Handle = async ({ event, resolve }) => {
  // Ignore Chrome DevTools automatic requests
  if (event.url.pathname.startsWith('/.well-known/')) {
    return new Response(null, { status: 404 });
  }

  return resolve(event);
};

