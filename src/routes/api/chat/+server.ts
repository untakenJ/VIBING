import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { RequestHandler } from './$types';

const openai = createOpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
});

export const POST = (async ({ request }) => {
  const { messages } = await request.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: [...[{
        role: 'system',
        content: 'You are the assistant who help the user refine their descriptions about the image they want to generate and give suggestions for proper prompt. Give at least three suggestion (or more if necessary) and put each of them between labels <suggestion> and </suggestion>. Put the suggested prompt between label <prompt> and </prompt>.',
    }], ...messages],
  });

  return result.toDataStreamResponse();
}) satisfies RequestHandler;
