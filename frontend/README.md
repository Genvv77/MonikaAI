# Monika GF Mode Frontend

This is the frontend service for the Monika Virtual Girlfriend application. It provides a user interface for interacting with the virtual avatar, supporting real-time chat, audio playback, and lip-sync animations.

## Features

- **Chat Interface**: Allows users to send and receive messages.
- **Audio Playback**: Plays generated speech from the backend.
- **Lip-Syncing**: Displays avatar animations based on audio responses.
- **Facial Expressions and Animations**: Enhances interactivity with dynamic visuals.

## Prerequisites

- Node.js (v16 or higher)
- React.js (latest version)
- A running instance of the Virtual Girlfriend backend

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/virtual-girlfriend.git
   cd virtual-girlfriend/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the frontend directory and add the backend API URL:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:3000
   ```

## Usage

### Start the frontend server:
   ```bash
   npm start
   ```
The frontend will run on `http://localhost:3000` (or another port if specified).

## Available Scripts

### `npm start`
Runs the app in development mode.

### `npm run build`
Builds the app for production.

### `npm test`
Runs the test suite.

## License
This project is licensed under the MIT License.

