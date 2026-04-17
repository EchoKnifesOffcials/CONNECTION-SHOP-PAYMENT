const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for both sites
app.use(cors({
    origin: ['https://echoknives.onrender.com', 'https://echoknivesmm2.onrender.com', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());

// Store active orders (in memory - clears on restart)
const activeOrders = new Map();
const completedOrders = new Map();

// Robux to PHP conversion rate (1 Robux = 0.60 PHP approximately)
const ROBUX_TO_PHP_RATE = 0.60;

// Email configuration (optional - for order notifications)
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log('📧 Email notifications enabled');
}

// Send email notification
async function sendEmailNotification(to, subject, html) {
    if (!transporter) return;
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            html: html
        });
        console.log(`📧 Email sent to ${to}`);
    } catch (error) {
        console.error('Email error:', error.message);
    }
}

// ============ SHOP SITE ENDPOINTS ============

// Shop sends cart data here before redirecting
app.post('/api/create-order', (req, res) => {
    const orderData = req.body;
    const orderId = orderData.orderId || 'ECHO-' + Date.now().toString(36).toUpperCase();
    
    // Calculate PHP total and Robux total
    const phpTotal = orderData.subtotal || orderData.total || 0;
    const robuxTotal = Math.ceil(phpTotal / ROBUX_TO_PHP_RATE);
    
    // Store the order
    activeOrders.set(orderId, {
        orderId: orderId,
        items: orderData.items || [],
        subtotal: phpTotal,
        robuxTotal: robuxTotal,
        robloxUser: orderData.robloxUser || 'Not specified',
        customerEmail: orderData.customerEmail || orderData.userEmail || 'customer@example.com',
        customerName: orderData.customerName || 'Customer',
        status: 'pending',
        createdAt: new Date().toISOString(),
        currency: orderData.currency || 'PHP'
    });
    
    console.log(`\n📦 NEW ORDER CREATED: ${orderId}`);
    console.log(`   Items: ${orderData.items?.length || 0}`);
    console.log(`   PHP Total: ₱${phpTotal}`);
    console.log(`   Robux Total: ${robuxTotal} R$`);
    console.log(`   Roblox User: ${orderData.robloxUser}`);
    console.log(`   Customer Email: ${orderData.customerEmail || orderData.userEmail}`);
    
    // Send email notification to admin
    sendEmailNotification(
        process.env.ADMIN_EMAIL || 'ivanmendones13@gmail.com',
        `🛒 New Order: ${orderId}`,
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f0f4f8; border-radius: 20px;">
            <h2 style="color: #87CEEB;">New Order Created</h2>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Customer:</strong> ${orderData.customerName || 'Customer'}</p>
            <p><strong>Roblox User:</strong> ${orderData.robloxUser}</p>
            <p><strong>Email:</strong> ${orderData.customerEmail || orderData.userEmail}</p>
            <hr>
            <h3>Items:</h3>
            <ul>${orderData.items?.map(i => `<li>${i.name} x${i.quantity} - ₱${i.price}</li>`).join('') || '<li>No items</li>'}</ul>
            <hr>
            <p><strong>Total (PHP):</strong> ₱${phpTotal}</p>
            <p><strong>Total (Robux):</strong> ${robuxTotal} R$</p>
            <p><strong>Status:</strong> Pending Payment</p>
            <div style="text-align: center; margin-top: 20px;">
                <a href="https://echoknivesmm2.onrender.com?order_id=${orderId}" style="background: #87CEEB; color: #1a1a2e; padding: 10px 20px; text-decoration: none; border-radius: 30px;">View Order</a>
            </div>
        </div>
        `
    );
    
    res.json({ 
        success: true, 
        orderId: orderId,
        phpTotal: phpTotal,
        robuxTotal: robuxTotal,
        paymentUrl: `https://echoknivesmm2.onrender.com?order_id=${orderId}`
    });
});

