FROM node:22-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Create app directory
WORKDIR /app

# Package.json
COPY package.json ./

# Install dependencies
RUN npm install

# Copy server file
COPY server.js .

# Create temp directories
RUN mkdir -p /tmp/uploads /tmp/outputs

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]