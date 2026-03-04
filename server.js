const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
const { NlpManager } = require('node-nlp');

const manager = new NlpManager({ languages: ['en'] });
const app = express();
const PORT = 3000;

// Middleware setup
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(bodyParser.json());

// Serve static files from 'public' and 'views' folders
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));
// Session setup
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './' }),
    secret: 'SkinHeal@123',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60,
        sameSite: 'None'
    }
}));

// Database setup
const userDbPath = path.join(process.cwd(), 'users.db');
const userDb = new sqlite3.Database(userDbPath, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the users SQLite database.');
    }
});

const skinHealDbPath = path.join(process.cwd(), 'skin_heal.db');
const skinHealDb = new sqlite3.Database(skinHealDbPath, (err) => {
    if (err) {
        console.error(err.message);
    }
});

// Serve HTML files from views folder
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views', 'front.html'));
});

// Signup route
app.post('/api/users/signup', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).send('All fields are required.');
    }

    const stmt = userDb.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    stmt.run(username, email, password, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).send('Username already exists.');
            }
            return res.status(500).send('Internal server error.');
        }
        res.status(201).send({ message: 'User created successfully!' });
    });
    stmt.finalize();
});

// Login route
app.post('/api/users/login', (req, res) => {
    const { username, password } = req.body;
    userDb.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).send('Internal server error.');
        }
        if (user && password === user.password) {
            req.session.user = { id: user.id, username: user.username, email: user.email };
            res.send({ message: 'Login successful!' });
        } else {
            res.status(401).send({ message: 'Invalid username or password.' });
        }
    });
});

// Logout route
app.post('/api/users/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Internal server error.');
        }
        res.send({ message: 'Logged out successfully!' });
    });
});



// API routes to fetch products based on skin type
app.get('/api/products/type', (req, res) => {
    const type = req.query.type; // Get the skin type from the query string
    if (!type) {
        return res.status(400).send('Skin type is required.');
    }

    const sql = `
        SELECT p.id, p.name, p.image, p.link, p.description
        FROM products p
        JOIN product_types pt ON p.id = pt.product_id
        JOIN skin_types st ON pt.type_id = st.id
        WHERE st.id = ?;
    `;

    skinHealDb.all(sql, [type], (err, rows) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).send('Internal server error.');
        }
        res.json(rows); // Return the products as JSON
    });
});

// API routes to fetch products based on selected skin concerns
app.get('/api/products/concerns', (req, res) => {
    const concernIds = req.query.concerns; // Get the selected concern IDs from the query string

    if (!concernIds) {
        return res.status(400).send('No skin concerns provided.');
    }

    const concernIdList = concernIds.split(',');

    const sql = `
        SELECT p.id, p.name, p.image, p.link, p.description
        FROM products p
        JOIN product_concerns pc ON p.id = pc.product_id
        JOIN skin_concerns sc ON pc.concern_id = sc.id
        WHERE sc.id IN (${concernIdList.map(() => '?').join(',')});
    `;

    skinHealDb.all(sql, concernIdList, (err, rows) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).send('Internal server error.');
        }

        res.json(rows); // Return the products as JSON
    });
});