// Shop can check order status
app.get('/api/order/:orderId', (req, res) => {
    let order = activeOrders.get(req.params.orderId);
    if (!order) {
        order = completedOrders.get(req.params.orderId);
    }
    
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
    let order = activeOrders.get(orderId);
    
    // Also check completed orders
    if (!order) {
        order = completedOrders.get(orderId);
    }
    
    if (order) {
        console.log(`📤 Order fetched by payment site: ${orderId} (Status: ${order.status})`);
        res.json({ 
            success: true, 
            order: {
                orderId: order.orderId,
                items: order.items,
                subtotal: order.subtotal,
                robuxTotal: order.robuxTotal,
                robloxUser: order.robloxUser,
                customerEmail: order.customerEmail,
                customerName: order.customerName,
                status: order.status,
                currency: order.currency,
                createdAt: order.createdAt
            }
        });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Payment site marks order as paid (PHP payment)
app.post('/api/complete-order/:orderId', (req, res) => {
    const orderId = req.params.orderId;
    const order = activeOrders.get(orderId);
    
    if (order) {
        order.status = 'completed';
        order.paidAt = new Date().toISOString();
        order.paymentMethod = req.body.paymentMethod || 'Card / GCash';
        order.transactionId = req.body.transactionId || 'TXN-' + Date.now();
        order.paidAmount = req.body.amount || order.subtotal;
        
        activeOrders.delete(orderId);
        completedOrders.set(orderId, order);
        
        console.log(`\n✅ ORDER COMPLETED (PHP): ${orderId}`);
        console.log(`   Amount: ₱${order.paidAmount}`);
        console.log(`   Method: ${order.paymentMethod}`);
        
        // Send confirmation email to customer
        sendEmailNotification(
            order.customerEmail,
            `✅ Order Confirmed: ${orderId}`,
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f0f4f8; border-radius: 20px;">
                <h2 style="color: #87CEEB;">Payment Confirmed! 🎉</h2>
                <p>Hello <strong>${order.customerName}</strong>,</p>
                <p>Your order <strong>${orderId}</strong> has been confirmed and is being processed.</p>
                <hr>
                <h3>Order Summary:</h3>
                <ul>${order.items.map(i => `<li>${i.name} x${i.quantity} - ₱${i.price}</li>`).join('')}</ul>
                <hr>
                <p><strong>Total Paid:</strong> ₱${order.paidAmount}</p>
                <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
                <p><strong>Roblox User:</strong> ${order.robloxUser}</p>
                <p>Your items will be delivered within 24 hours.</p>
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #87CEEB;">Thank you for shopping at ECHOKNIVES!</p>
                </div>
            </div>
            `
        );
        
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Payment site marks order as paid (ROBUX payment)
app.post('/api/complete-order-robux/:orderId', (req, res) => {
    const orderId = req.params.orderId;
    const order = activeOrders.get(orderId);
    
    if (order) {
        order.status = 'completed';
        order.paidAt = new Date().toISOString();
        order.paymentMethod = 'Robux';
        order.robuxPaid = order.robuxTotal;
        order.robloxUsername = req.body.robloxUsername || order.robloxUser;
        
        activeOrders.delete(orderId);
        completedOrders.set(orderId, order);
        
        console.log(`\n✅ ORDER COMPLETED (ROBUX): ${orderId}`);
        console.log(`   Robux Amount: ${order.robuxTotal} R$`);
        console.log(`   Roblox User: ${order.robloxUser}`);
        
        // Send confirmation email to customer
        sendEmailNotification(
            order.customerEmail,
            `✅ Order Confirmed (Robux): ${orderId}`,
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f0f4f8; border-radius: 20px;">
                <h2 style="color: #87CEEB;">Robux Payment Confirmed! 🎉</h2>
                <p>Hello <strong>${order.customerName}</strong>,</p>
                <p>Your order <strong>${orderId}</strong> has been confirmed via Robux payment.</p>
                <hr>
                <h3>Order Summary:</h3>
                <ul>${order.items.map(i => `<li>${i.name} x${i.quantity}</li>`).join('')}</ul>
                <hr>
                <p><strong>Robux Paid:</strong> ${order.robuxTotal} R$</p>
                <p><strong>Roblox User:</strong> ${order.robloxUser}</p>
                <p>Your items will be delivered within 24 hours.</p>
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #87CEEB;">Thank you for shopping at ECHOKNIVES!</p>
                </div>
            </div>
            `
        );
        
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Get all active orders (admin endpoint)
app.get('/api/active-orders', (req, res) => {
    const orders = Array.from(activeOrders.values()).map(o => ({
        orderId: o.orderId,
        subtotal: o.subtotal,
        robuxTotal: o.robuxTotal,
        robloxUser: o.robloxUser,
        customerName: o.customerName,
        createdAt: o.createdAt
    }));
    res.json({ success: true, orders });
});

// Get all completed orders (admin endpoint)
app.get('/api/completed-orders', (req, res) => {
    const orders = Array.from(completedOrders.values()).map(o => ({
        orderId: o.orderId,
        subtotal: o.subtotal,
        robuxTotal: o.robuxTotal,
        robloxUser: o.robloxUser,
        customerName: o.customerName,
        paidAt: o.paidAt,
        paymentMethod: o.paymentMethod
    }));
    res.json({ success: true, orders });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeOrders: activeOrders.size,
        completedOrders: completedOrders.size,
        message: 'ECHOKNIVES Cart Middleman is running',
        robuxRate: ROBUX_TO_PHP_RATE
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'ECHOKNIVES Cart Middleman',
        version: '2.0.0',
        status: 'running',
        robuxRate: `${ROBUX_TO_PHP_RATE} PHP per Robux`,
        endpoints: {
            'POST /api/create-order': 'Shop creates an order',
            'GET /api/order/:orderId': 'Check order status',
            'GET /api/get-order/:orderId': 'Payment site gets order details',
            'POST /api/complete-order/:orderId': 'PHP payment completion',
            'POST /api/complete-order-robux/:orderId': 'Robux payment completion',
            'GET /api/active-orders': 'Get all pending orders (admin)',
            'GET /api/completed-orders': 'Get all completed orders (admin)'
        }
    });
});

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════════╗
    ║              ECHOKNIVES CART MIDDLEMAN - RUNNING                  ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  ✅ Port: ${PORT}                                                    ║
    ║  🔗 Shop URL: https://echoknives.onrender.com                      ║
    ║  💳 Payment URL: https://echoknivesmm2.onrender.com                ║
    ║  📧 Email Notifications: ${transporter ? 'ENABLED' : 'DISABLED'}                                    ║
    ║  💰 Robux Rate: ${ROBUX_TO_PHP_RATE} PHP = 1 Robux                     ║
    ╚══════════════════════════════════════════════════════════════════╝
    `);
});
