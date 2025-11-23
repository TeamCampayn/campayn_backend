const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const app = express();
const server = http.createServer(app);

// CORS configuration for frontend connection
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  "https://zestful-campaign-craft-69.netlify.app",
  "https://campayn.in",
  "https://www.campayn.in"
].filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.includes('netlify.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Add Socket.IO to request for campaigns routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Store active rooms and users
const activeRooms = new Map();
const userSockets = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join brand-specific room for campaign notifications
  socket.on('join_brand_room', (brandId) => {
    socket.join(`brand_${brandId}`);
    console.log(`Brand ${brandId} joined their notification room`);
  });

  // Join a quotation room
  socket.on('join_room', async (data) => {
    const { campaignId, userId, userType, userName, userEmail, isAdmin } = data;
    
    if (!campaignId) {
      socket.emit('error', { message: 'Campaign ID is required' });
      return;
    }

    // Leave any previous rooms
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    // Join the new room
    socket.join(campaignId);
    socket.currentRoom = campaignId;
    socket.userId = userId;
    socket.userType = userType;
    socket.userName = userName;

    // Store user info
    userSockets.set(socket.id, {
      userId,
      userType,
      userName,
      userEmail,
      isAdmin,
      campaignId,
      socketId: socket.id
    });

    // Initialize room if it doesn't exist
    if (!activeRooms.has(campaignId)) {
      activeRooms.set(campaignId, {
        users: new Map(),
        messages: []
      });
    }

    const room = activeRooms.get(campaignId);
    room.users.set(userId, {
      userId,
      userType,
      userName,
      userEmail,
      isAdmin,
      socketId: socket.id,
      joinedAt: new Date()
    });

    // Notify others in the room
    socket.to(campaignId).emit('user_joined', {
      userId,
      userType,
      userName,
      message: `${userName} joined the quotation chat`
    });

    // Load recent messages from database
    try {
      const { data: recentMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (messagesError) {
        console.error('Error loading messages:', messagesError);
      }

      // Format messages for frontend
      const formattedMessages = (recentMessages || []).map(msg => ({
        id: msg.id,
        campaignId: msg.campaign_id,
        userId: msg.user_id,
        userType: msg.user_type,
        userName: msg.user_name,
        userEmail: msg.user_email,
        isAdmin: msg.is_admin,
        message: msg.message,
        messageType: msg.message_type,
        timestamp: msg.created_at
      }));

      // Update room messages
      room.messages = formattedMessages;

      // Send room info to the user
      socket.emit('room_joined', {
        campaignId,
        roomUsers: Array.from(room.users.values()),
        recentMessages: formattedMessages
      });

    } catch (error) {
      console.error('Error loading recent messages:', error);
      // Send room info without messages if there's an error
      socket.emit('room_joined', {
        campaignId,
        roomUsers: Array.from(room.users.values()),
        recentMessages: room.messages.slice(-50)
      });
    }

    console.log(`User ${userName} (${userType}) joined room ${campaignId}`);
  });

  // Send message in room
  socket.on('send_message', async (data) => {
    const { campaignId, message, messageType = 'text', userId, userType, userName, userEmail, isAdmin } = data;
    
    if (!campaignId || !message || !userId) {
      socket.emit('error', { message: 'Campaign ID, message, and user ID are required' });
      return;
    }

    console.log('Sending message:', {
      campaignId,
      userId,
      userType,
      userName,
      userEmail,
      isAdmin,
      message: message.trim()
    });

    try {
      // Save message to Supabase
      const { data: savedMessage, error: dbError } = await supabase
        .from('messages')
        .insert({
          campaign_id: campaignId,
          user_id: userId,
          user_type: userType,
          user_name: userName,
          user_email: userEmail,
          message: message.trim(),
          message_type: messageType,
          is_admin: isAdmin
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error saving message:', dbError);
        socket.emit('error', { message: 'Failed to save message' });
        return;
      }

      const messageData = {
        id: savedMessage.id,
        campaignId,
        userId,
        userType,
        userName,
        userEmail,
        isAdmin,
        message: message.trim(),
        messageType,
        timestamp: savedMessage.created_at,
        socketId: socket.id
      };

      // Store message in room for quick access
      const room = activeRooms.get(campaignId);
      if (room) {
        room.messages.push(messageData);
        // Keep only last 50 messages in memory
        if (room.messages.length > 50) {
          room.messages = room.messages.slice(-50);
        }
      }

      // Broadcast to all users in the room
      io.to(campaignId).emit('new_message', messageData);

      console.log(`Message saved and sent in room ${campaignId} by ${userName} (${userEmail}): ${message}`);

    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    const { campaignId, isTyping } = data;
    const userInfo = userSockets.get(socket.id);
    
    if (userInfo && campaignId) {
      socket.to(campaignId).emit('user_typing', {
        userId: userInfo.userId,
        userName: userInfo.userName,
        userType: userInfo.userType,
        isTyping
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userInfo = userSockets.get(socket.id);
    
    if (userInfo) {
      const { campaignId, userId, userName, userType } = userInfo;
      
      // Remove from room
      if (campaignId && activeRooms.has(campaignId)) {
        const room = activeRooms.get(campaignId);
        room.users.delete(userId);
        
        // Notify others in the room
        socket.to(campaignId).emit('user_left', {
          userId,
          userType,
          userName,
          message: `${userName} left the quotation chat`
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
          activeRooms.delete(campaignId);
        }
      }

      // Remove from user sockets
      userSockets.delete(socket.id);
      
      console.log(`User ${userName} disconnected from room ${campaignId}`);
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Instagram Insights Routes
const insightsRouter = require('./routes/insights');
app.use('/api', insightsRouter);

// Creators Routes
const creatorsRouter = require('./routes/creators');
app.use('/api', creatorsRouter);

// Campaigns Routes
const campaignsRouter = require('./routes/campaigns');
app.use(campaignsRouter);

// Razorpay Payment Link Routes
const razorpayLinkRouter = require('./routes/razorpay-link');
app.use(razorpayLinkRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeRooms: activeRooms.size,
    connectedUsers: userSockets.size
  });
});

// Get room status endpoint
app.get('/rooms/:campaignId', (req, res) => {
  const { campaignId } = req.params;
  const room = activeRooms.get(campaignId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    campaignId,
    users: Array.from(room.users.values()),
    messageCount: room.messages.length,
    lastActivity: room.messages.length > 0 ? room.messages[room.messages.length - 1].timestamp : null
  });
});

// Get all active rooms (for admin dashboard)
app.get('/rooms', (req, res) => {
  const rooms = Array.from(activeRooms.entries()).map(([campaignId, room]) => ({
    campaignId,
    userCount: room.users.size,
    users: Array.from(room.users.values()),
    messageCount: room.messages.length,
    lastActivity: room.messages.length > 0 ? room.messages[room.messages.length - 1].timestamp : null
  }));

  res.json(rooms);
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Campayn Backend Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:8080"}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
