# Campayn Backend - Socket.IO Quotation System

This backend provides real-time quotation chat functionality for the Campayn influencer marketing platform.

## Features

- **Real-time messaging** between brands and admins
- **Room-based chat** using campaign IDs
- **Typing indicators** for better UX
- **User presence** tracking
- **Message history** (last 100 messages per room)
- **CORS enabled** for frontend integration

## Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   ```env
   PORT=4000
   FRONTEND_URL=http://localhost:8080
   SOCKET_CORS_ORIGIN=http://localhost:8080
   NODE_ENV=development
   ```

4. **Start the server:**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

- `GET /health` - Health check
- `GET /rooms` - Get all active rooms (for admin)
- `GET /rooms/:campaignId` - Get specific room info

## Socket.IO Events

### Client → Server Events

- `join_room` - Join a quotation chat room
  ```js
  socket.emit('join_room', {
    campaignId: 'campaign-123',
    userId: 'user-456',
    userType: 'brand' | 'admin',
    userName: 'Brand Name'
  });
  ```

- `send_message` - Send a message
  ```js
  socket.emit('send_message', {
    campaignId: 'campaign-123',
    message: 'Hello, I need a quotation',
    messageType: 'text' // optional
  });
  ```

- `typing` - Typing indicator
  ```js
  socket.emit('typing', {
    campaignId: 'campaign-123',
    isTyping: true
  });
  ```

### Server → Client Events

- `room_joined` - Confirmation of joining room
- `new_message` - New message received
- `user_joined` - User joined the room
- `user_left` - User left the room
- `user_typing` - Typing indicator from other users
- `error` - Error messages

## Integration with Frontend

The frontend should connect to this backend using Socket.IO client:

```js
import io from 'socket.io-client';

const socket = io('http://localhost:4000');

// Join a quotation room
socket.emit('join_room', {
  campaignId: campaignId,
  userId: user.id,
  userType: 'brand', // or 'admin'
  userName: user.name
});
```

## Room Management

- Each campaign has its own room identified by `campaignId`
- Rooms are automatically created when first user joins
- Rooms are cleaned up when empty
- Messages are stored in memory (last 100 per room)

## Security Notes

- CORS is configured for frontend URL
- No authentication middleware (handled by frontend)
- Room access is not restricted (implement if needed)
- Messages are stored in memory (not persistent)

## Development

- Uses `nodemon` for auto-restart in development
- Logs all connections and messages
- Health check endpoint for monitoring
- Graceful shutdown handling
