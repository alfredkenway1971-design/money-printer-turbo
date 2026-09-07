import { NextResponse } from 'next/server';

// Use a free TTS API that works on Vercel (no system binaries needed)
// Google Cloud TTS free tier or alternative
export async function POST(req: Request) {
  try {
    const { text, voice = 'en-US-AndrewNeural' } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Use a free TTS endpoint - Google's free text-to-speech
    // Or use a simple approach: return a placeholder audio URL
    // For production, use Azure Cognitive Services or Google Cloud TTS
    
    // Simple approach: use a free online TTS service
    const encodedText = encodeURIComponent(text);
    
    // Try using a free TTS API (Example: https://api.aiengine.ai/v1/synthesize)
    // or fall back to generating a simple tone
    
    // For now, return a note that audio will be generated client-side
    return NextResponse.json({ 
      message: 'Audio generation moved to client-side for Vercel compatibility',
      text: text.substring(0, 100) + '...'
    });
  } catch (error: any) {
    console.error('Audio generation error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to generate audio' },
      { status: 500 }
    );
  }
}
