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
    try {
        const { message, userId, productId } = req.body;
        
        // Validate required fields
        if (!message) {
            return res.status(400).json({ reply: "Message is required" });
        }
        
        if (!userId) {
            return res.status(400).json({ reply: "User ID is required" });
        }
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured');
            return res.status(500).json({ reply: "AI service not configured" });
        }

        const prompt = productId
            ? `You are a Restocker AI inventory assistant. Your job is to help users manage their inventory by detecting if they want to:
1. Add stock for an existing product
2. Add a new product to their inventory
3. Just have a conversation

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no additional text.

IMPORTANT RULES:
- For adding stock: respond with {"intent":"add_stock","data":[{"expiryDate":"YYYY-MM-DD","qty":number}]}
- For adding products: respond with {"intent":"add_product","data":[{"name":"product name","description":"detailed description","measure":"kg|g|l|ml|liter|Liter|pcs|box|bag|bottle|can|pack|piece|other"}]}
- For regular chat: respond with {"intent":"chat","reply":"your response"}
- ONLY respond with valid JSON, no other text
- For products, measure must be one of: kg, g, l, ml, liter, Liter, pcs, box, bag, bottle, can, pack, piece, other
- Use double quotes for all strings
- No trailing commas
- Ensure all JSON is properly formatted

User message: ${message}`
            : `You are a Restocker AI inventory assistant. Your job is to help users manage their inventory by detecting if they want to add new products to their inventory.

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no additional text.

IMPORTANT RULES:
- If user wants to add products: respond with {"intent":"add_product","data":[{"name":"product name","description":"detailed description","measure":"kg|g|l|ml|liter|Liter|pcs|box|bag|bottle|can|pack|piece|other"}]}
- If just chatting: respond with {"intent":"chat","reply":"your response"}
- ONLY respond with valid JSON, no other text
- For products, measure must be one of: kg, g, l, ml, liter, Liter, pcs, box, bag, bottle, can, pack, piece, other
- Use double quotes for all strings
- No trailing commas
- Ensure all JSON is properly formatted

User message: ${message}`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500
                }
            }
        );

        let aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        if (!aiText) {
            return res.json({ reply: "I couldn't generate a response. Please try again." });
        }
        
        aiText = aiText.replace(/```json|```/g, "").trim();

        let aiData;
        try {
            aiData = JSON.parse(aiText);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Failed to parse AI text:', aiText);
            
            // Try multiple JSON extraction strategies
            let jsonText = aiText;
            
            // Remove any markdown code blocks
            jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Try to find JSON object in the text
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    aiData = JSON.parse(jsonMatch[0]);
                } catch (secondParseError) {
                    console.error('Second parse attempt failed:', secondParseError);
                    console.error('Attempted to parse:', jsonMatch[0]);
                    
                    // Try to clean up common issues
                    let cleanedJson = jsonMatch[0]
                        .replace(/,\s*}/g, '}')  // Remove trailing commas
                        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
                        .replace(/'/g, '"');     // Replace single quotes with double quotes
                    
                    try {
                        aiData = JSON.parse(cleanedJson);
                    } catch (thirdParseError) {
                        console.error('Third parse attempt failed:', thirdParseError);
                        return res.json({ 
                            reply: "I had trouble understanding your request. Please try rephrasing it or be more specific about what you want to add.",
                            error: process.env.NODE_ENV === 'development' ? `Parse error: ${thirdParseError.message}` : undefined
                        });
                    }
                }
            } else {
                return res.json({ 
                    reply: "I had trouble understanding your request. Please try rephrasing it or be more specific about what you want to add.",
                    error: process.env.NODE_ENV === 'development' ? `No JSON found in response: ${aiText}` : undefined
                });
            }
        }

        // Validate the AI response structure
        if (!aiData || typeof aiData !== 'object' || !aiData.intent) {
            console.error('Invalid AI response structure:', aiData);
            return res.json({ 
                reply: "I had trouble processing your request. Please try rephrasing it.",
                error: process.env.NODE_ENV === 'development' ? 'Invalid response structure' : undefined
            });
        }

        if (productId) {
            if (aiData.intent === "add_stock") {
                try {
                    const stockEntries = aiData.data;
                    if (!stockEntries || !Array.isArray(stockEntries)) {
                        return res.json({ reply: "Invalid stock data format." });
                    }
                    
                    // Validate stock entries
                    for (let i = 0; i < stockEntries.length; i++) {
                        const entry = stockEntries[i];
                        if (!entry.expiryDate || !entry.qty || isNaN(entry.qty) || entry.qty <= 0) {
                            return res.json({ reply: `Stock entry ${i + 1} is invalid. Please provide valid expiry date and quantity.` });
                        }
                    }
                    
                    let stockDoc = await Stock.findOne({ userId, productId });

                    if (!stockDoc) {
                        stockDoc = await Stock.create({ userId, productId, stockDetail: stockEntries });
                        return res.json({ reply: `✅ ${stockEntries.length} stock entry(ies) added successfully.` });
                    }

                    stockDoc.stockDetail.push(...stockEntries);
                    await stockDoc.save();
                    return res.json({ reply: `✅ ${stockEntries.length} stock entry(ies) added successfully.` });
                } catch (dbError) {
                    console.error('Database error in add_stock:', dbError);
                    return res.json({ reply: "Failed to add stock. Please try again." });
                }
            }

            if (aiData.intent === "add_product") {
                try {
                    const products = aiData.data;
                    
                    if (!products || !Array.isArray(products)) {
                        return res.json({ reply: "Invalid product data format." });
                    }
                    
                    // Validate each product has required fields and correct measure
                    const validMeasures = ['kg', 'g', 'l', 'ml', 'liter', 'Liter', 'pcs', 'box', 'bag', 'bottle', 'can', 'pack', 'piece', 'other'];
                    for (let i = 0; i < products.length; i++) {
                        const product = products[i];
                        if (!product.name || !product.description || !product.measure) {
                            return res.json({ reply: `Product ${i + 1} is missing required fields (name, description, measure).` });
                        }
                        if (!validMeasures.includes(product.measure)) {
                            return res.json({ reply: `Product ${i + 1} has invalid measure. Must be one of: ${validMeasures.join(', ')}` });
                        }
                    }
                    
                    let exist = await Product.findOne({ userId });

                    if (!exist) {
                        const product = await Product.create({ userId, allProducts: products });
                        return res.json({ reply: `✅ ${products.length} product(s) added successfully.` });
                    }

                    exist.allProducts.push(...products);
                    await exist.save();
                    return res.json({ reply: `✅ ${products.length} product(s) added successfully.` });
                } catch (dbError) {
                    console.error('Database error in add_product:', dbError);
                    return res.json({ reply: "Failed to add product. Please try again." });
                }
            }

            if (aiData.intent === "chat") {
                return res.json({ reply: aiData.reply });
            }

            return res.json({ reply: "I didn't understand your request." });
        }

        if (aiData.intent === "add_product") {
            try {
                const products = aiData.data;
                
                if (!products || !Array.isArray(products)) {
                    return res.json({ reply: "Invalid product data format." });
                }
                
                // Validate each product has required fields and correct measure
                const validMeasures = ['kg', 'g', 'l', 'ml', 'liter', 'Liter', 'pcs', 'box', 'bag', 'bottle', 'can', 'pack', 'piece', 'other'];
                for (let i = 0; i < products.length; i++) {
                    const product = products[i];
                    if (!product.name || !product.description || !product.measure) {
                        return res.json({ reply: `Product ${i + 1} is missing required fields (name, description, measure).` });
                    }
                    if (!validMeasures.includes(product.measure)) {
                        return res.json({ reply: `Product ${i + 1} has invalid measure. Must be one of: ${validMeasures.join(', ')}` });
                    }
                }
                
                let exist = await Product.findOne({ userId });

                if (!exist) {
                    const product = await Product.create({ userId, allProducts: products });
                    return res.json({ reply: `✅ ${products.length} product(s) added successfully.` });
                }

                exist.allProducts.push(...products);
                await exist.save();
                return res.json({ reply: `✅ ${products.length} product(s) added successfully.` });
            } catch (dbError) {
                console.error('Database error in add_product:', dbError);
                return res.json({ reply: "Failed to add product. Please try again." });
            }
        }

        if (aiData.intent === "add_stock") {
            return res.json({ reply: "Please open the product page to add stock." });
        }

        if (aiData.intent === "chat") {
            return res.json({ reply: aiData.reply });
        }

        res.json({ reply: "I didn't understand your request." });

    } catch (error) {
        console.error("Chat AI Error:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        
        // Return a user-friendly error message
        res.status(500).json({ 
            reply: "Sorry, I encountered an error. Please try again later.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

        // Validate measure is valid
        const validMeasures = ['kg', 'g', 'l', 'ml', 'liter', 'Liter', 'pcs', 'box', 'bag', 'bottle', 'can', 'pack', 'piece', 'other'];
        if (!validMeasures.includes(measure)) {
            return res.status(400).json({ error: `Invalid measure. Must be one of: ${validMeasures.join(', ')}` });
        }

        const exist = await Product.findOne({ userId: id });
        if (!exist) {
            await Product.create({ userId: id, allProducts: [{ name, description, measure }] });
            return res.status(201).json({ message: "Product added successfully" });
        }
        
        exist.allProducts.push({ name, description, measure });
        await exist.save();
        res.status(200).json({ message: "Product added successfully" });
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

        // Validate expiry date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(expiryDate)) {
            return res.status(400).json({ error: 'Expiry date must be in YYYY-MM-DD format' });
        }

        const stock = await Stock.findOne({ userId: id, productId });
        if (!stock) {
            await Stock.create({ userId: id, productId, stockDetail: [{ expiryDate, qty: Number(qty) }] });
            return res.status(201).json({ message: "Stock added successfully" });
        }
        
        stock.stockDetail.push({ expiryDate, qty: Number(qty) });
        await stock.save();
        res.status(200).json({ message: "Stock added successfully" });
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
        res.status(200).json({ message: "Stock used successfully" });
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
            return res.status(200).json({ message: "No stock found", stockWithProducts: [] });
        }

        const product = await Product.findOne({ userId: id });
        if (!product) {
            return res.status(200).json({ message: "No product found", stockWithProducts: [] });
        }

        const stockWithProducts = instocks.map(stock => ({
            productId: stock.productId,
            stockDetail: stock.stockDetail
        }));

        res.status(200).json({ message: "Stock found", stockWithProducts, products: product.allProducts });
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
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
        process.exit(1);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check available at: /health`);
});
