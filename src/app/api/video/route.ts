import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const images: Array<{filepath?: string; url?: string}> = body.images || [];
    const audioPath = body.audioPath;

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'Images array required' }, { status: 400 });
    }

    const outputDir = join(process.cwd(), 'public', 'output');
    mkdirSync(outputDir, { recursive: true });
    
    const outputFile = join(outputDir, `video_${Date.now()}.mp4`);

    // Filter valid images
    const validImages = images.filter(img => img.filepath || img.url);
    if (validImages.length === 0) {
      return NextResponse.json({ error: 'No valid images provided' }, { status: 400 });
    }

    const n = validImages.length;
    const sceneDuration = 5; // seconds per scene
    const fadeDuration = 0.8; // transition duration between scenes

    // Build ffmpeg args as proper array
    const args: string[] = [];

    // Add each image input
    for (let i = 0; i < n; i++) {
      const filepath = validImages[i].filepath || validImages[i].url!;
      args.push('-loop', '1', '-t', String(sceneDuration), '-i', filepath);
    }

    // Check if audio is valid
    const hasAudio = audioPath && existsSync(audioPath) && statSync(audioPath).size > 0;
    if (hasAudio) {
      args.push('-i', audioPath);
    }

    // Build filter complex for crossfade transitions
    let filterComplex = '';
    
    if (n === 1) {
      // Single image: just scale/pad
      filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[vfinal]`;
    } else {
      // Multi-image: build linear xfade chain
      // Pattern: [0:v][1:v]xfade -> [v0], [v0][2:v]xfade -> [v1], ..., [v_{n-3}][{n-1}:v]xfade -> [vfinal]
      
      const filters: string[] = [];
      
      for (let i = 0; i < n - 1; i++) {
        const nextInputIdx = i + 1;
        // Offset accumulates: base time = scene * iteration minus any overlap
        const offset = (sceneDuration - fadeDuration) * i;
        
        if (i === 0) {
          // First transition: input[0:v][1:v]xfade -> [v0]
          filters.push(`[${i}:v][${nextInputIdx}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v${i}]`);
        } else {
          // Subsequent transitions: [v_{prev}][input_next:v]xfade -> [v_curr]
          filters.push(`[v${i-1}][${nextInputIdx}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v${i}]`);
        }
      }
      
      // Scale and pad the final intermediate output to fullscreen
      const lastV = n - 2;
      filters.push(`[v${lastV}]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[vfinal]`);
      
      filterComplex = filters.join(';');
    }

    // Final output command
    args.push('-filter_complex', filterComplex);
    
    if (hasAudio) {
      const audioStreamIdx = n; // audio comes after all n image inputs
      args.push('-map', '[vfinal]', '-map', `${audioStreamIdx}:a`);
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
    args.push(outputFile);

    // Spawn ffmpeg process
    console.log('[ffmpeg] Total args:', args.length);
    console.log('[ffmpeg] Image count:', n, 'Has audio:', hasAudio);

    const result = await new Promise<{ ok: boolean; error?: string; stderr: string }>((resolve) => {
      let stderrBuf = '';
      
      const p = spawn('/usr/bin/ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      p.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        // Log progress line
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
          stderr: stderrBuf
        });
      });

      p.on('error', (err) => {
        resolve({ ok: false, error: err.message, stderr: err.message });
      });

      // Timeout after 120s
      setTimeout(() => {
        p.kill('SIGTERM');
        resolve({ ok: false, error: 'Timed out after 120s', stderr: '' });
      }, 120000);
    });

    if (result.ok || existsSync(outputFile)) {
      if (existsSync(outputFile)) {
        const fsize = statSync(outputFile).size;
        console.log('[ffmpeg] Success! Output:', fsize.toLocaleString(), 'bytes');
        
        const urlPath = outputFile.replace(join(process.cwd(), 'public'), '');
        
        return NextResponse.json({ 
          url: urlPath,
          filepath: outputFile,
          message: `Video created successfully (${fsize.toLocaleString()} bytes)`
        });
      }
    } else {
      throw new Error(result.error || 'FFmpeg did not produce output file');
    }
    
    // Fallback return (shouldn't reach here)
    return NextResponse.json({ error: result.error || 'Unknown error' }, { status: 500 });
  } catch (error: any) {
    console.error('Error in /api/video:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to assemble video' },
      { status: 500 }
    );
  }
}
