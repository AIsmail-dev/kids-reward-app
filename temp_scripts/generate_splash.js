import sharp from "sharp";

const sizes = [
    { width: 375, height: 812, name: "splash-375x812.png" }, // iPhone X/XS/11Pro
    { width: 414, height: 896, name: "splash-414x896.png" }, // iPhone XR/11/11ProMax
    { width: 390, height: 844, name: "splash-390x844.png" }, // iPhone 12/13/14
    { width: 428, height: 926, name: "splash-428x926.png" }, // iPhone 12/13/14 Pro Max
    { width: 430, height: 932, name: "splash-430x932.png" }, // iPhone 14/15 Pro Max
    { width: 360, height: 800, name: "splash-360x800.png" }, // Average Android Small
    { width: 412, height: 915, name: "splash-412x915.png" }  // Average Android Large
];

async function generate() {
    console.log("Generating Splash Screens...");
    for (const s of sizes) {
        await sharp("public/icon.png")
            .resize(s.width * 3, s.height * 3, { // Generous Retina 3x scaling
                fit: "fill" // Fill to not crop
            })
            .toFile(`public/${s.name}`);
        console.log(`Generated ${s.name} at ${s.width * 3}x${s.height * 3}`);
    }
}

generate();
