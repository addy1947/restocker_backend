# Restocker Backend

Backend API for Restocker inventory management application built with Node.js, Express, and MongoDB.

## Features

- User authentication with JWT
- Product management
- Stock tracking and management
- AI-powered chat for inventory management
- RESTful API endpoints

## Tech Stack

- **Runtime:** Node.js (>=18.0.0)
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **Password Hashing:** bcrypt
- **AI Integration:** Google Gemini API

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=3d
PORT=5000
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
```

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables in `.env` file
4. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment on Render

### Prerequisites
- MongoDB Atlas account (or other MongoDB hosting service)
- Google Cloud account for Gemini API
- Render account

### Step 1: Environment Setup
1. Create a MongoDB Atlas cluster and get the connection string
2. Get Google Gemini API key from Google Cloud Console
3. Update your environment variables

### Step 2: Render Deployment
1. Connect your GitHub repository to Render
2. Create a new Web Service on Render
3. Configure the following settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node Version:** 18.x or higher

### Step 3: Environment Variables in Render
Set the following environment variables in Render dashboard:

- `NODE_ENV`: `production`
- `JWT_SECRET`: (generate a secure random string)
- `JWT_EXPIRES_IN`: `3d`
- `MONGODB_URI`: (your MongoDB Atlas connection string)
- `GEMINI_API_KEY`: (your Google Gemini API key)
- `FRONTEND_URL`: (your frontend domain URL)

### Step 4: Health Check
Render will automatically use the `/health` endpoint for health checks.

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/auth/me` - Get user profile

### Products
- `GET /:userId/product` - Get all products for user
- `POST /:userId/product/add` - Add new product

### Stock Management
- `GET /:userId/product/:productId/stock` - Get stock for specific product
- `POST /:userId/product/:productId/stock/add` - Add stock entry
- `POST /:userId/product/:productId/stock/use` - Use stock (subtract quantity)
- `GET /:userId/instock` - Get all in-stock items for user

### AI Chat
- `POST /chat/ai` - AI-powered inventory management chat

### Utility
- `GET /health` - Health check endpoint
- `GET /` - API information

## Security Features

- Password hashing with bcrypt
- JWT authentication
- CORS protection
- Environment variable protection
- Input validation

## License

This project is licensed under the MIT License.
