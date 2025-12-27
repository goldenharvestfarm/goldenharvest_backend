const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin password (in production, use environment variables)
const ADMIN_PASSWORD = 'goldenharvest123';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/golden_harvest_farm', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Listing Schema (Admin only creates listings)
const listingSchema = new mongoose.Schema({
    animalType: { type: String, required: true, enum: ['chicken', 'goat'] },
    breed: { type: String, required: true },
    quantity: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    healthStatus: { type: String, required: true },
    location: { type: String, required: true },
    contactMethod: { type: String, default: 'Phone' },
    phone: { type: String, required: true },
    status: { type: String, default: 'active', enum: ['active', 'sold', 'inactive'] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Listing = mongoose.model('Listing', listingSchema);

// Contact Message Schema (Public can send messages)
const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Admin Authentication Middleware
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token || token !== ADMIN_PASSWORD) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    
    next();
};

// ==================== PUBLIC ROUTES ====================

// Get all active listings (Public can view)
app.get('/api/listings', async (req, res) => {
    try {
        const { animalType, minPrice, maxPrice, location } = req.query;
        
        let query = { status: 'active' };
        
        if (animalType && animalType !== 'all') {
            query.animalType = animalType;
        }
        
        if (minPrice || maxPrice) {
            query.pricePerUnit = {};
            if (minPrice) query.pricePerUnit.$gte = parseInt(minPrice);
            if (maxPrice) query.pricePerUnit.$lte = parseInt(maxPrice);
        }
        
        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }
        
        const listings = await Listing.find(query).sort({ createdAt: -1 });
        
        res.json({ listings });
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ message: 'Server error fetching listings' });
    }
});

// Get single listing (Public can view)
app.get('/api/listings/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }
        
        res.json({ listing });
    } catch (error) {
        console.error('Error fetching listing:', error);
        res.status(500).json({ message: 'Server error fetching listing' });
    }
});

// Submit contact form (Public can send messages)
app.post('/api/contact', async (req, res) => {
    try {
        const contact = new Contact(req.body);
        await contact.save();
        
        res.status(201).json({
            message: 'Message sent successfully',
            contact
        });
    } catch (error) {
        console.error('Error submitting contact:', error);
        res.status(500).json({ message: 'Server error submitting contact' });
    }
});

// ==================== ADMIN ROUTES (Protected) ====================

// Admin: Create listing
app.post('/api/admin/listings', authenticateAdmin, async (req, res) => {
    try {
        const listing = new Listing({
            animalType: req.body.animalType,
            breed: req.body.breed,
            quantity: req.body.quantity,
            pricePerUnit: req.body.pricePerUnit,
            description: req.body.description,
            image: req.body.image,
            healthStatus: req.body.healthStatus,
            location: req.body.location,
            contactMethod: req.body.contactMethod || 'Phone',
            phone: req.body.phone
        });
        
        await listing.save();
        
        res.status(201).json({
            message: 'Listing created successfully',
            listing
        });
    } catch (error) {
        console.error('Error creating listing:', error);
        res.status(500).json({ message: 'Server error creating listing' });
    }
});

// Admin: Update listing
app.put('/api/admin/listings/:id', authenticateAdmin, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (req.body[key] !== undefined) {
                listing[key] = req.body[key];
            }
        });
        
        listing.updatedAt = Date.now();
        await listing.save();
        
        res.json({
            message: 'Listing updated successfully',
            listing
        });
    } catch (error) {
        console.error('Error updating listing:', error);
        res.status(500).json({ message: 'Server error updating listing' });
    }
});

// Admin: Delete listing
app.delete('/api/admin/listings/:id', authenticateAdmin, async (req, res) => {
    try {
        const listing = await Listing.findByIdAndDelete(req.params.id);
        
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }
        
        res.json({ message: 'Listing deleted successfully' });
    } catch (error) {
        console.error('Error deleting listing:', error);
        res.status(500).json({ message: 'Server error deleting listing' });
    }
});