const qaPairs =
{
  "I have a concern": "Sure! I am here to help. What is your skin concern?",
  "Hello, I have a concern": "Sure! I am here to help. What is your skin concern?",
  "I need help with skincare": "I'd be happy to assist! What specifically do you need help with?",
  "My skin is dry": "Dry skin needs moisture. Look for a rich, hydrating moisturizer with ingredients like hyaluronic acid or glycerin.",
  "I have oily skin": "Oily skin can be tricky. Look for products that balance oil without drying out your skin.",
  "Can you recommend products for acne?": "For acne, I recommend salicylic acid-based products and non-comedogenic moisturizers.",
  "How to treat acne?": "To treat acne, try using a gentle cleanser, acne-fighting serum, and don't forget sunscreen.",
  "What is a good moisturizer?": "A good moisturizer is one that matches your skin type. For dry skin, go for a thicker cream; for oily skin, a lightweight gel.",
  "My skin is sensitive": "For sensitive skin, choose gentle, fragrance-free products that contain soothing ingredients like aloe vera or chamomile.",
  "What should I use for sensitive skin?": "Sensitive skin requires calming products, so look for soothing ingredients like chamomile and avoid harsh chemicals.",
  "I have combination skin": "Combination skin requires balancing products. Use a lightweight moisturizer for the T-zone and a richer cream for dry areas.",
  "What should I use for combination skin?": "For combination skin, a gentle cleanser and a lightweight moisturizer for oily areas work best, with a richer cream for dry spots.",
  "Can you help with my pimples?": "For pimples, I suggest using products with benzoyl peroxide or salicylic acid to target acne-causing bacteria and unclog pores.",
  "How do I treat dark spots?": "To treat dark spots, use products with ingredients like vitamin C or niacinamide to brighten and even your skin tone.",
  "My skin feels tight and dry": "Tight and dry skin needs hydration. Look for moisturizers with ingredients like hyaluronic acid or ceramides to restore moisture.",
  "I have large pores": "Large pores can be minimized with products containing salicylic acid or niacinamide, which tighten the skin and refine texture.",
  "How can I reduce my pores?": "To reduce the appearance of pores, use a salicylic acid-based product or a pore-minimizing serum with niacinamide.",
  "My skin gets red easily": "For redness, opt for products with soothing ingredients like aloe vera or niacinamide to calm irritation.",
  "What products are good for hyperpigmentation?": "For hyperpigmentation, look for products with vitamin C, niacinamide, or hydroquinone to lighten dark spots.",
  "I have wrinkles on my face": "To reduce wrinkles, use products with retinol or peptides that stimulate collagen and improve skin elasticity.",
  "How do I get rid of wrinkles?": "To get rid of wrinkles, incorporate retinol or peptides into your routine. Always wear sunscreen to prevent further signs of aging.",
  "My skin looks dull": "To brighten dull skin, use exfoliating products with AHAs or BHAs and add a vitamin C serum to your routine.",
  "How do I brighten my skin?": "Brighten skin with vitamin C serums or exfoliating products containing AHAs, which promote skin turnover.",
  "My skin is oily but I get dry patches": "For combination skin, use a lightweight moisturizer for the oily areas and a richer cream for the dry patches.",
  "What is the best sunscreen for oily skin?": "For oily skin, choose a lightweight, oil-free sunscreen that won't clog pores or make your skin greasy.",
  "Can you suggest some anti-aging products?": "Anti-aging products often contain ingredients like retinoids, peptides, and antioxidants to reduce wrinkles and improve skin texture.",
  "What are some good products for my acne scars?": "For acne scars, products with retinoids, vitamin C, or niacinamide can help reduce discoloration and promote skin healing.",
  "How do I get rid of acne?": "To clear acne, use products with salicylic acid or benzoyl peroxide. Avoid touching your face frequently and maintain a consistent skincare routine.",
  "What are some home remedies for acne?": "Natural remedies like tea tree oil, aloe vera, or honey can help calm acne. Make sure to patch-test first to avoid irritation.",
  "What should I use for acne scars?": "To treat acne scars, look for products with ingredients like vitamin C, retinoids, or niacinamide that brighten and repair the skin.",
  "How can I treat dry skin at home?": "For dry skin, natural oils like coconut or olive oil can help hydrate. Also, try using a humidifier to add moisture to your environment.",
  "Can you recommend a good moisturizer for dry skin?": "For dry skin, go for a rich moisturizer containing hyaluronic acid, glycerin, or ceramides to deeply hydrate and restore moisture.",
  "What is the best treatment for oily skin?": "For oily skin, use oil-free moisturizers and products with salicylic acid or niacinamide to control excess oil production.",
  "How do I control oily skin?": "Control oily skin with a gentle foaming cleanser, an oil-free moisturizer, and a mattifying primer. Avoid over-cleansing.",
  "What products are good for sensitive skin?": "Look for fragrance-free, gentle products with calming ingredients like chamomile, aloe vera, and calendula for sensitive skin.",
  "Can I use retinol for sensitive skin?": "Retinol can irritate sensitive skin. If you want to try it, start with a lower concentration and apply it at night, always using sunscreen during the day.",
  "What is the best sunscreen for sensitive skin?": "For sensitive skin, choose sunscreen with physical blockers like zinc oxide or titanium dioxide, as they are gentler on the skin.",
  "How can I prevent wrinkles?": "Prevent wrinkles by using products with retinoids, peptides, and antioxidants. Always wear sunscreen to protect your skin from UV damage.",
  "What are some anti-aging tips?": "Anti-aging tips include using retinoids, peptides, and antioxidants, staying hydrated, and ensuring you get enough rest and a balanced diet.",
  "Can you recommend products for dark circles under my eyes?": "For dark circles, caffeine-infused eye creams or products with vitamin C and peptides can help reduce puffiness and brighten the under-eye area.",
  "What is the best skincare routine for combination skin?": "For combination skin, use a gentle cleanser, lightweight moisturizer for oily areas, and a richer cream for dry patches.",
  "How can I treat hyperpigmentation?": "To treat hyperpigmentation, use products with vitamin C, niacinamide, or licorice extract to lighten dark spots and even out skin tone.",
  "How do I get rid of sunspots?": "Sunspots can be reduced with products containing vitamin C, hydroquinone, or chemical exfoliants like AHAs. Always use sunscreen to prevent further darkening.",
  "What is the best cleanser for acne-prone skin?": "For acne-prone skin, choose a gentle cleanser with salicylic acid or benzoyl peroxide to clear clogged pores and reduce inflammation.",
  "Can you recommend a serum for glowing skin?": "A glowing serum should contain vitamin C, hyaluronic acid, or niacinamide to brighten and hydrate your skin.",
  "What should I use for oily T-zone?": "For an oily T-zone, use a mattifying primer, gentle foaming cleanser, and lightweight, oil-free moisturizer to balance the area.",
  "How can I reduce redness on my face?": "To reduce redness, use calming products with ingredients like aloe vera, chamomile, or niacinamide. Avoid harsh exfoliants.",
  "What products can I use for dark spots on my skin?": "For dark spots, try brightening serums with ingredients like vitamin C, licorice extract, or alpha arbutin.",
  "How do I get rid of blackheads?": "Use a gentle exfoliant with salicylic acid or a clay mask to draw out impurities and clear blackheads. Be sure to moisturize afterward.",
  "What is the best way to exfoliate my skin?": "Exfoliate once or twice a week with AHAs or BHAs. Avoid over-exfoliating to prevent irritation and sensitivity.",
  "What skincare routine is best for acne scars?": "For acne scars, use retinoids, vitamin C serums, and exfoliating acids to improve skin texture and fade dark spots.",
  "What is a good night cream for anti-aging?": "A good night cream for anti-aging should contain retinol, peptides, and ceramides to help repair and nourish the skin while you sleep.",
  "Can I use vitamin C serum in the morning?": "Yes, vitamin C serum can be used in the morning. It helps brighten the skin, protects against UV damage, and fights signs of aging.",
  "What ingredients should I avoid for sensitive skin?": "Avoid strong fragrances, alcohol, and harsh exfoliants like glycolic acid. Opt for gentle, hydrating formulas instead.",
  "Can you suggest a moisturizer for oily skin?": "For oily skin, use an oil-free, non-comedogenic moisturizer with ingredients like hyaluronic acid or glycerin to hydrate without clogging pores.",
  "What should I use for my dry lips?": "For dry lips, use a hydrating lip balm with beeswax or shea butter, and gently exfoliate with a lip scrub for smoother lips.",
  "How do I minimize pores on my face?":"To minimize pores, look for products with niacinamide, salicylic acid, or clay masks, which can help tighten and refine the appearance of pores"
};

// API route to handle chatbot interaction
app.post('/api/chatbot', (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).send('Message is required.');
    }

    // Check if the message matches any predefined questions
    const answer = qaPairs[message.trim()];

    if (answer) {
        return res.json({ answer });
    } else {
        // Default response if no match is found
        return res.json({ answer: "Sorry, I don't understand that question." });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});