# GMIC Buildathon Project

This is a submission for the Linera Buildathon that implements a GM (Good Morning) social application with cross-chain messaging capabilities.

## Overview

The GMIC (Good Morning Cross-chain) application allows users to send "GM" messages across different chains, track statistics, and participate in leaderboards. It includes features like cooldown periods, invitation systems, and user activity tracking.

The web frontend has been enhanced with advanced messaging features including voice messages, GIF support, real-time notifications, and comprehensive error handling.

## Structure

The project consists of:

- `src/`: Rust source code for the Linera contract and service
  - `lib.rs`: Core message types and ABI definitions
  - `contract.rs`: Smart contract implementation with GM operations
  - `service.rs`: GraphQL service implementation
  - `state.rs`: State management and statistics
- `web-frontend/`: Enhanced frontend application built with Vite and React 18
  - Voice message recording and playback
  - GIF message support with expandable previews
  - Real-time message synchronization
  - Mobile-responsive design
  - Comprehensive error handling and notifications
- `run.bash`: Script to build and run the application locally
- `compose.yaml`: Docker Compose configuration (experimental, not fully tested)
- `Dockerfile`: Docker configuration for containerized deployment

## Usage

### Running Locally with run.bash

The recommended way to run this application is using the `run.bash` script:

```bash
chmod +x run.bash && ./run.bash
```

This script will:
1. Set up the necessary environment and directories
2. Initialize a Linera wallet (if not already initialized)
3. Request a new chain from the faucet
4. Build the WASM modules for the contract and service
5. Publish the modules to the chain
6. Create the application with the specified owner
7. Save configuration to `.env` file for the frontend
8. Start the Linera service on port 8080
9. Build and run the frontend on port 3000
10. Display access URLs and log file locations

The application will be accessible at:
- Frontend: http://localhost:3000/[CHAIN_ID]?app=[APP_ID]&owner=[OWNER_ID]&port=8080
- GraphQL API: http://localhost:8080/chains/[CHAIN_ID]/applications/[APP_ID]

### Enhanced Frontend Configuration

The web frontend requires additional Pinata API configuration for voice message storage:

1. **Pinata Setup**: Create a free account at [pinata.cloud](https://pinata.cloud)
2. **API Keys**: Generate API keys in your Pinata dashboard
3. **Environment Variables**: Add to your `.env` file:
   ```
   VITE_PINATA_API_KEY=your_pinata_api_key
   VITE_PINATA_SECRET_API_KEY=your_pinata_secret_api_key
   ```

4. **Voice Message Features**:
   - Audio recording using MediaRecorder API
   - Automatic upload to IPFS via Pinata
   - Visual waveform display during playback
   - Progress tracking and duration display

### Running with Docker (Experimental)

Docker support is available through `compose.yaml` but is still experimental and **not fully tested**:

```bash
docker compose up
```

**Note**: The Docker configuration has not been thoroughly tested and may contain issues. For reliable deployment, please use the `run.bash` script instead.

## Features

### Core Features
- Cross-chain GM messaging
- 24-hour cooldown period between messages
- User statistics and leaderboards
- Invitation system with rewards
- Activity trend analysis
- GraphQL API for querying data
- Real-time event subscriptions

### Enhanced Web Frontend Features
- **Voice Messaging**: Record and send voice messages with audio playback controls
- **GIF Support**: Send and view GIF messages with expandable preview
- **Message Deduplication**: Prevents duplicate message sending and display
- **Real-time Notifications**: User-friendly error notifications in English
- **Mobile Responsive**: Optimized for both desktop and mobile devices
- **Audio Playback**: Visual waveform display with progress tracking
- **Enhanced Error Handling**: Comprehensive error notifications and logging
- **Message Validation**: Prevents sending messages to self with clear notifications

## Development

To modify the application:

1. Update the Rust source code in the `src/` directory
2. Modify the frontend in the `web-frontend/` directory
3. Run `./run.bash` to test your changes

### Important Configuration Notes

1. **24-Hour Cooldown Whitelist**: The application includes a 24-hour cooldown system for sending messages. In `src/state.rs`, there is a hardcoded whitelist address that bypasses this cooldown. **You should modify this address to your own** before deploying:

   ```rust
   // In src/state.rs, line ~66
   let default_whitelist_address: AccountOwner = "0xa0916f957038344afff8c117b0a568562f73f0f2"
       .to_lowercase()
       .parse()
       .map_err(|_| ViewError::NotFound("Failed to parse default whitelist address".to_string()))?;
   ```

2. **Frontend Environment Variables**: The web frontend requires a `.env` file in the `web-frontend/` directory with:
   ```
   VITE_CHAIN_ID=your_chain_id
   VITE_APP_ID=your_app_id
   VITE_OWNER_ID=your_owner_id
   VITE_PORT=8080
   VITE_HOST=localhost
   VITE_PINATA_API_KEY=your_pinata_api_key
   VITE_PINATA_SECRET_API_KEY=your_pinata_secret_api_key
   ```

3. **Docker Configuration**: The Docker setup is experimental and not fully tested. For production use, prefer the `run.bash` script.

The application uses the Linera SDK for smart contract development and GraphQL for the API layer.

## Frontend Troubleshooting

### Voice Messages Not Working
- **Microphone Permissions**: Ensure your browser allows microphone access
- **Pinata API Keys**: Verify your Pinata API credentials are correct in the `.env` file
- **Network Issues**: Check internet connection for IPFS uploads
- **Browser Support**: Ensure you're using a modern browser with MediaRecorder API support

### Messages Sending Multiple Times
- The frontend includes duplicate prevention mechanisms
- Check network connectivity - poor connections may cause retries
- Verify the send button isn't being double-clicked

### Audio Playback Issues
- Voice messages use HTML5 audio elements
- Check browser audio permissions
- Ensure audio files are properly uploaded to IPFS

### Mobile Display Problems
- The frontend is fully responsive and mobile-optimized
- Test on different screen sizes
- Check for CSS conflicts in browser developer tools

### Error Notifications
- All error messages are displayed in English
- Check browser console for detailed error logs
- Only "New subscription event" and "Syncing 24-hour limit status" logs are preserved in production
