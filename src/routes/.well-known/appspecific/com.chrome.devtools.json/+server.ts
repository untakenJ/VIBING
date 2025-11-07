// This route handles Chrome DevTools automatic requests
// It's safe to return 404 as this is just a browser feature check
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return new Response(null, { status: 404 });
};

