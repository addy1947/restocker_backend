import mongoose from 'mongoose';

const proSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
    },
    description: { 
        type: String, 
        required: true 
    },
    measure: {
        type: String, 
        required: true, 
        enum: ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'bag','bottle', 'can', 'pack', 'piece', 'other'] 
    },

},{_id:true})

const productSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    allProducts: [proSchema]
}, { timestamps: true });

export default mongoose.model('Product', productSchema);
