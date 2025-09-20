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
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/restocker';

const app = express();

app.use(cors({
    origin: [
      "http://localhost:5173",
      "https://restocker-frontend.vercel.app",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true
  }));
  
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('DB error:', err));


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

        // === Case 1: When productId is present (Add stock or add product) ===
        if (productId) {
            if (aiData.intent === "add_stock") {
                const stockEntries = aiData.data;
                let stockDoc = await Stock.findOne({ userId, productId });

                if (!stockDoc) {
                    stockDoc = await Stock.create({
                        userId,
                        productId,
                        stockDetail: stockEntries
                    });
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
                    const product = await Product.create({
                        userId,
                        allProducts: products
                    });
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

        // === Case 2: When productId is NOT present (Add product flow only) ===
        if (aiData.intent === "add_product") {
            const products = aiData.data;
            let exist = await Product.findOne({ userId });

            if (!exist) {
                const product = await Product.create({
                    userId,
                    allProducts: products
                });
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






app.post("/:_id/product/add", async (req, res) => {
    const { _id } = req.params
    const { name, description, measure } = req.body
    const exist = await Product.findOne({ userId: _id })
    if (!exist) {
        const product = await Product.create({ userId: _id, allProducts: [{ name, description, measure }] })
        res.status(201).json({ message: "Product added successfully", product })
    }
    exist.allProducts.push({ name, description, measure })
    await exist.save()
    res.status(200).json({ message: "Product added successfully", exist })
})



app.get("/:_id/product/:productId/stock", async (req, res) => {
    const { _id, productId } = req.params
    const stock = await Stock.findOne({ userId: _id, productId })
    if (!stock) {
        res.status(404).json({ message: "Stock not found" })
    }
    res.status(200).json(stock.stockDetail)

})
app.post("/:_id/product/:productId/stock/add", async (req, res) => {
    const { _id, productId } = req.params
    const { expiryDate, qty } = req.body
    const stock = await Stock.findOne({ userId: _id, productId })
    if (!stock) {
        const newStock = await Stock.create({ userId: _id, productId, stockDetail: [{ expiryDate, qty }] })
        await newStock.save()
        res.status(201).json({ message: "Stock added Succesfully", newStock })
    }
    stock.stockDetail.push({ expiryDate, qty })
    await stock.save()
    res.status(200).json({ message: "Stock added Succesfully", stock })

})
app.post("/:_id/product/:productId/stock/use", async (req, res) => {
    const { _id, productId } = req.params;
    const { usedQty, stockId } = req.body;
    const stock = await Stock.findOne({
        userId: _id,
        productId,
        stockDetail: { $elemMatch: { _id: stockId } }
    });
    if (!stock) {
        return res.status(404).json({ message: "Stock not found" });
    }
    const stockItem = stock.stockDetail.find(
        item => item._id.toString() === stockId
    );
    if (!stockItem) {
        return res.status(404).json({ message: "Stock item not found" });
    }
    if (usedQty > stockItem.qty) {
        return res.status(400).json({ message: "Used quantity exceeds available stock" });
    }
    stockItem.qty -= usedQty;
    stockItem.entry.push({ usedQty, time: new Date() });
    await stock.save();
    res.status(200).json({ message: "Stock used successfully", stock });
});

app.get("/:_id/instock", async (req, res) => {
    const { _id } = req.params
    const instocks = await Stock.find({ userId: _id })
    if (!instocks || instocks.length === 0) {
        res.status(404).json({ message: "No stock found" })
        return
    }
    const product = await Product.findOne({ userId: _id })
    if (!product) {
        res.status(404).json({ message: "No product found" })
        return
    }

    // Combine all stock details with their product IDs
    const stockWithProducts = instocks.map(stock => ({
        productId: stock.productId,
        stockDetail: stock.stockDetail
    }))

    res.status(200).json({ message: "Stock is found", stockWithProducts, product })
})


app.get("/:_id/product", async (req, res) => {
    const { _id } = req.params
    const product = await Product.findOne({ userId: _id })
    res.status(200).json(product.allProducts)
})
app.listen(PORT, () => console.log('Server running on port 5000'));
