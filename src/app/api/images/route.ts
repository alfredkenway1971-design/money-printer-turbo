import { NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(req: Request) {
  try {
    const { scriptSegments, count = 5 } = await req.json();

    const images = [];

    for (let i = 0; i < Math.min(count, scriptSegments.length); i++) {
      const segment = scriptSegments[i];

      try {
        // Try Pexels first
        const pexelsRes = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(segment.substring(0, 50))}&per_page=1`,
          { headers: { 'Authorization': process.env.PEXELS_API_KEY || '' } }
        );
        const pexelsData = await pexelsRes.json();

        if (pexelsData.videos && pexelsData.videos.length > 0) {
          const imageUrl = pexelsData.videos[0].image;
          const imgRes = await fetch(imageUrl);
          const imgBuf = await imgRes.arrayBuffer();

          const processed = await sharp(Buffer.from(imgBuf))
            .resize(1280, 720)
            .jpeg({ quality: 85 })
            .toBuffer();

          images.push({
            segment,
            url: `data:image/jpeg;base64,${processed.toString('base64')}`,
            filepath: null, // Don't write to disk!
          });
          continue;
        }
      } catch (pexelsErr) {
        console.warn('Pexels failed, using fallback:', pexelsErr);
      }

      // Fallback: picsum.photos (no API key needed)
      const seed = btoa(segment.substring(0, 30)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) || String(i);
      const placeholderUrl = `https://picsum.photos/seed/${seed}/1280/720`;

      const imgRes = await fetch(placeholderUrl);
      const imgBuf = await imgRes.arrayBuffer();

      const processed = await sharp(Buffer.from(imgBuf))
        .resize(1280, 720)
        .jpeg({ quality: 85 })
        .toBuffer();

      images.push({
        segment,
        url: `data:image/jpeg;base64,${processed.toString('base64')}`,
        filepath: null, // Don't write to disk!
      });
    }

    return NextResponse.json({ images });
  } catch (error: any) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}
