import sharp from 'sharp';
import TextToSVG from 'text-to-svg';

const textToSVG = TextToSVG.loadSync();

export const config = {
  maxDuration: 30
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { stainUrl, floorUrl, counterUrl, cabinetUrl, wallUrl } = req.body;

  if (!stainUrl || !floorUrl || !counterUrl || !cabinetUrl || !wallUrl) {
    return res.status(400).json({ error: 'Missing required image URLs' });
  }

  try {
    const cw = 2000;
    const ch = 2000;
    const largeSize = 750;
    const smallW = 360;
    const smallH = 500;

    const fetchImage = async (url, width, height) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to fetch image from: ${url}`);
        
        const buffer = Buffer.from(await response.arrayBuffer());
        return sharp(buffer).resize(width, height, { fit: 'cover' }).toBuffer();
      } finally {
        clearTimeout(timeout);
      }
    };

    const [stain, floor, counter, cabinet, wall] = await Promise.all([
      fetchImage(stainUrl, largeSize, largeSize),
      fetchImage(floorUrl, largeSize, largeSize),
      fetchImage(counterUrl, largeSize, largeSize),
      fetchImage(cabinetUrl, smallW, smallH),
      fetchImage(wallUrl, smallW, smallH)
    ]);

    const headerOptions = { 
      x: 0, 
      y: 0, 
      fontSize: 120, 
      anchor: 'top', 
      attributes: { fill: 'red', stroke: 'red', 'stroke-width': 2 } 
    };
    
    const labelOptions = { 
      x: 0, 
      y: 0, 
      fontSize: 80, 
      anchor: 'top', 
      attributes: { fill: 'black', stroke: 'black', 'stroke-width': 1.5 } 
    };

    const titleSvg = Buffer.from(textToSVG.getSVG("GUID IMAGE", headerOptions));
    const labelStain = Buffer.from(textToSVG.getSVG("Kitchen Stain", labelOptions));
    const labelFloor = Buffer.from(textToSVG.getSVG("Kitchen Floor", labelOptions));
    const labelCounter = Buffer.from(textToSVG.getSVG("Counter Top", labelOptions));
    const labelCabinet1 = Buffer.from(textToSVG.getSVG("Cabinet", labelOptions));
    const labelCabinet2 = Buffer.from(textToSVG.getSVG("Color", labelOptions));
    const labelWall1 = Buffer.from(textToSVG.getSVG("Wall", labelOptions));
    const labelWall2 = Buffer.from(textToSVG.getSVG("Color", labelOptions));

    const compositeManifest = [
      { input: titleSvg, top: 50, left: 630 },
      { input: stain, top: 200, left: 150 },
      { input: labelStain, top: 980, left: 260 },
      { input: floor, top: 200, left: 1100 },
      { input: labelFloor, top: 980, left: 1210 },
      { input: counter, top: 1100, left: 150 },
      { input: labelCounter, top: 1860, left: 290 },
      { input: cabinet, top: 1100, left: 1080 },
      { input: labelCabinet1, top: 1640, left: 1110 },
      { input: labelCabinet2, top: 1740, left: 1150 },
      { input: wall, top: 1100, left: 1490 },
      { input: labelWall1, top: 1640, left: 1580 },
      { input: labelWall2, top: 1740, left: 1550 },
    ];

    const collageBuffer = await sharp({
      create: { width: cw, height: ch, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite(compositeManifest)
    .jpeg({ quality: 90 })
    .toBuffer();

    const base64 = collageBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      message: "Collage generated successfully",
      image: `data:image/jpeg;base64,${base64}`
    });

  } catch (err) {
    console.error("Collage Generation Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
