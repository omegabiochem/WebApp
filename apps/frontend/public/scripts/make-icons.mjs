import sharp from "sharp";

// Since we'll run the script from apps/public, use local filenames:
const src = "logo.svg"; // can also be "logo.svg" (sharp supports SVG)

// favicon sizes
await sharp(src).resize(16,16).png().toFile("favicon-16x16.png");
await sharp(src).resize(32,32).png().toFile("favicon-32x32.png");

// Apple & Android
await sharp(src).resize(180,180).png().toFile("apple-touch-icon.png");
await sharp(src).resize(192,192).png().toFile("android-chrome-192x192.png");
await sharp(src).resize(512,512).png().toFile("android-chrome-512x512.png");

// Social preview (1200x630)
await sharp(src).resize(1200,630,{fit:"cover"}).png().toFile("og-image.png");

console.log("✅ Icons generated in apps/public");
