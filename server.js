const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from root directory
app.use(express.static(path.join(__dirname)));

// Configure Gmail Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'airmountcompany@gmail.com',
    pass: 'fgxhxiruqckmmkfv'
  }
});

const uri = "mongodb+srv://airmountcompany_db_user:8DcHOJXkjyZSRMPm@cluster0.2dihhnv.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

let db, usersCollection;

async function startServer() {
  try {
    await client.connect();
    db = client.db("instaclone");
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB Atlas & ready for secure Gmail Auth!");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to database", error);
  }
}

startServer();

// --- REGISTRATION FLOW ---

// Register Step 1: Email & Password -> Sends Gmail Code
app.post('/api/register-step1', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Email and password (min 6 chars) are required.' });
  }

  try {
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ success: false, error: 'Email is already registered. Please log in.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    if (existingUser) {
      await usersCollection.updateOne({ email }, { $set: { password: hashedPassword, code } });
    } else {
      await usersCollection.insertOne({
        email,
        password: hashedPassword,
        code,
        isVerified: false,
        username: null,
        birthday: null,
        createdAt: new Date()
      });
    }

    await transporter.sendMail({
      from: 'airmountcompany@gmail.com',
      to: email,
      subject: 'Your InstaClone Verification Code',
      text: `Your registration verification code is: ${code}`
    });

    res.json({ success: true, message: 'Verification code sent to your Gmail!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register Step 2: Verify Code
app.post('/api/register-step2', async (req, res) => {
  const { email, code } = req.body;

  try {
    const user = await usersCollection.findOne({ email });
    if (user && user.code === code) {
      res.json({ success: true, message: 'Code verified successfully!' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid verification code.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register Step 3: Create Username & Birthday
app.post('/api/register-step3', async (req, res) => {
  const { email, username, birthday } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({ success: false, error: 'Username must be at least 3 characters long.' });
  }
  if (!birthday) {
    return res.status(400).json({ success: false, error: 'Please provide your birthday.' });
  }

  try {
    const existingUsername = await usersCollection.findOne({ username, isVerified: true });
    if (existingUsername) {
      return res.status(400).json({ success: false, error: 'Username is already taken.' });
    }

    await usersCollection.updateOne(
      { email },
      { $set: { username, birthday, isVerified: true, code: null } }
    );

    res.status(201).json({ success: true, message: 'Account fully created successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// --- LOGIN FLOW ---

// Login Step 1: Verify Password & Send Code
app.post('/api/login-step1', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await usersCollection.findOne({ email });
    if (!user || !user.isVerified) {
      return res.status(400).json({ success: false, error: 'User not found or not verified. Please register first.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await usersCollection.updateOne({ email }, { $set: { code } });

    await transporter.sendMail({
      from: 'airmountcompany@gmail.com',
      to: email,
      subject: 'Your InstaClone Login Verification Code',
      text: `Your login verification code is: ${code}`
    });

    res.json({ success: true, message: 'Verification code sent to your Gmail!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login Step 2: Verify Code
app.post('/api/login-step2', async (req, res) => {
  const { email, code } = req.body;

  try {
    const user = await usersCollection.findOne({ email });

    if (user && user.code === code) {
      res.json({ success: true, message: 'Logged in successfully!' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid verification code.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

