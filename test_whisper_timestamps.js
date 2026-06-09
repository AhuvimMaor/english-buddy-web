const { OpenAI } = require('openai');
const fs = require('fs');

async function run() {
  const openai = new OpenAI();
  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream('/opt/ocana/openclaw/workspace/turn_1_A.mp3'),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: 'en'
    });
    console.log("Segments:", JSON.stringify(response.segments, null, 2));
    console.log("Full response keys:", Object.keys(response));
  } catch (e) {
    console.error(e);
  }
}
run();
