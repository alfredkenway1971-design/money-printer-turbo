import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// In-memory cache for TTS to avoid regenerating same text
const ttsCache = new Map<string, string>();

export async function POST(req: Request) {
  try {
    const { text, voice = 'en-US-AndrewNeural' } = await req.json();

    // Check cache
    const cacheKey = `${voice}:${text}`;
    if (ttsCache.has(cacheKey)) {
      return NextResponse.json({ 
        base64: ttsCache.get(cacheKey),
        note: 'Served from cache'
      });
    }

    // Generate audio using edge-tts and capture to stdout
    const { stdout } = await execAsync(
      `/usr/local/lib/hermes-agent/venv/bin/edge-tts --voice ${voice} --text "${text.replace(/"/g, '\\"').replace(/'/g, "\\'")}" --write-media -`
    );

    const audioBase64 = Buffer.from(stdout).toString('base64');
    ttsCache.set(cacheKey, audioBase64);

    return NextResponse.json({ 
      base64: audioBase64,
      note: 'Generated with edge-tts'
    });
  } catch (error: any) {
    console.error('Audio generation error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to generate audio' },
      { status: 500 }
    );
  }
}
