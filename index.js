import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import axios from 'axios';

dotenv.config();

import Product from './model/Product.js';
import User from './model/User.js';
import Stock from './model/Stock.js';

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

const app = express();

app.use(cors({
    origin: [
      "http://localhost:5173",
      "https://restocker-frontend.vercel.app",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.use(cookieParser());

// Mount auth routes
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Restocker Backend API', 
        version: '1.0.0',
        endpoints: {
            health: '/health',
            auth: '/auth',
            chat: '/chat/ai'
        }
    });
});

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// AI Chat endpoint
app.post("/chat/ai", async (req, res) => {
    const { message, userId, productId } = req.body;
    if (!message) return res.status(400).json({ reply: "Message is required" });
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ reply: "AI service not configured" });

    const prompt = productId
        ? `You are a Restocker AI and here to help.
Do not answer anything else. Do not have simple chat.
You are an assistant that detects if the user wants to add stock for a product or add a new product.
If adding stock, respond ONLY with:
{"intent":"add_stock","data":[{"expiryDate":"YYYY-MM-DD","qty":number}, {...}]}
If adding product, respond ONLY with:
{"intent":"add_product","data":[{"name":"...","description":"...","measure":"..."}, {...}]}
If not adding anything, respond ONLY with:
{"intent":"chat","reply":"<your reply here>"}
Do not add any text before or after the JSON.
User: ${message}`
        : `You are a Restocker AI and here to help.
Do not answer anything else. Do not have simple chat.
You are an assistant that detects if the user wants to add one or more products to their inventory.
If yes, respond ONLY with:
{"intent":"add_product","data":[{"name":"...","description":"...","measure":"..."}, {...}]}
If not, respond ONLY with:
{"intent":"chat","reply":"<your reply here>"}
Do not add any text before or after the JSON.
User: ${message}`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 300
                }
            }
        );

        let aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        aiText = aiText.replace(/```json|```/g, "").trim();

        const aiData = JSON.parse(aiText);

        if (productId) {
            if (aiData.intent === "add_stock") {
                const stockEntries = aiData.data;
                let stockDoc = await Stock.findOne({ userId, productId });

                if (!stockDoc) {
                    stockDoc = await Stock.create({ userId, productId, stockDetail: stockEntries });
                    return res.json({ reply: `✅ ${stockEntries.length} stock entry(ies) added successfully.`, stockDoc });
                }

                stockDoc.stockDetail.push(...stockEntries);
                await stockDoc.save();
                return res.json({ reply: `✅ ${stockEntries.length} stock entry(ies) added successfully.`, stockDoc });
            }

            if (aiData.intent === "add_product") {
                const products = aiData.data;
                let exist = await Product.findOne({ userId });

                if (!exist) {
                    const product = await Product.create({ userId, allProducts: products });
                    return res.json({ reply: `✅ ${products.length} product(s) added successfully.`, product });
                }

                exist.allProducts.push(...products);
                await exist.save();
                return res.json({ reply: `✅ ${products.length} product(s) added successfully.`, exist });
            }

            if (aiData.intent === "chat") {
                return res.json({ reply: aiData.reply });
            }

            return res.json({ reply: "I didn't understand your request." });
        }

        if (aiData.intent === "add_product") {
            const products = aiData.data;
            let exist = await Product.findOne({ userId });

            if (!exist) {
                const product = await Product.create({ userId, allProducts: products });
                return res.json({ reply: `✅ ${products.length} product(s) added successfully.`, product });
            }

            exist.allProducts.push(...products);
            await exist.save();
            return res.json({ reply: `✅ ${products.length} product(s) added successfully.`, exist });
        }

        if (aiData.intent === "add_stock") {
            return res.json({ reply: "Please open the product page to add stock." });
        }

        if (aiData.intent === "chat") {
            return res.json({ reply: aiData.reply });
        }

        res.json({ reply: "I didn't understand your request." });

    } catch (error) {
        console.error("AI API Error:", error.response?.data || error.message);
        res.status(500).json({ reply: "AI request failed." });
    }
});

