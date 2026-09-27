# CRM System - Railway Deployment

## 🚀 Quick Start

This is a production-ready CRM system optimized for Railway deployment.

### Prerequisites
- Node.js 18+
- Supabase account
- Railway account

### Environment Variables Required

Create a `.env` file in the root directory with:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Secret
JWT_SECRET=your_jwt_secret_key

# Email Configuration (Optional)
EMAIL_USER=your_email@domain.com
EMAIL_PASS=your_email_password

# SMS Configuration (The SMS Works)
SMS_WORKS_API_KEY=YOUR_API_KEY_HERE
SMS_WORKS_API_SECRET=YOUR_API_SECRET_HERE
SMS_WORKS_SENDER_ID=Auralndn
```

### Railway Deployment

1. Connect your GitHub repository to Railway
2. Set the environment variables in Railway dashboard
3. Railway will automatically detect the `railway.json` configuration
4. The app will build and deploy automatically

### Features

- **User Management**: Admin, Booker, Viewer roles
- **Lead Management**: Complete lead lifecycle tracking
- **Calendar System**: Appointment scheduling and management
- **Sales Tracking**: Sales creation and reporting
- **Messaging**: SMS and Email communication
- **Real-time Updates**: WebSocket-based live updates
- **Role-based Access**: Secure access control

### Tech Stack

- **Frontend**: React, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Socket.IO
- **Deployment**: Railway

### File Structure

```
├── client/          # React frontend
├── server/          # Node.js backend
├── package.json     # Root package configuration
├── railway.json     # Railway deployment config
└── .env            # Environment variables
```

### Support

For deployment issues, check Railway logs and ensure all environment variables are set correctly.
