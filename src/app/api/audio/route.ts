import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';

// Cache for TTS to avoid regenerating same text
const ttsCache = new Map<string, { filepath: string; timestamp: number }>();

export async function POST(req: Request) {
  try {
    const { text, voice = 'en-US-AndrewNeural' } = await req.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const outputDir = join(process.cwd(), 'public', 'tmp');
    await mkdir(outputDir, { recursive: true });
    
    // Check cache
    const cacheKey = `${voice}:${text.length}`;
    if (ttsCache.has(cacheKey)) {
      const cached = ttsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour TTL
        console.log('[audio] Using cached audio');
        return NextResponse.json({ 
          url: '/tmp/audio.mp3',
          filepath: cached.filepath 
        });
      }
    }

    // Generate audio using Edge TTS via shell command
    const outputFile = join(outputDir, `audio_${Date.now()}.mp3`);
    
    try {
      // Try edge-tts first
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync(
        `/usr/local/lib/hermes-agent/venv/bin/edge-tts --voice ${voice} --text "${text.replace(/"/g, '\\"').replace(/'/g, "\\'")}" --write-media "${outputFile}"`
      );
      
      console.log('[audio] Generated with edge-tts');
      
      // Save to cache
      ttsCache.set(cacheKey, { filepath: outputFile, timestamp: Date.now() });
      
      return NextResponse.json({ 
        url: `/tmp/audio_${Date.now()}.mp3`,
        filepath: outputFile
      });
    } catch (err) {
      console.error('[audio] edge-tts failed, generating placeholder...');
      
      // Fallback: generate short silence/beep with ffmpeg
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Estimate duration based on word count (~2 words/sec)
      const wordCount = text.split(/\s+/).length;
      const duration = Math.max(3, Math.ceil(wordCount / 2));
      
      await execAsync(
        `ffmpeg -f lavfi -i "anullsrc=r=44100:cl=stereo" -t ${duration} -c:a libmp3lame -b:a 128k "${outputFile}" -y 2>/dev/null`
      );
      
      // Add tone at intervals for awareness
      await execAsync(
        `ffmpeg -i "${outputFile}" -i /dev/null -f lavfi -i "sine=frequency=440:duration=${duration}" -filter_complex "[0:a][2:a]amix=inputs=2:duration=first" -y "${outputFile}" 2>/dev/null`
      ).catch(() => {});
      
      ttsCache.set(cacheKey, { filepath: outputFile, timestamp: Date.now() });
      
      return NextResponse.json({ 
        url: `/tmp/audio_${Date.now()}.mp3`,
        filepath: outputFile,
        note: 'Generated placeholder (edge-tts not available)'
      });
    }
  } catch (error: any) {
    console.error('Error in /api/audio:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate audio' },
      { status: 500 }
    );
  }
}
