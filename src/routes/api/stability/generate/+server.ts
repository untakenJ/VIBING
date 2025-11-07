import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST = (async ({ request }) => {
  const formData = await request.formData();
  const prompt = formData.get('prompt') as string;
  const height = formData.get('height') as string || '1024';
  const width = formData.get('width') as string || '1024';
  const controlImage = formData.get('controlImage') as File | null;
  const useControlImage = formData.get('useControlImage') === 'true';

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const baseURL = 'https://api.stability.ai/v2beta/stable-image';
    const endpoint = '/generate/sd3';
    const fullEndpoint = `${baseURL}${endpoint}`;

    const stabilityFormData = new FormData();
    stabilityFormData.append('prompt', prompt.trim());
    stabilityFormData.append('height', height);
    stabilityFormData.append('width', width);

    if (controlImage && useControlImage) {
      stabilityFormData.append('mode', 'image-to-image');
      stabilityFormData.append('image', controlImage);
      stabilityFormData.append('model', 'sd3.5-large-turbo');
      stabilityFormData.append('output_format', 'png');
      stabilityFormData.append('strength', '0.7');
    } else {
      stabilityFormData.append('negative_prompt', '');
      stabilityFormData.append('model', 'sd3.5-large-turbo');
    }

    const response = await fetch(fullEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STABILITY_KEY}`,
        'Accept': 'image/*'
      },
      body: stabilityFormData
    });

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
        // Try to parse as JSON for better error message
        try {
          const errorJson = JSON.parse(errorText);
          errorText = errorJson.message || errorJson.error || errorText;
        } catch {
          // Not JSON, use as is
        }
      } catch {
        errorText = `HTTP ${response.status} ${response.statusText}`;
      }
      
      console.error('[Stability Generate] API error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: `Failed to generate image: ${errorText}` 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Convert the binary image response to base64
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return new Response(JSON.stringify({ imageDataUrl: dataUrl }), {
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

