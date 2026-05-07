import sharp from 'sharp';
import TextToSVG from 'text-to-svg';
import path from 'path';
import fs from 'fs';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ message: 'API is awake. Please send a POST request.' });
  }

  try {
    // 1. FONT CHECK
    let fontPath = path.join(process.cwd(), 'api', 'fonts', 'Arial.ttf');
    if (!fs.existsSync(fontPath)) fontPath = path.join(process.cwd(), 'fonts', 'Arial.ttf');
    if (!fs.existsSync(fontPath)) throw new Error("Font file missing on server.");

    const textToSVG = TextToSVG.loadSync(fontPath);

    const { stainUrl, floorUrl, counterUrl, cabinetUrl, wallUrl } = req.body;

    if (!stainUrl || !floorUrl || !counterUrl || !cabinetUrl || !wallUrl) {
      return res.status(400).json({ error: 'Missing required image URLs' });
    }

    // 2. FIXED IMAGE FETCHER
    const fetchImage = async (url, width, height) => {
      try {
        console.log("Fetching:", url);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for URL: ${url}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image")) {
          throw new Error(`Not an image (got ${contentType}) for URL: ${url}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 1000) {
          throw new Error(`Buffer too small (${buffer.length} bytes) — likely corrupted: ${url}`);
        }

        // failOnError: false prevents Sharp from throwing on minor EXIF issues
        const image = sharp(buffer, { failOnError: false });
        const metadata = await image.metadata();

        if (!metadata || !metadata.width) {
          throw new Error(`Invalid image metadata for URL: ${url}`);
        }

        return await image
          .resize(width, height, { fit: 'cover' })
          .toBuffer();

      } catch (e) {
        throw new Error(`fetchImage failed | URL: ${url} | Reason: ${e.message}`);
      }
    };

    // 3. FETCH ALL IMAGES
    const [stain, floor, counter, cabinet, wall] = await Promise.all([
      fetchImage(stainUrl,   750, 750),
      fetchImage(floorUrl,   750, 750),
      fetchImage(counterUrl, 750, 750),
      fetchImage(cabinetUrl, 360, 500),
      fetchImage(wallUrl,    360, 500),
    ]);

    // 4. TEXT LAYERS
    const headerOptions = {
      x: 0, y: 0, fontSize: 120, anchor: 'top',
      attributes: { fill: 'red', stroke: 'red', 'stroke-width': 2 }
    };
    const labelOptions = {
      x: 0, y: 0, fontSize: 80, anchor: 'top',
      attributes: { fill: 'black', stroke: 'black', 'stroke-width': 1.5 }
    };

    const createTextLayer = (text, options) => {
      try {
        return Buffer.from(textToSVG.getSVG(text, options));
      } catch (e) {
        throw new Error(`Failed to generate text layer: "${text}" | ${e.message}`);
      }
    };

    // 5. COMPOSITE MANIFEST
    const compositeManifest = [
      { input: createTextLayer("GUID IMAGE", headerOptions),  top: 50,   left: 630  },
      { input: stain,                                          top: 200,  left: 150  },
      { input: createTextLayer("Kitchen Stain", labelOptions), top: 980,  left: 260  },
      { input: floor,                                          top: 200,  left: 1100 },
      { input: createTextLayer("Kitchen Floor", labelOptions), top: 980,  left: 1210 },
      { input: counter,                                        top: 1100, left: 150  },
      { input: createTextLayer("Counter Top", labelOptions),   top: 1860, left: 290  },
      { input: cabinet,                                        top: 1100, left: 1080 },
      { input: createTextLayer("Cabinet", labelOptions),       top: 1640, left: 1110 },
      { input: createTextLayer("Color", labelOptions),         top: 1740, left: 1150 },
      { input: wall,                                           top: 1100, left: 1490 },
      { input: createTextLayer("Wall", labelOptions),          top: 1640, left: 1580 },
      { input: createTextLayer("Color", labelOptions),         top: 1740, left: 1550 },
    ];

    // 6. FINAL COMPOSITE
    let collageBuffer;
    try {
      collageBuffer = await sharp({
        create: { width: 2000, height: 2000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
      })
        .composite(compositeManifest)
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (e) {
      throw new Error(`Failed to stitch collage | Reason: ${e.message}`);
    }

    const base64 = collageBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      message: "Collage generated successfully",
      image: `data:image/jpeg;base64,${base64}`
    });

  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}




// import sharp from 'sharp';
// import TextToSVG from 'text-to-svg';

// const textToSVG = TextToSVG.loadSync();

// export const config = {
//   maxDuration: 30
// };

// export default async function handler(req, res) {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method Not Allowed' });
//   }

//   const { stainUrl, floorUrl, counterUrl, cabinetUrl, wallUrl } = req.body;

//   if (!stainUrl || !floorUrl || !counterUrl || !cabinetUrl || !wallUrl) {
//     return res.status(400).json({ error: 'Missing required image URLs' });
//   }

//   try {
//     const cw = 2000;
//     const ch = 2000;
//     const largeSize = 750;
//     const smallW = 360;
//     const smallH = 500;

//     const fetchImage = async (url, width, height) => {
//       const controller = new AbortController();
//       const timeout = setTimeout(() => controller.abort(), 10000);
      
//       try {
//         const response = await fetch(url, { signal: controller.signal });
//         if (!response.ok) throw new Error(`Failed to fetch image from: ${url}`);
        
//         const buffer = Buffer.from(await response.arrayBuffer());
//         return sharp(buffer).resize(width, height, { fit: 'cover' }).toBuffer();
//       } finally {
//         clearTimeout(timeout);
//       }
//     };

//     const [stain, floor, counter, cabinet, wall] = await Promise.all([
//       fetchImage(stainUrl, largeSize, largeSize),
//       fetchImage(floorUrl, largeSize, largeSize),
//       fetchImage(counterUrl, largeSize, largeSize),
//       fetchImage(cabinetUrl, smallW, smallH),
//       fetchImage(wallUrl, smallW, smallH)
//     ]);

//     const headerOptions = { 
//       x: 0, 
//       y: 0, 
//       fontSize: 120, 
//       anchor: 'top', 
//       attributes: { fill: 'red', stroke: 'red', 'stroke-width': 2 } 
//     };
    
//     const labelOptions = { 
//       x: 0, 
//       y: 0, 
//       fontSize: 80, 
//       anchor: 'top', 
//       attributes: { fill: 'black', stroke: 'black', 'stroke-width': 1.5 } 
//     };

//     const titleSvg = Buffer.from(textToSVG.getSVG("GUID IMAGE", headerOptions));
//     const labelStain = Buffer.from(textToSVG.getSVG("Kitchen Stain", labelOptions));
//     const labelFloor = Buffer.from(textToSVG.getSVG("Kitchen Floor", labelOptions));
//     const labelCounter = Buffer.from(textToSVG.getSVG("Counter Top", labelOptions));
//     const labelCabinet1 = Buffer.from(textToSVG.getSVG("Cabinet", labelOptions));
//     const labelCabinet2 = Buffer.from(textToSVG.getSVG("Color", labelOptions));
//     const labelWall1 = Buffer.from(textToSVG.getSVG("Wall", labelOptions));
//     const labelWall2 = Buffer.from(textToSVG.getSVG("Color", labelOptions));

//     const compositeManifest = [
//       { input: titleSvg, top: 50, left: 630 },
//       { input: stain, top: 200, left: 150 },
//       { input: labelStain, top: 980, left: 260 },
//       { input: floor, top: 200, left: 1100 },
//       { input: labelFloor, top: 980, left: 1210 },
//       { input: counter, top: 1100, left: 150 },
//       { input: labelCounter, top: 1860, left: 290 },
//       { input: cabinet, top: 1100, left: 1080 },
//       { input: labelCabinet1, top: 1640, left: 1110 },
//       { input: labelCabinet2, top: 1740, left: 1150 },
//       { input: wall, top: 1100, left: 1490 },
//       { input: labelWall1, top: 1640, left: 1580 },
//       { input: labelWall2, top: 1740, left: 1550 },
//     ];

//     const collageBuffer = await sharp({
//       create: { width: cw, height: ch, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
//     })
//     .composite(compositeManifest)
//     .jpeg({ quality: 90 })
//     .toBuffer();

//     const base64 = collageBuffer.toString('base64');

//     return res.status(200).json({
//       success: true,
//       message: "Collage generated successfully",
//       image: `data:image/jpeg;base64,${base64}`
//     });

//   } catch (err) {
//     console.error("Collage Generation Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// }
