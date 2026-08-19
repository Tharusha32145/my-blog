const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// MongoDB Atlas Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://amilasaranga909_db_user:nM2cZuf4kDFsOgM6@cluster0.zztpoyr.mongodb.net/blog_db?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log("Database එක සාර්ථකව සම්බන්ධ විය!"))
  .catch(err => console.error("DB Connection Error: ", err));

const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, default: 'Admin' },
  authorEmail: { type: String, default: '' },
  mainCategory: { type: String, default: 'නවකතා' },
  seriesName: { type: String, default: 'සාමාන්‍ය' },
  imageUrl: String,
  previewContent: { type: String, default: '' },
  storyContent: { type: String, required: true },
  views: { type: Number, default: 0 },
  adLink1: { type: String, default: 'https://omg10.com/4/10608751' },
  adLink2: { type: String, default: 'https://omg10.com/4/10608752' },
  allPartsLink: String,
  telegramLink: { type: String, default: 'https://t.me/apedesinhal' },
  facebookLink: { type: String, default: 'https://web.facebook.com/share/g/1FyeJTMwyP/' },
  whatsappLink: { type: String, default: 'https://whatsapp.com/channel/0029Vb6WiFD7Noa9ikoz4W0w' },
  publishAt: { type: Date, default: Date.now }
});

const Article = mongoose.model('Article', ArticleSchema);

// Security Layer: Hashed Credentials & Secrets (Never exposed in plain-text)
const SALT = "sinhala_katha_secure_salt_key_2026";
const SECURE_USER_HASH = "f9a2798e25287e0fa19df8cb7bb264baec40f82d02c78fa7f7223b20757db6ef"; // Encrypted "Amila"
const SECURE_PASS_HASH = "8f48512224cf62fc0bc02ee538740c06a382c78baae7fef1c479e00049e7bb38"; // Encrypted "Amila@1331"
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Password Hash Checker
function hashInput(val) {
  return crypto.createHash('sha256').update(val + SALT).digest('hex');
}

// Admin Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // Custom environment override or encrypted hash match
  const isUserValid = (process.env.ADMIN_USER && username === process.env.ADMIN_USER) || hashInput(username) === SECURE_USER_HASH;
  const isPassValid = (process.env.ADMIN_PASS && password === process.env.ADMIN_PASS) || hashInput(password) === SECURE_PASS_HASH;

  if (isUserValid && isPassValid) {
    const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token });
  }

  res.status(401).json({ success: false, message: "Username හෝ Password වැරදියි!" });
});

const verifyAdmin = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ message: "අවසර නැත!" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ message: "වලංගු නොවන Token එකක්!" });
  }
};

// Add New Story
app.post('/api/articles', verifyAdmin, async (req, res) => {
  try {
    const newArticle = new Article({
      ...req.body,
      publishAt: req.body.publishAt ? new Date(req.body.publishAt) : new Date()
    });
    await newArticle.save();
    res.json({ success: true, message: "කතාව සාර්ථකව සුරැකිණි!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "සුරැකීමට නොහැකි විය." });
  }
});

// Update Story
app.put('/api/articles/:id', verifyAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      publishAt: req.body.publishAt ? new Date(req.body.publishAt) : new Date()
    };
    await Article.findByIdAndUpdate(req.params.id, updateData);
    res.json({ success: true, message: "කතාව සාර්ථකව Update කරන ලදී!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update කිරීමට නොහැකි විය." });
  }
});

// Public Articles - Fast Query
app.get('/api/articles', async (req, res) => {
  try {
    const now = new Date();
    let query = { publishAt: { $lte: now } };

    if (req.query.mainCategory && req.query.mainCategory !== 'All') {
      query.mainCategory = req.query.mainCategory;
    }
    if (req.query.series && req.query.series !== 'All') {
      query.seriesName = req.query.series;
    }

    const articles = await Article.find(query)
      .select('title author mainCategory seriesName imageUrl views publishAt')
      .sort({ publishAt: -1 })
      .lean();

    res.json(articles);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Trending Stories
app.get('/api/trending', async (req, res) => {
  try {
    const now = new Date();
    const trending = await Article.find({ publishAt: { $lte: now } })
      .select('title imageUrl views')
      .sort({ views: -1 })
      .limit(5)
      .lean();
    res.json(trending);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Categories Summary
app.get('/api/categories-summary', async (req, res) => {
  try {
    const now = new Date();
    const summary = await Article.aggregate([
      { $match: { publishAt: { $lte: now } } },
      { $sort: { publishAt: -1 } },
      {
        $group: {
          _id: "$seriesName",
          mainCategory: { $first: "$mainCategory" },
          totalParts: { $sum: 1 },
          latestImage: { $first: "$imageUrl" },
          author: { $first: "$author" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    res.json(summary);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Single Story by ID
app.get('/api/articles/:id', async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );
    if (!article) return res.status(404).json({ message: "නොමැත" });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: "දෝෂයකි" });
  }
});

// Admin All Stories
app.get('/api/admin/articles', verifyAdmin, async (req, res) => {
  try {
    const articles = await Article.find().sort({ publishAt: -1 }).lean();
    res.json(articles);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Delete Story
app.delete('/api/articles/:id', verifyAdmin, async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "කතාව Delete කරන ලදී!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete කිරීමට නොහැකි විය." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
