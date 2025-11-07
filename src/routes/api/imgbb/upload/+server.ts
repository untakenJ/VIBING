import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST = (async ({ request }) => {
  try {
    // Check if API key is configured
    if (!env.IMGBB_API_KEY) {
      console.error('[ImgBB Upload] IMGBB_API_KEY is not configured');
      return new Response(JSON.stringify({ 
        error: 'Server configuration error: IMGBB_API_KEY is missing. Please check environment variables.' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[ImgBB Upload] Parsing form data...');
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      console.error('[ImgBB Upload] No image file in request');
      return new Response(JSON.stringify({ error: 'Missing image file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[ImgBB Upload] File received: ${imageFile.name}, size: ${imageFile.size} bytes, type: ${imageFile.type}`);

    // Check file size (ImgBB limit is 32MB)
    const maxSize = 32 * 1024 * 1024; // 32MB
    if (imageFile.size > maxSize) {
      console.error(`[ImgBB Upload] File too large: ${imageFile.size} bytes`);
      return new Response(JSON.stringify({ 
        error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB. Your file is ${(imageFile.size / 1024 / 1024).toFixed(2)}MB.` 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check file type
    if (!imageFile.type || !imageFile.type.startsWith('image/')) {
      console.error(`[ImgBB Upload] Invalid file type: ${imageFile.type}`);
      return new Response(JSON.stringify({ 
        error: 'Invalid file type. Please upload an image file.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[ImgBB Upload] Preparing upload to ImgBB...');
    const uploadFormData = new FormData();
    uploadFormData.append('key', env.IMGBB_API_KEY);
    uploadFormData.append('image', imageFile);

    console.log('[ImgBB Upload] Sending request to ImgBB API...');
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: uploadFormData
    });

    console.log(`[ImgBB Upload] ImgBB response status: ${response.status} ${response.statusText}`);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[ImgBB Upload] Non-JSON response from ImgBB:', text.substring(0, 200));
      return new Response(JSON.stringify({ 
        error: `ImgBB API returned non-JSON response: ${response.status} ${response.statusText}` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    console.log('[ImgBB Upload] ImgBB response data:', JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      console.error('[ImgBB Upload] ImgBB API error:', data);
      return new Response(JSON.stringify({ 
        error: data.error?.message || data.error?.code || `Failed to upload image: ${response.status} ${response.statusText}` 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!data.data || !data.data.url) {
      console.error('[ImgBB Upload] Invalid response structure:', data);
      return new Response(JSON.stringify({ 
        error: 'Invalid response from image upload service' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[ImgBB Upload] Upload successful:', data.data.url);
    return new Response(JSON.stringify({ url: data.data.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[ImgBB Upload] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during upload';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[ImgBB Upload] Error stack:', errorStack);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorStack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}) satisfies RequestHandler;

