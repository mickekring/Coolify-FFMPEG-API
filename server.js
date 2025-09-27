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

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ffmpeg-api' });
});

// Compress audio for transcription (Whisper/Groq optimal)
app.post('/compress/transcription', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.flac`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    // Convert to 16kHz mono FLAC (optimal for Whisper)
    const command = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a flac "${outputPath}" -y`;
    
    try {
      await execPromise(command);
      
      const stats = await fs.stat(outputPath);
      const compressedFile = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      res.set({
        'Content-Type': 'audio/flac',
        'Content-Disposition': 'attachment; filename="compressed.flac"',
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
app.post('/compress/custom', upload.single('file'), async (req, res) => {
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
app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { outputFormat = 'mp3' } = req.body;
  const inputPath = req.file.path;
  const outputPath = `/tmp/outputs/${crypto.randomBytes(16).toString('hex')}.${outputFormat}`;

  try {
    await fs.mkdir('/tmp/outputs', { recursive: true });

    try {
      await execPromise(`ffmpeg -i "${inputPath}" "${outputPath}" -y`);
      
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
app.post('/extract-audio', upload.single('file'), async (req, res) => {
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
app.post('/split', upload.single('file'), async (req, res) => {
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
app.post('/info', upload.single('file'), async (req, res) => {
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