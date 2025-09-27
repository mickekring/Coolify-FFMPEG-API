# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a simple Express.js API service that wraps FFmpeg functionality for audio/video processing. The service is designed to run in a Docker container and processes media files through various endpoints. It's intended for internal use and is deployed using Coolify.

## Architecture

**Single-file application**: All server logic is in `server.js` - a straightforward Express app with no additional modules or separation of concerns.

**File processing flow**:
1. Files uploaded via multer to `/tmp/uploads/` (max 500MB)
2. FFmpeg processes files via child_process exec
3. Output written to `/tmp/outputs/` with random hex filenames
4. Files returned to client and immediately cleaned up
5. Periodic cleanup runs every hour

**Key characteristics**:
- Stateless: No database, no session management
- Ephemeral storage: All files are temporary and cleaned up
- Synchronous FFmpeg execution: Uses exec() callbacks, not promises
- Direct buffer responses: Processed files sent as binary data

## API Endpoints

All processing endpoints accept `multipart/form-data` with a single file:

- `POST /compress/transcription` - Converts to 16kHz mono FLAC (optimized for Whisper/Groq)
- `POST /compress/custom` - Accepts format, bitrate, sampleRate, channels in body
- `POST /convert` - Simple format conversion, accepts outputFormat in body
- `POST /extract-audio` - Extracts audio from video, accepts format and bitrate in body
- `POST /split` - Splits audio into segments, accepts segmentTime and format in body
- `POST /info` - Uses ffprobe to get media metadata
- `GET /health` - Health check endpoint

## Commands

**Start server**:
```bash
npm start
```

**Run with Docker**:
```bash
docker build -t ffmpeg-api .
docker run -p 3000:3000 ffmpeg-api
```

**Test locally** (requires FFmpeg installed):
```bash
# Install FFmpeg on macOS
brew install ffmpeg

# Start the server
npm install
npm start
```

## FFmpeg Command Patterns

The service uses specific FFmpeg command patterns:
- Shell command injection risk: Commands are built with string concatenation without input sanitization
- Input files referenced directly: `${inputPath}` from multer
- Output always uses `-y` flag to overwrite existing files
- Audio extraction uses libmp3lame codec specifically

## Development Notes

- No linting or type checking configured
- No test suite present
- Error handling returns stderr from FFmpeg directly to clients
- Temp directories created on startup and cleaned every hour via setInterval