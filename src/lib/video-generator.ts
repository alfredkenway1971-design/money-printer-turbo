import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Use ffmpeg executable directly
const ffmpegPath = '/usr/bin/ffmpeg';

export function generateScript(topic: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFileSync(
      'curl',
      [
        '-s',
        'https://openrouter.ai/api/v1/chat/completions',
        '-H', `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({
          model: 'qwen/qwen3-8b-chat',
          messages: [
            {
              role: 'system',
              content: `You are a professional short-form video script writer. Write an engaging, concise video script (about 60-90 words / 30-45 seconds of narration). Make it hook-worthy in the first 3 seconds. Structure it as clear sentences suitable for text-to-speech.`
            },
            {
              role: 'user',
              content: `Write a short-form video script about: "${topic}"`
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      ],
      { encoding: 'utf-8' }
    ) as string;

    try {
      const data = JSON.parse(child);
      resolve(data.choices?.[0]?.message?.content || '');
    } catch {
      reject(new Error('Failed to parse script response'));
    }
  });
}

export async function generateImages(script: string, count: number = 5): Promise<string[]> {
  const segments = script.split(/[.!?]\n|[.!?]/).filter(s => s.trim().length > 10);
  const selected = segments.slice(0, count);
  
  const prompts = selected.map(seg => 
    `${seg.trim()} -- cinematic style -- high quality -- visual representation`
  );

  const imagePromises = prompts.map(async (prompt, idx) => {
    const segmentId = `segment_${idx}`;
    
    try {
      const child = execFileSync(
        'curl',
        [
          '-s',
          'https://openrouter.ai/api/v1/images/generations',
          '-H', `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`,
          '-H', 'Content-Type: application/json',
          '-d', JSON.stringify({
            model: 'meta/llama-3.2-90b-vision-preview', // Fallback: will use flux if available
            prompt: prompt,
            n: 1,
            size: '1024x1024'
          })
        ],
        { encoding: 'utf-8' }
      ) as string;

      const data = JSON.parse(child);
      return data.data?.[0]?.url || '';
    } catch {
      // Return placeholder if image generation fails
      return null;
    }
  });

  const urls = await Promise.all(imagePromises);
  return urls.filter(Boolean) as string[];
}

export function generateAudio(script: string): Promise<string> {
  // This will be replaced with actual TTS implementation
  return new Promise(resolve => {
    resolve('audio-placeholder');
  });
}

export function assembleVideo(
  images: string[], 
  audioPath: string, 
  outputPath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const workDir = dirname(outputPath);
    mkdirSync(workDir, { recursive: true });

    const durationPerImage = 4; // seconds per segment
    
    try {
      execFileSync(ffmpegPath, [
        '-y', // overwrite output file
        ...images.flatMap((img, idx) => [
          '-loop', '1',
          '-t', String(durationPerImage),
          '-i', img
        ]),
        '-i', audioPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        outputPath
      ]);
      
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}
