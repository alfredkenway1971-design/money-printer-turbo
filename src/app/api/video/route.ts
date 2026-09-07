import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const images = body.images || [];
    const audioData = body.audioData; // base64 audio data

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'Images array required' }, { status: 400 });
    }

    // Build ffmpeg command with base64 data URLs
    const args: string[] = [];
    const sceneDuration = 5; // seconds per scene
    const fadeDuration = 0.8; // transition duration between scenes

    // Add each image input (using data URLs)
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // Extract base64 data from data URL
      const base64Data = img.url?.replace(/^data:image\/\w+;base64,/, '');
      if (base64Data) {
        args.push('-loop', '1', '-t', String(sceneDuration), '-i', `data:image/jpeg;base64,${base64Data}`);
      }
    }

    // Add audio if provided
    let audioStreamIdx = images.length;
    if (audioData) {
      const audioBase64 = audioData.replace(/^data:audio\/\w+;base64,/, '');
      args.push('-i', `data:audio/mp4;base64,${audioBase64}`);
      audioStreamIdx = images.length + 1;
    }

    // Build filter complex for crossfade transitions
    let filterComplex = '';
    const n = images.length;

    if (n === 1) {
      // Single image: just scale/pad
      filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[vfinal]`;
    } else {
      // Multi-image: build linear xfade chain
      const filters: string[] = [];
      
      for (let i = 0; i < n - 1; i++) {
        const nextInputIdx = i + 1;
        const offset = (sceneDuration - fadeDuration) * i;
        
        if (i === 0) {
          filters.push(`[${i}:v][${nextInputIdx}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v${i}]`);
        } else {
          filters.push(`[v${i-1}][${nextInputIdx}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v${i}]`);
        }
      }
      
      const lastV = n - 2;
      filters.push(`[v${lastV}]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[vfinal]`);
      
      filterComplex = filters.join(';');
    }

    // Final output command
    args.push('-filter_complex', filterComplex);
    
    if (audioData) {
      args.push('-map', '[vfinal]', `-map ${audioStreamIdx}:a`);
    } else {
      args.push('-map', '[vfinal]');
    }

    // Encode settings
    args.push('-c:v', 'libx264');
    args.push('-preset', 'medium');
    args.push('-crf', '20');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-movflags', '+faststart');
    args.push('-y');
    
    // Output to stdout (pipe) instead of file
    args.push('-f', 'mp4', 'pipe:1');

    // Spawn ffmpeg process
    console.log('[ffmpeg] Building video with base64 data...');
    console.log('[ffmpeg] Image count:', n, 'Has audio:', !!audioData);

    const result = await new Promise<{ ok: boolean; error?: string; buffer?: Buffer }>((resolve) => {
      let stderrBuf = '';
      
      const p = spawn('/usr/bin/ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutBuf = Buffer.alloc(0);

      p.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
      });

      p.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.includes('time=')) {
            console.log('[ffmpeg]', line.trim());
          }
        }
      });

      p.on('close', (code) => {
        resolve({ 
          ok: code === 0, 
          error: code !== 0 ? stderrBuf.substring(0, 1000) : undefined,
          buffer: code === 0 ? stdoutBuf : undefined
        });
      });

      p.on('error', (err) => {
        resolve({ ok: false, error: err.message, buffer: undefined });
      });

      // Timeout after 120s
      setTimeout(() => {
        p.kill('SIGTERM');
        resolve({ ok: false, error: 'Timed out after 120s', buffer: undefined });
      }, 120000);
    });

    if (result.ok && result.buffer) {
      // Return video as base64 data URL
      const videoBase64 = result.buffer.toString('base64');
      
      return NextResponse.json({ 
        url: `data:video/mp4;base64,${videoBase64}`,
        base64: videoBase64,
        message: `Video created successfully (${result.buffer.length.toLocaleString()} bytes)`
      });
    } else {
      throw new Error(result.error || 'FFmpeg did not produce output');
    }
    
  } catch (error: any) {
    console.error('Error in /api/video:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to assemble video' },
      { status: 500 }
    );
  }
}
