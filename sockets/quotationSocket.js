// Socket.IO event handlers for quotation system
// This file contains the business logic for real-time quotation chat

class QuotationSocketHandler {
  constructor(io) {
    this.io = io;
    this.activeRooms = new Map();
    this.userSockets = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Join quotation room
      socket.on('join_room', (data) => this.handleJoinRoom(socket, data));
      
      // Send message
      socket.on('send_message', (data) => this.handleSendMessage(socket, data));
      
      // Typing indicator
      socket.on('typing', (data) => this.handleTyping(socket, data));
      
      // Disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
      
      // Error handling
      socket.on('error', (error) => this.handleError(socket, error));
    });
  }

  handleJoinRoom(socket, data) {
    const { campaignId, userId, userType, userName } = data;
    
    if (!campaignId) {
      socket.emit('error', { message: 'Campaign ID is required' });
      return;
    }

    // Validate user data
    if (!userId || !userType || !userName) {
      socket.emit('error', { message: 'User information is required' });
      return;
    }

    // Leave previous room if any
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    // Join new room
    socket.join(campaignId);
    socket.currentRoom = campaignId;
    socket.userId = userId;
    socket.userType = userType;
    socket.userName = userName;

    // Store user info
    this.userSockets.set(socket.id, {
      userId,
      userType,
      userName,
      campaignId,
      socketId: socket.id,
      joinedAt: new Date()
    });

    // Initialize room
    this.initializeRoom(campaignId);

    // Add user to room
    const room = this.activeRooms.get(campaignId);
    room.users.set(userId, {
      userId,
      userType,
      userName,
      socketId: socket.id,
      joinedAt: new Date()
    });

    // Notify others
    socket.to(campaignId).emit('user_joined', {
      userId,
      userType,
      userName,
      message: `${userName} joined the quotation chat`,
      timestamp: new Date().toISOString()
    });

    // Send room info to user
    socket.emit('room_joined', {
      campaignId,
      roomUsers: Array.from(room.users.values()),
      recentMessages: room.messages.slice(-50),
      userInfo: {
        userId,
        userType,
        userName
      }
    });

    console.log(`User ${userName} (${userType}) joined room ${campaignId}`);
  }

  handleSendMessage(socket, data) {
    const { campaignId, message, messageType = 'text' } = data;
    
    if (!campaignId || !message?.trim()) {
      socket.emit('error', { message: 'Campaign ID and message are required' });
      return;
    }

    const userInfo = this.userSockets.get(socket.id);
    if (!userInfo) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const messageData = {
      id: Date.now().toString(),
      campaignId,
      userId: userInfo.userId,
      userType: userInfo.userType,
      userName: userInfo.userName,
      message: message.trim(),
      messageType,
      timestamp: new Date().toISOString(),
      socketId: socket.id
    };

    // Store message
    const room = this.activeRooms.get(campaignId);
    if (room) {
      room.messages.push(messageData);
      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
    }

    // Broadcast to room
    this.io.to(campaignId).emit('new_message', messageData);

    console.log(`Message sent in room ${campaignId} by ${userInfo.userName}: ${message}`);
  }

  handleTyping(socket, data) {
    const { campaignId, isTyping } = data;
    const userInfo = this.userSockets.get(socket.id);
    
    if (userInfo && campaignId) {
      socket.to(campaignId).emit('user_typing', {
        userId: userInfo.userId,
        userName: userInfo.userName,
        userType: userInfo.userType,
        isTyping: Boolean(isTyping),
        timestamp: new Date().toISOString()
      });
    }
  }

  handleDisconnect(socket) {
    const userInfo = this.userSockets.get(socket.id);
    
    if (userInfo) {
      const { campaignId, userId, userName, userType } = userInfo;
      
      // Remove from room
      if (campaignId && this.activeRooms.has(campaignId)) {
        const room = this.activeRooms.get(campaignId);
        room.users.delete(userId);
        
        // Notify others
        socket.to(campaignId).emit('user_left', {
          userId,
          userType,
          userName,
          message: `${userName} left the quotation chat`,
          timestamp: new Date().toISOString()
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
          this.activeRooms.delete(campaignId);
        }
      }

      // Remove from user sockets
      this.userSockets.delete(socket.id);
      
      console.log(`User ${userName} disconnected from room ${campaignId}`);
    }
  }

  handleError(socket, error) {
    console.error('Socket error:', error);
    socket.emit('error', { message: 'An error occurred' });
  }

  initializeRoom(campaignId) {
    if (!this.activeRooms.has(campaignId)) {
      this.activeRooms.set(campaignId, {
        users: new Map(),
        messages: [],
        createdAt: new Date()
      });
    }
  }

  // Utility methods
  getRoomInfo(campaignId) {
    const room = this.activeRooms.get(campaignId);
    if (!room) return null;

    return {
      campaignId,
      userCount: room.users.size,
      users: Array.from(room.users.values()),
      messageCount: room.messages.length,
      lastActivity: room.messages.length > 0 ? room.messages[room.messages.length - 1].timestamp : null,
      createdAt: room.createdAt
    };
  }

  getAllRooms() {
    return Array.from(this.activeRooms.entries()).map(([campaignId, room]) => 
      this.getRoomInfo(campaignId)
    );
  }

  getActiveUsersCount() {
    return this.userSockets.size;
  }
}

module.exports = QuotationSocketHandler;
