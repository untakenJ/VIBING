import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY ?? '',
});

export const POST = (async ({ request }) => {
  const { messages } = await request.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: [...[{
        role: 'system',
        content: 'You are an assistant helping a user with the text-to-image task. The user will upload a hand-sketched image. You are supposed to generate the following contents. Put a line break between each kind of contents:\n1, The detailed description of the uploaded image. Put it between labels <description> and </description>.\n2, Your feelings about the sketch. You should adjust it based on the following user feedback. You are encouraged to provide detailed and artistic feelings. Put it between labels <feeling> and </feeling>.\n3, Three or more suggestions about how to write the text-to-image prompt. Put each suggestion between labels <suggestion> and </suggestion>.\n4, The recommended prompt for Stable Diffusion based on the sketch and user feedback. Put it between labels <prompt> and </prompt>.',
    }], ...messages],
  });

  return result.toDataStreamResponse();
}) satisfies RequestHandler;

