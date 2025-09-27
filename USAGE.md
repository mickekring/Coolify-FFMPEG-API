# FFmpeg API Usage Guide for n8n

This guide shows how to use the FFmpeg API service in your n8n workflows.

## Service URL

When deployed on Coolify, the service is available internally at:
```
http://ffmpeg-api:3000
```

## General n8n Configuration

For all endpoints (except `/health`):

1. Use the **HTTP Request** node
2. Set **Method** to `POST`
3. Set **Body Content Type** to `Form-Data (Multipart)`
4. Add your file as a binary field
5. Add any additional parameters as form fields

---

## Endpoint Examples

### 1. Compress Audio for Transcription (Whisper/Groq)

**Optimized for speech-to-text services (16kHz mono FLAC)**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/compress/transcription
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data (or your binary field name)
```

**Use Case:** Compress podcast/audio files before sending to Whisper or Groq for transcription.

**Response Headers:**
- `X-Original-Size`: Original file size in bytes
- `X-Compressed-Size`: Compressed file size in bytes
- `X-Compression-Ratio`: Compression percentage

---

### 2. Custom Audio Compression

**Full control over compression settings**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/compress/custom
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data

- Name: format
  Type: String
  Value: mp3 (or wav, aac, etc.)

- Name: bitrate
  Type: String
  Value: 64k (or 128k, 192k, etc.)

- Name: sampleRate
  Type: String
  Value: 16000 (or 22050, 44100, 48000)

- Name: channels
  Type: String
  Value: 1 (mono) or 2 (stereo)
```

**Example Settings:**
- **Low quality/small file:** `bitrate: 64k`, `sampleRate: 16000`, `channels: 1`
- **Medium quality:** `bitrate: 128k`, `sampleRate: 44100`, `channels: 2`
- **High quality:** `bitrate: 192k`, `sampleRate: 48000`, `channels: 2`

---

### 3. Convert Audio Format

**Convert between audio formats**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/convert
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data

- Name: outputFormat
  Type: String
  Value: mp3 (or wav, flac, aac, ogg, etc.)
```

**Use Case:** Convert podcast WAV files to MP3, or any audio format conversion.

---

### 4. Extract Audio from Video

**Extract audio track from video files**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/extract-audio
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data

- Name: format
  Type: String
  Value: mp3 (optional, default: mp3)

- Name: bitrate
  Type: String
  Value: 192k (optional, default: 192k)
```

**Use Case:** Extract audio from video recordings for transcription or podcast episodes.

---

### 5. Split Audio into Chunks

**Split large audio files into smaller segments**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/split
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data

- Name: segmentTime
  Type: String
  Value: 600 (default: 600 seconds = 10 minutes)

- Name: format
  Type: String
  Value: mp3 (optional, default: mp3)
```

**Example Values:**
- 5 minutes: `300`
- 10 minutes: `600`
- 20 minutes: `1200`
- 30 minutes: `1800`

**Response Format:**
```json
{
  "totalSegments": 3,
  "segmentDuration": "600 seconds",
  "segments": [
    {
      "filename": "segment_000.mp3",
      "data": "base64encodeddata...",
      "size": 1234567
    }
  ]
}
```

**Use Case:** Split long podcast episodes for processing in chunks or meeting API size limits.

---

### 6. Get Media File Information

**Retrieve metadata and technical details**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/info
Method: POST
Body Content Type: Form-Data (Multipart)

Body Parameters:
- Name: file
  Type: Binary File
  Input Data Field Name: data
```

**Response Includes:**
- Duration
- Bitrate
- Sample rate
- Channels
- Codec information
- Format details

**Use Case:** Check audio properties before processing or validate file requirements.

---

### 7. Health Check

**Verify service availability**

**n8n HTTP Request Node Configuration:**
```
URL: http://ffmpeg-api:3000/health
Method: GET
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ffmpeg-api"
}
```

**Use Case:** Monitor service health in workflows or add as a workflow dependency check.

---

## Complete n8n Workflow Example

### Podcast Transcription Pipeline

1. **Read Binary File** node
   - Load your podcast MP3 file

2. **HTTP Request** node (Compress)
   - URL: `http://ffmpeg-api:3000/compress/transcription`
   - Method: POST
   - Body: Form-Data with file from previous node
   - Output: Compressed FLAC file optimized for transcription

3. **HTTP Request** node (Transcribe)
   - URL: Your Whisper/Groq endpoint
   - Method: POST
   - Body: Compressed audio from previous node
   - Output: Transcription text

---

## Tips for n8n

1. **Binary Data Handling:** Make sure the previous node outputs binary data that you can reference in the file field

2. **Error Handling:** Add error handling nodes to catch failures (invalid files, processing errors)

3. **File Size Limits:** The API accepts files up to 500MB

4. **Response Data:** Most endpoints return binary audio data. Use **Move Binary Data** node if you need to process the result further

5. **Testing:** Use the `/health` endpoint first to verify connectivity before building complex workflows

6. **Chaining Operations:** You can chain multiple endpoints (e.g., extract audio → compress → split → transcribe)

---

## Troubleshooting

**"No file uploaded" error:**
- Ensure the file field name is exactly `file`
- Check that binary data is properly passed from the previous node

**"Compression failed" error:**
- Verify the input file is a valid audio/video format
- Check file size is under 500MB
- Review the `details` field in the error response for FFmpeg error messages

**Connection refused:**
- Verify the service name matches your Coolify deployment
- Ensure both services are in the same network
- Check the service is running with `/health` endpoint