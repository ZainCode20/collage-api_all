import sharp from 'sharp';
import TextToSVG from 'text-to-svg';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {

  // STEP 1: Verify Sharp works at all
  try {
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).jpeg().toBuffer();
  } catch (e) {
    return res.status(500).json({ success: false, error: `Sharp init failed: ${e.message}` });
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ message: 'API is awake.' });
  }

  try {
    // STEP 2: Use built-in font — no file needed on server
    const textToSVG = TextToSVG.loadSync();
    const body = req.body;

    // STEP 3: Centralized image fetcher
    const fetchImage = async (url, width, height) => {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CollageBot/1.0)',
          'Accept': 'image/webp,image/jpeg,image/png,image/*'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);

      const buffer = Buffer.from(await response.arrayBuffer());

      const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
      const isPNG  = buffer[0] === 0x89 && buffer[1] === 0x50;
      const isWEBP = buffer.slice(8, 12).toString('ascii') === 'WEBP';

      if (!isJPEG && !isPNG && !isWEBP) {
        throw new Error(`Not a valid image at ${url}. Got: ${buffer.slice(0, 80).toString('utf8')}`);
      }

      return sharp(buffer, { failOnError: false })
        .resize(width, height, { fit: 'cover' })
        .toBuffer();
    };

    // Centralized text layer helper
    const t = (text, opts) => Buffer.from(textToSVG.getSVG(text, opts));
    
    let compositeArray = [];
    const headerOptions = { x: 0, y: 0, fontSize: 120, anchor: 'top', attributes: { fill: 'red', stroke: 'red', 'stroke-width': 2 } };
    const labelOptions  = { x: 0, y: 0, fontSize: 80,  anchor: 'top', attributes: { fill: 'black', stroke: 'black', 'stroke-width': 1.5 } };

    // --- TEMPLATE 3: Island Guide (2 Images) ---
    if (body.islandCountertop && body.islandCabinets) {
      const [countertopImg, cabinetsImg] = await Promise.all([
        fetchImage(body.islandCountertop, 800, 800),
        fetchImage(body.islandCabinets,   800, 800),
      ]);

      const islandHeaderOpts = { ...headerOptions, fontSize: 130 };
      const islandLabelOpts  = { ...labelOptions, fontSize: 90 };

      compositeArray = [
        { input: t("ISLAND GUIDE", islandHeaderOpts), top: 100,  left: 750  },
        { input: countertopImg,                       top: 300,  left: 100  },
        { input: t("Island Countertop", islandLabelOpts), top: 1150, left: 100  },
        { input: cabinetsImg,                         top: 300,  left: 1100 },
        { input: t("Island Cabinets", islandLabelOpts),   top: 1150, left: 1100 },
      ];
    }
    
    // --- TEMPLATE 1: Full Kitchen (5 Images: Stain + Cabinet + Floor + Counter + Wall) ---
    else if (body.stainUrl && body.cabinetUrl && body.floorUrl && body.counterUrl && body.wallUrl) {
      const [stain, floor, counter, cabinet, wall] = await Promise.all([
        fetchImage(body.stainUrl,   750, 750),
        fetchImage(body.floorUrl,   750, 750),
        fetchImage(body.counterUrl, 750, 750),
        fetchImage(body.cabinetUrl, 360, 500),
        fetchImage(body.wallUrl,    360, 500),
      ]);

      compositeArray = [
        { input: t("GUIDE IMAGE", headerOptions), top: 50,   left: 630  },
        { input: stain,                           top: 200,  left: 150  },
        { input: t("Kitchen Stain", labelOptions),top: 980,  left: 260  },
        { input: floor,                           top: 200,  left: 1100 },
        { input: t("Kitchen Floor", labelOptions),top: 980,  left: 1210 },
        { input: counter,                         top: 1100, left: 150  },
        { input: t("Counter Top",   labelOptions),top: 1860, left: 290  },
        { input: cabinet,                         top: 1100, left: 1080 },
        { input: t("Cabinet",       labelOptions),top: 1640, left: 1110 },
        { input: t("Color",         labelOptions),top: 1740, left: 1150 },
        { input: wall,                            top: 1100, left: 1490 },
        { input: t("Wall",          labelOptions),top: 1640, left: 1580 },
        { input: t("Color",         labelOptions),top: 1740, left: 1550 },
      ];
    }
    
    // --- TEMPLATE 2: Kitchen (4 Images: Stain + Floor + Counter + Wall) ---
    // If it reaches here, it means we have a stainUrl but NO cabinetUrl
    else if (body.stainUrl && body.floorUrl && body.counterUrl && body.wallUrl) {
      const [stain, floor, counter, wall] = await Promise.all([
        fetchImage(body.stainUrl, 750, 750),
        fetchImage(body.floorUrl,   750, 750),
        fetchImage(body.counterUrl, 750, 750),
        fetchImage(body.wallUrl,    750, 750), 
      ]);

      compositeArray = [
        { input: t("GUIDE IMAGE", headerOptions), top: 50,   left: 630  },
        
        // Row 1
        { input: stain,                           top: 200,  left: 150  },
        { input: t("Kitchen Stain", labelOptions),top: 980,  left: 260  },
        { input: floor,                           top: 200,  left: 1100 },
        { input: t("Kitchen Floor", labelOptions),top: 980,  left: 1210 },
        
        // Row 2
        { input: counter,                         top: 1100, left: 150  },
        { input: t("Counter Top",   labelOptions),top: 1860, left: 290  },
        { input: wall,                            top: 1100, left: 1100 },
        { input: t("Wall Color",    labelOptions),top: 1860, left: 1280 },
      ];
    } 
    
    // --- Error: Missing or mismatched parameters ---
    else {
      return res.status(400).json({ 
        error: 'Missing or incorrect image URLs. Please provide the proper keys for the 5-image, 4-image (Stain instead of Cabinet), or 2-image collage templates.' 
      });
    }

    // STEP 4: Final composite execution
    const collageBuffer = await sharp({
      create: { width: 2000, height: 2000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite(compositeArray)
    .jpeg({ quality: 90 })
    .toBuffer();

    return res.status(200).json({
      success: true,
      image: `data:image/jpeg;base64,${collageBuffer.toString('base64')}`
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}


//Old code
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
