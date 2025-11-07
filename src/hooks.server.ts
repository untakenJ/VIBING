import type { Handle } from '@sveltejs/kit';

// Filter out harmless Chrome DevTools requests
export const handle: Handle = async ({ event, resolve }) => {
  // Ignore Chrome DevTools automatic requests
  if (event.url.pathname.startsWith('/.well-known/')) {
    return new Response(null, { status: 404 });
  }

  // Increase body size limit for file uploads (32MB to match ImgBB limit)
  // Default is 512KB, which is too small for image uploads
  return resolve(event, {
    bodySizeLimit: 32 * 1024 * 1024 // 32MB
  });
};

