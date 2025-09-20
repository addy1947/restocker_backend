import mongoose from 'mongoose';

const stoSchema= new mongoose.Schema({
    time:{
        type:Date,
        default:Date.now
    },
    type:{
        type:String,
        enum:['add','sub'],
    },
    usedQty:{
        type:Number,
    }
})
const stockDetailSchema =new mongoose.Schema({
    expiryDate: {
        type: Date,
        required: true
    },
    qty: {
        type: Number,
        required: true
    },
    entry: [stoSchema]
})

const stockSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId:{
        type:mongoose.Schema.Types.ObjectId,
        required:true
    },
    stockDetail:[stockDetailSchema],
    

}, { timestamps: true });

export default mongoose.model('Stock', stockSchema);