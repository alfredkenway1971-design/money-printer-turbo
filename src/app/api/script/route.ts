import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { topic, model = 'openrouter/auto' } = await req.json();
    
    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}`,
        'X-Title': 'Money Printer Turbo'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a professional short-form video script writer. Write an engaging, concise video script (about 60-90 words / 30-45 seconds of narration). Make it hook-worthy in the first 3 seconds. Structure it as clear sentences suitable for text-to-speech. ONLY return the script text, no explanations.`
          },
          {
            role: 'user',
            content: `Write a short-form video script about: "${topic}"`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    const script = data.choices?.[0]?.message?.content || '';
    
    return NextResponse.json({ script });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate script' },
      { status: 500 }
    );
  }
}
