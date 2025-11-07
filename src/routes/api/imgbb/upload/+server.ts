import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST = (async ({ request }) => {
  const formData = await request.formData();
  const imageFile = formData.get('image') as File;

  if (!imageFile) {
    return new Response(JSON.stringify({ error: 'Missing image file' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const uploadFormData = new FormData();
    uploadFormData.append('key', env.IMGBB_API_KEY || '');
    uploadFormData.append('image', imageFile);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: uploadFormData
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: data.error?.message || 'Failed to upload image' 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ url: data.data.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}) satisfies RequestHandler;