// Product routes
app.post("/:id/product/add", async (req, res) => {
    const { id } = req.params;
    const { name, description, measure } = req.body;
    
    try {
        // Validate required fields
        if (!name || !description || !measure) {
            return res.status(400).json({ error: 'Name, description, and measure are required' });
        }

        const exist = await Product.findOne({ userId: id });
        if (!exist) {
            const product = await Product.create({ userId: id, allProducts: [{ name, description, measure }] });
            return res.status(201).json({ message: "Product added successfully", product });
        }
        
        exist.allProducts.push({ name, description, measure });
        await exist.save();
        res.status(200).json({ message: "Product added successfully", exist });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Stock routes
app.get("/:id/product/:productId/stock", async (req, res) => {
    const { id, productId } = req.params;
    
    try {
        const stock = await Stock.findOne({ userId: id, productId });
        if (!stock) {
            return res.status(200).json([]); // Return empty array instead of 404
        }
        res.status(200).json(stock.stockDetail || []);
    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

app.post("/:id/product/:productId/stock/add", async (req, res) => {
    const { id, productId } = req.params;
    const { expiryDate, qty } = req.body;
    
    try {
        // Validate required fields
        if (!expiryDate || !qty) {
            return res.status(400).json({ error: 'Expiry date and quantity are required' });
        }

        // Validate qty is a number
        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Quantity must be a positive number' });
        }

        const stock = await Stock.findOne({ userId: id, productId });
        if (!stock) {
            const newStock = await Stock.create({ userId: id, productId, stockDetail: [{ expiryDate, qty: Number(qty) }] });
            await newStock.save();
            return res.status(201).json({ message: "Stock added successfully", newStock });
        }
        
        stock.stockDetail.push({ expiryDate, qty: Number(qty) });
        await stock.save();
        res.status(200).json({ message: "Stock added successfully", stock });
    } catch (error) {
        console.error('Error adding stock:', error);
        res.status(500).json({ error: 'Failed to add stock' });
    }
});

app.post("/:id/product/:productId/stock/use", async (req, res) => {
    const { id, productId } = req.params;
    const { usedQty, stockId } = req.body;
    
    try {
        // Validate required fields
        if (!usedQty || !stockId) {
            return res.status(400).json({ error: 'Used quantity and stock ID are required' });
        }

        // Validate usedQty is a number
        if (isNaN(usedQty) || usedQty <= 0) {
            return res.status(400).json({ error: 'Used quantity must be a positive number' });
        }

        const stock = await Stock.findOne({ userId: id, productId, stockDetail: { $elemMatch: { _id: stockId } } });
        if (!stock) {
            return res.status(404).json({ message: "Stock not found" });
        }

        const stockItem = stock.stockDetail.find(item => item._id.toString() === stockId);
        if (!stockItem) {
            return res.status(404).json({ message: "Stock item not found" });
        }

        if (usedQty > stockItem.qty) {
            return res.status(400).json({ message: "Used quantity exceeds available stock" });
        }

        stockItem.qty -= Number(usedQty);
        
        // Initialize entry array if it doesn't exist
        if (!stockItem.entry) {
            stockItem.entry = [];
        }
        
        stockItem.entry.push({ usedQty: Number(usedQty), time: new Date() });
        await stock.save();
        res.status(200).json({ message: "Stock used successfully", stock });
    } catch (error) {
        console.error('Error using stock:', error);
        res.status(500).json({ error: 'Failed to use stock' });
    }
});

app.get("/:id/instock", async (req, res) => {
    const { id } = req.params;
    try {
        const instocks = await Stock.find({ userId: id });
        if (!instocks || instocks.length === 0) {
            return res.status(200).json({ message: "No stock found", stockWithProducts: [], product: null });
        }

        const product = await Product.findOne({ userId: id });
        if (!product) {
            return res.status(200).json({ message: "No product found", stockWithProducts: [], product: null });
        }

        const stockWithProducts = instocks.map(stock => ({
            productId: stock.productId,
            stockDetail: stock.stockDetail
        }));

        res.status(200).json({ message: "Stock is found", stockWithProducts, product });
    } catch (error) {
        console.error('Error fetching instock:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

app.get("/:id/product", async (req, res) => {
    const { id } = req.params;
    try {
        const product = await Product.findOne({ userId: id });
        if (!product) {
            return res.status(200).json([]); // Return empty array if no products found
        }
        res.status(200).json(product.allProducts || []);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Handle 404 routes
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check available at: /health`);
});
