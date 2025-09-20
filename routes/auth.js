import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../model/User.js';
import nodemailer from "nodemailer";

const router = express.Router();
const JWT_SECRET = 'howareyou??madam';
const JWT_EXPIRES_IN = '3d';

const createToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// SIGNUP + AUTO-LOGIN (set cookie)
router.post('/signup', async (req, res) => {
    const { email, password, name,otp } = req.body;
    if(email && !password && !otp){
        const user = await User.findOne({ email });
        if(user){
            return res.status(400).json({ error: 'User already exists' });
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpExpires = Date.now() + 10 * 60 * 1000;
        const newUser = await User.create({email,otp,otpExpires})
        newUser.save();

        const transporter = nodemailer.createTransport({
            service: 'gmail', // or use SMTP details
            auth: {
                user: process.env.EMAIL_USER, // your email
                pass: process.env.EMAIL_PASS  // your email password or app password
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP is ${generatedOtp}. It will expire in 10 minutes.`
        };

        // send the email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(error);
                return res.status(500).json({ error: 'Error sending OTP email' });
            } else {
                return res.status(200).json({ message: 'OTP sent successfully', email });
            }
        });
        
    }
    try {
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'User already exists' });

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashed });
        user.save()

        const token = createToken(user._id);

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,        // HTTPS only
            sameSite: 'None',    // cross-site
            maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days
        });

        res.status(201).json({ message: 'User created & logged in', token: token, userId: user._id });
    } catch (err) {
        res.status(500).json({ error: 'Signup failed' + err });
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
