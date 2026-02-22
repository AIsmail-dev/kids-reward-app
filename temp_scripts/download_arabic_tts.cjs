const fs = require('fs');
const https = require('https');
const path = require('path');

function downloadTTS(text, filename) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ar&client=tw-ob`;
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

// Prayer start sounds
downloadTTS("موعد صلاة الفجر", "fajr_now.mp3");
downloadTTS("تذكير بصلاة الفجر", "fajr_remind.mp3");

downloadTTS("موعد صلاة الظهر", "dhuhr_now.mp3");
downloadTTS("تذكير بصلاة الظهر", "dhuhr_remind.mp3");

downloadTTS("موعد صلاة العصر", "asr_now.mp3");
downloadTTS("تذكير بصلاة العصر", "asr_remind.mp3");

downloadTTS("موعد صلاة المغرب", "maghrib_now.mp3");
downloadTTS("تذكير بصلاة المغرب", "maghrib_remind.mp3");

downloadTTS("موعد صلاة العشاء", "isha_now.mp3");
downloadTTS("تذكير بصلاة العشاء", "isha_remind.mp3");