// Admin: Get all messages
app.get('/api/admin/messages', authenticateAdmin, async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error fetching messages' });
    }
});

// Admin: Get dashboard stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const totalListings = await Listing.countDocuments();
        const activeListings = await Listing.countDocuments({ status: 'active' });
        const totalMessages = await Contact.countDocuments();
        
        const chickens = await Listing.aggregate([
            { $match: { animalType: 'chicken', status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
        ]);
        
        const goats = await Listing.aggregate([
            { $match: { animalType: 'goat', status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
        ]);
        
        res.json({
            totalListings,
            activeListings,
            totalMessages,
            chickensAvailable: chickens[0]?.total || 0,
            goatsAvailable: goats[0]?.total || 0
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'Server error fetching stats' });
    }
});

// ==================== SERVE HTML FILES ====================

// Serve main site
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin dashboard
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==================== SEED DATA (FOR TESTING) ====================

// Seed database with sample data
app.get('/api/seed', async (req, res) => {
    try {
        // Clear existing data
        await Listing.deleteMany({});
        
        // Create sample listings
        const sampleListings = [
            {
                animalType: 'chicken',
                breed: 'Rhode Island Red',
                quantity: 50,
                pricePerUnit: 1500,
                description: 'Healthy, vaccinated chickens ready for consumption. Raised on organic feed with proper care.',
                image: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400',
                healthStatus: 'Fully Vaccinated',
                location: 'Kigali',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            },
            {
                animalType: 'goat',
                breed: 'Boer Goat',
                quantity: 15,
                pricePerUnit: 45000,
                description: 'Premium quality Boer goats, well-fed and healthy. Perfect for meat production with excellent growth rates.',
                image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400',
                healthStatus: 'Excellent Health',
                location: 'Musanze',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            },
            {
                animalType: 'chicken',
                breed: 'Broiler',
                quantity: 100,
                pricePerUnit: 1200,
                description: 'Fast-growing broiler chickens, 6 weeks old. Ready for market with optimal weight.',
                image: 'https://images.unsplash.com/photo-1612170153139-6f881ff067e0?w=400',
                healthStatus: 'Healthy',
                location: 'Kigali',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            },
            {
                animalType: 'goat',
                breed: 'Alpine Goat',
                quantity: 8,
                pricePerUnit: 50000,
                description: 'Hardy alpine goats with excellent meat quality. Well-maintained and disease-free.',
                image: 'https://images.unsplash.com/photo-1594622482355-2a13e4f41b2e?w=400',
                healthStatus: 'Vaccinated',
                location: 'Rubavu',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            },
            {
                animalType: 'chicken',
                breed: 'Leghorn',
                quantity: 75,
                pricePerUnit: 1300,
                description: 'Quality Leghorn chickens from our certified farm. Disease-free and well-nourished.',
                image: 'https://images.unsplash.com/photo-1606567595334-d39972c85dbe?w=400',
                healthStatus: 'Excellent',
                location: 'Huye',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            },
            {
                animalType: 'goat',
                breed: 'Kiko Goat',
                quantity: 12,
                pricePerUnit: 48000,
                description: 'Robust Kiko goats with excellent meat-to-bone ratio. Hardy and low-maintenance.',
                image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=400',
                healthStatus: 'Healthy',
                location: 'Nyagatare',
                contactMethod: 'Phone',
                phone: '+250 788 000 000'
            }
        ];
        
        await Listing.insertMany(sampleListings);
        
        res.json({ 
            message: 'Database seeded successfully with sample listings',
            count: sampleListings.length
        });
    } catch (error) {
        console.error('Error seeding database:', error);
        res.status(500).json({ message: 'Error seeding database', error: error.message });
    }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api`);
    console.log(`🌱 MongoDB connected to: mongodb://localhost:27017/golden_harvest_farm`);
});