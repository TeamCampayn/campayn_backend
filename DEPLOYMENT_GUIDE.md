# Backend Deployment Guide for Netlify

## Prerequisites
- Netlify account
- Backend repository pushed to GitHub
- Supabase credentials
- Instagram Graph API credentials

## Deployment Steps

### 1. Create New Site on Netlify

1. Log in to Netlify Dashboard
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository containing the backend code
4. Configure build settings:
   - **Base directory**: `backend` (or leave blank if backend is root)
   - **Build command**: `npm install`
   - **Publish directory**: `.`
   - **Functions directory**: `netlify-functions`

### 2. Set Environment Variables

Go to Site settings → Environment variables and add the following:

```
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://campayn.in
SUPABASE_URL=https://rxsgvhstplsjahhvlhss.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2d2aHN0cGxzamFoaHZsaHNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE4NjU0NCwiZXhwIjoyMDc0NzYyNTQ0fQ.-kURk8g-C84YbYFkjBTrvFX4k6uDkBRaPqo-ywGsC_E
IG_ACCESS_TOKEN=EAAQnUWg83MQBO8bZBlQi1YQdLgWdkox3jibsKqcDZBLAd9EJKrJfS7UE2cAMZAkoo4eMurfEPnwELsLjMIoDwYvJZCBVFxOZBSjAYtnQtkH7v7woB7CPqFbHf4kEauhJXrEQ9QK3TkuzcemAuNZAvZCCI0mD9l4mbKSt2iDcevaSyf8kleCevFCorOEeAlEQE7r
IG_BUSINESS_ID=17841474804307450
```

### 3. Deploy

Click "Deploy site" and wait for the build to complete.

### 4. Configure Custom Domain (Optional)

1. Go to Site settings → Domain management
2. Add custom domain: `campayn-backend.netlify.app` (or your preferred subdomain)
3. Update DNS records if using custom domain

## API Endpoints

After deployment, your API will be available at:

```
https://campayn-backend.netlify.app/.netlify/functions/api/
```

### Available Endpoints:

- **Health Check**: `GET /.netlify/functions/api/health`
- **Creators**: `GET /.netlify/functions/api/creators`
- **Campaigns**: `GET /.netlify/functions/api/campaigns`
- **Insights**: `GET /.netlify/functions/api/insights`
- **Razorpay Payments**: 
  - `GET /.netlify/functions/api/campaigns/:id/payment-info`
  - `POST /.netlify/functions/api/campaigns/:id/submit-razorpay-payment`
  - `GET /.netlify/functions/api/admin/razorpay-payments/pending`
  - `POST /.netlify/functions/api/admin/campaigns/:id/verify-razorpay-payment`
  - `POST /.netlify/functions/api/admin/campaigns/:id/reject-razorpay-payment`

## Frontend Configuration

Update your frontend environment variables to point to the deployed backend:

### In Frontend Netlify Dashboard:

```
VITE_BACKEND_URL=https://campayn-backend.netlify.app/.netlify/functions/api
VITE_SOCKET_URL=https://campayn-backend.netlify.app
VITE_SUPABASE_URL=https://rxsgvhstplsjahhvlhss.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Testing Deployment

1. Test health endpoint:
   ```bash
   curl https://campayn-backend.netlify.app/.netlify/functions/api/health
   ```

2. Expected response:
   ```json
   {
     "status": "OK",
     "timestamp": "2025-11-23T...",
     "environment": "production"
   }
   ```

## Troubleshooting

### Function Timeouts
- Netlify Functions have a 10-second timeout on free tier
- Upgrade to Pro for 26-second timeout
- Optimize long-running operations

### CORS Issues
- Ensure FRONTEND_URL is correctly set in environment variables
- Check that frontend URL is in the allowedOrigins array

### Database Connection
- Verify SUPABASE_URL and SUPABASE_SERVICE_KEY are correctly set
- Check Supabase dashboard for connection limits

### Instagram API
- Ensure IG_ACCESS_TOKEN is valid and not expired
- Check Instagram API rate limits

## Logs

View function logs in Netlify Dashboard:
1. Go to Functions tab
2. Click on `api` function
3. View real-time logs

## Continuous Deployment

- Netlify automatically redeploys on git push to main branch
- Configure deploy hooks in Site settings for manual triggers
- Use deploy previews for pull requests

## Notes

- **Socket.IO**: Note that Socket.IO requires a persistent connection, which doesn't work well with serverless functions. For real-time features, consider:
  1. Using Supabase Realtime instead
  2. Deploying Socket.IO server separately (Heroku, Railway, etc.)
  3. Using Netlify's WebSocket support (in beta)

- **Cold Starts**: First request after inactivity may be slow (~2-5 seconds)

## Support

For issues, check:
- Netlify Function logs
- Supabase logs
- Browser console for CORS errors
