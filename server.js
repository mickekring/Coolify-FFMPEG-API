const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 5000 * 1024 * 1024 // 5000MB max
  }
});

app.use(express.json());

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const providedKey = req.headers['x-api-key'];
  
  if (!API_KEY) {
    console.warn('WARNING: API_KEY not set. Authentication disabled.');
    return next();
  }
  
  if (!providedKey) {
    return res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
  }
  
  if (providedKey !== API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ffmpeg-api' });
});

// Compress audio for transcription (Whisper/Groq optimal)
app.post('/compress/transcription', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.mp3`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    // Convert to 16kHz mono MP3 at 64kbps (optimal for Whisper)
    const command = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 64k "${outputPath}" -y`;
    
    try {
      await execPromise(command);
      
      const stats = await fs.stat(outputPath);
      const compressedFile = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="compressed.mp3"',
        'X-Original-Size': req.file.size,
        'X-Compressed-Size': stats.size,
        'X-Compression-Ratio': `${((1 - stats.size / req.file.size) * 100).toFixed(2)}%`
      });

      res.send(compressedFile);
    } catch (error) {
      console.error('FFmpeg error:', error.stderr || error.message);
      res.status(500).json({ error: 'Compression failed', details: error.stderr || error.message });
    } finally {
      await fs.unlink(inputPath).catch(() => {});
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Custom compression
app.post('/compress/custom', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const {
    format = 'mp3',
    bitrate = '128k',
    sampleRate = '44100',
    channels = '2'
  } = req.body;

  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.${format}`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    let command = `ffmpeg -i "${inputPath}"`;
    if (bitrate) command += ` -b:a ${bitrate}`;
    if (sampleRate) command += ` -ar ${sampleRate}`;
    if (channels) command += ` -ac ${channels}`;
    command += ` "${outputPath}" -y`;

    try {
      await execPromise(command);
      
      const compressedFile = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      res.set({
        'Content-Type': `audio/${format}`,
        'Content-Disposition': `attachment; filename="compressed.${format}"`
      });

      res.send(compressedFile);
    } catch (error) {
      console.error('FFmpeg error:', error.stderr || error.message);
      res.status(500).json({ error: 'Compression failed', details: error.stderr || error.message });
    } finally {
      await fs.unlink(inputPath).catch(() => {});
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Convert format
app.post('/convert', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const {
    outputFormat = 'mp3',
    // Input format params for raw PCM files
    inputFormat,      // e.g., "s16le" (16-bit signed little-endian)
    inputSampleRate,  // e.g., "24000"
    inputChannels     // e.g., "1"
  } = req.body;
  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.${outputFormat}`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    // Build command with optional input format flags for raw PCM
    let inputFlags = '';
    if (inputFormat) inputFlags += ` -f ${inputFormat}`;
    if (inputSampleRate) inputFlags += ` -ar ${inputSampleRate}`;
    if (inputChannels) inputFlags += ` -ac ${inputChannels}`;

    try {
      await execPromise(`ffmpeg${inputFlags} -i "${inputPath}" "${outputPath}" -y`);
      
      const convertedFile = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      res.set({
        'Content-Type': `audio/${outputFormat}`,
        'Content-Disposition': `attachment; filename="converted.${outputFormat}"`
      });

      res.send(convertedFile);
    } catch (error) {
      res.status(500).json({ error: 'Conversion failed', details: error.stderr || error.message });
    } finally {
      await fs.unlink(inputPath).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Extract audio from video
app.post('/extract-audio', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { format = 'mp3', bitrate = '192k' } = req.body;
  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.${format}`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    const command = `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab ${bitrate} "${outputPath}" -y`;

    try {
      await execPromise(command);
      
      const audioFile = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      res.set({
        'Content-Type': `audio/${format}`,
        'Content-Disposition': `attachment; filename="audio.${format}"`
      });

      res.send(audioFile);
    } catch (error) {
      res.status(500).json({ error: 'Extraction failed', details: error.stderr || error.message });
    } finally {
      await fs.unlink(inputPath).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Split audio into chunks
app.post('/split', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { segmentTime = '600', format = 'mp3' } = req.body;
  const inputPath = req.file.path;
  const outputDir = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}`;

  try {
    await fs.mkdir(outputDir, { recursive: true });

    const outputPattern = path.join(outputDir, `segment_%03d.${format}`);
    const command = `ffmpeg -i "${inputPath}" -f segment -segment_time ${segmentTime} -c copy "${outputPattern}"`;

    try {
      await execPromise(command);
      
      const files = await fs.readdir(outputDir);
      const segments = [];

      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const fileContent = await fs.readFile(filePath);
        segments.push({
          filename: file,
          data: fileContent.toString('base64'),
          size: fileContent.length
        });
        await fs.unlink(filePath);
      }

      await fs.rm(outputDir, { recursive: true });

      res.json({
        totalSegments: segments.length,
        segmentDuration: `${segmentTime} seconds`,
        segments: segments
      });
    } catch (error) {
      res.status(500).json({ error: 'Split failed', details: error.stderr || error.message });
    } finally {
      await fs.unlink(inputPath).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media info
app.post('/info', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;

  try {
    const { stdout } = await execPromise(`ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`);
    res.json(JSON.parse(stdout));
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(500).json({ error: 'Failed to parse file info' });
    } else {
      res.status(500).json({ error: 'Failed to get file info' });
    }
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
});

// Clean up temp directories
async function cleanup() {
  try {
    await fs.rm('/tmp/uploads', { recursive: true, force: true });
    await fs.rm('/tmp/outputs', { recursive: true, force: true });
    await fs.mkdir('/tmp/uploads', { recursive: true });
    await fs.mkdir('/tmp/outputs', { recursive: true });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Initial cleanup
cleanup();

// Periodic cleanup every hour
setInterval(cleanup, 3600000);

app.listen(PORT, () => {
  console.log(`FFmpeg API service running on port ${PORT}`);
});