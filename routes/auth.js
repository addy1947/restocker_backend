import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../model/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '3d';

const createToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// SIGNUP + AUTO-LOGIN (set cookie)
router.post('/signup', async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
        // Validate required fields
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Check if user already exists
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'User already exists' });

        // Hash password and create user
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashed });
        await user.save();

        // Create token and set cookie
        const token = createToken(user._id);

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,        // HTTPS only
            sameSite: 'None',    // cross-site
            maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days
        });

        res.status(201).json({ message: 'User created & logged in', token: token, userId: user._id });
    } catch (err) {
        res.status(500).json({ error: 'Signup failed: ' + err.message });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

        const token = createToken(user._id);

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            maxAge: 3 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({ message: 'Logged in', token: token, userId: user._id });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' + err });
    }
});

// VERIFY TOKEN
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        res.status(200).json({ user });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' + err });
    }
});

// GET USER DATA
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.status(200).json({ user });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' + err });
    }
});

// LOGOUT (clear cookie)
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    });
    res.status(200).json({ message: 'Logged out' });
});

export default router;
