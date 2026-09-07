import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(req: Request) {
  try {
    const { scriptSegments, count = 5 } = await req.json();
    
    if (!scriptSegments || !Array.isArray(scriptSegments)) {
      return NextResponse.json({ error: 'Script segments required' }, { status: 400 });
    }

    // Select segments for scenes
    const selected = scriptSegments.slice(0, Math.min(count, scriptSegments.length));
    const outputDir = join(process.cwd(), 'public', 'tmp');
    await mkdir(outputDir, { recursive: true });

    // Download stock images from Pexels
    const pexelsKey = process.env.PEXELS_API_KEY;
    
    const imagePromises = selected.map(async (segment: string, idx: number) => {
      const filename = `scene_${idx}.jpg`;
      const filepath = join(outputDir, filename);
      
      // Extract keywords from segment
      const query = extractKeywords(segment.trim());
      
      try {
        console.log(`[images] Searching Pexels for: "${query}"`);
        
        let imageUrl: string;
        
        if (pexelsKey) {
          // Use real Pexels API
          const resp = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
            { headers: { Authorization: pexelsKey } }
          );
          const data = await resp.json();
          if (data.photos?.[0]?.src?.landscape) {
            imageUrl = data.photos[0].src.landscape;
          } else {
            throw new Error('No images found on Pexels');
          }
        } else {
          // Use picsum for placeholder images
          imageUrl = `https://picsum.photos/seed/${idx + Date.now()}/1920/1080`;
        }

        // Download the image
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(filepath, buffer);

        return { 
          url: `/tmp/${filename}`,
          filepath,
          segment 
        };
      } catch (err) {
        console.error(`[images] Failed to get scene ${idx}:`, err);
      }

      // Fallback: generate colored gradient
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 40 + idx * 30, g: 80 + idx * 20, b: 160 }
        }
      }).jpeg({ quality: 80 }).toFile(filepath);
      
      return {
        url: `/tmp/${filename}`,
        filepath,
        segment
      };
    });

    const results = await Promise.all(imagePromises);
    
    return NextResponse.json({ images: results });
  } catch (error: any) {
    console.error('Error in /api/images:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}

function extractKeywords(text: string): string {
  // Extract meaningful nouns/phrases from text
  const words = text.toLowerCase().split(/\s+/);
  const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'not', 'no', 'nor', 'and', 'but', 'or', 'whether', 'this', 
    'that', 'these', 'those', 'it', 'its']);
  
  const significant = words.filter(w => w.length > 3 && !stopwords.has(w));
  return significant.slice(0, 5).join(' ') || 'nature landscape';
}
