import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String },         // hashed password
    otp: { type: String },              // temporary OTP
    otpExpires: { type: Date },         // OTP expiry time
    verified: { type: Boolean, default: false }
});
export default mongoose.model('User', userSchema);
