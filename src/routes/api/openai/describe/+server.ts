import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST = (async ({ request }) => {
  const { imageDataUrl } = await request.json();

  if (!imageDataUrl) {
    return new Response(JSON.stringify({ error: 'Missing imageDataUrl' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `
            You are the assistant to describe the user input image. Please respond the following information:
            1, A detailed description of the uploaded image. Put it between labels <description> and </description>.
            2, Bullet points about all objects and corresponding descriptions in the image. Keep each bullet point short. Each point contains a different piece of information about the whole image from other points. Put each bullet point between labels <bullet> and </bullet>.
            `
          },
          { 
            role: 'user', 
            content: [{
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            }] 
          }
        ],
        temperature: 0.7,
        max_tokens: 200,
        n: 1
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: errorData.error?.message || 'Failed to fetch description from OpenAI' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const description = data.choices[0].message.content.trim();
    
    return new Response(JSON.stringify({ description }), {
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

