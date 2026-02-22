const fs = require('fs');
const https = require('https');
const path = require('path');

function downloadTTS(text, filename) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    const filePath = path.join(__dirname, '..', 'public', filename);

    https.get(url, (res) => {
        const file = fs.createWriteStream(filePath);
        res.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log(`Downloaded ${filename}`);
        });
    }).on('error', (err) => {
        console.error(`Error downloading ${filename}:`, err.message);
    });
}

downloadTTS("A task has been completed and needs your approval!", "notify_parent.mp3");
downloadTTS("Awesome! Your task was approved and you received your reward!", "notify_kid.mp3");
