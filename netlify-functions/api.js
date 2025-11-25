const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const app = express();

// CORS configuration for frontend connection
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://zestful-campaign-craft-69.netlify.app',
  'https://campayn.in',
  'https://www.campayn.in'
].filter(Boolean);

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

// Import routes
const insightsRouter = require('../routes/insights');
const creatorsRouter = require('../routes/creators');
const campaignsRouter = require('../routes/campaigns');
const razorpayLinkRouter = require('../routes/razorpay-link');
// Add Razorpay payments gateway routes (orders, verification, status, refunds, webhooks)
const paymentsRouter = require('../routes/payments');

// Register routes
app.use('/api', insightsRouter);
app.use('/api', creatorsRouter);
app.use(campaignsRouter);
app.use(razorpayLinkRouter);
app.use(paymentsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Campayn Backend API',
    status: 'running',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    path: req.path
  });
});

// Export the serverless handler
exports.handler = serverless(app);
