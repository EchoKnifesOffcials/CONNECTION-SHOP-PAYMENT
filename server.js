const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for both sites
app.use(cors({
    origin: ['https://echoknives.onrender.com', 'https://echoknivesmm2.onrender.com', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// Store active orders (in memory - clears on restart)
const activeOrders = new Map();

// ============ SHOP SITE ENDPOINTS ============

// Shop sends cart data here before redirecting
app.post('/api/create-order', (req, res) => {
    const orderData = req.body;
    const orderId = orderData.orderId || 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    
    // Store the order
    activeOrders.set(orderId, {
        ...orderData,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📦 Order created: ${orderId}`);
    console.log(`   Items: ${orderData.items?.length || 0}`);
    console.log(`   Total: ₱${orderData.subtotal}`);
    console.log(`   Roblox: ${orderData.robloxUser}`);
    
    res.json({ 
        success: true, 
        orderId: orderId,
        paymentUrl: `https://echoknivesmm2.onrender.com?order_id=${orderId}`
    });
});

// Shop can check order status
app.get('/api/order/:orderId', (req, res) => {
    const order = activeOrders.get(req.params.orderId);
    if (order) {
        res.json({ success: true, order });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// ============ PAYMENT SITE ENDPOINTS ============

// Payment site fetches order details
app.get('/api/get-order/:orderId', (req, res) => {
    const orderId = req.params.orderId;
    const order = activeOrders.get(orderId);
    
    if (order) {
        console.log(`📤 Order fetched by payment site: ${orderId}`);
        res.json({ 
            success: true, 
            order: {
                orderId: order.orderId,
                items: order.items,
                subtotal: order.subtotal,
                robloxUser: order.robloxUser,
                customerEmail: order.customerEmail,
                status: order.status
            }
        });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Payment site marks order as paid
app.post('/api/complete-order/:orderId', (req, res) => {
    const orderId = req.params.orderId;
    const order = activeOrders.get(orderId);
    
    if (order) {
        order.status = 'completed';
        order.paidAt = new Date().toISOString();
        order.transactionId = req.body.transactionId || 'TXN-' + Date.now();
        activeOrders.set(orderId, order);
        
        console.log(`✅ Order completed: ${orderId}`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeOrders: activeOrders.size,
        message: 'Cart Middleman is running' 
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'ECHOKNIVES Cart Middleman',
        status: 'running',
        endpoints: {
            'POST /api/create-order': 'Shop creates an order',
            'GET /api/order/:orderId': 'Check order status',
            'GET /api/get-order/:orderId': 'Payment site gets order details',
            'POST /api/complete-order/:orderId': 'Payment site marks order complete'
        }
    });
});

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     ECHOKNIVES CART MIDDLEMAN - RUNNING                  ║
    ╠══════════════════════════════════════════════════════════╣
    ║  ✅ Port: ${PORT}                                            ║
    ║  🔗 Shop: https://echoknives.onrender.com                ║
    ║  💳 Payment: https://echoknivesmm2.onrender.com          ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
