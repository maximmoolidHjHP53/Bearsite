const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors());

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

    app.listen(3000, () => {
      console.log("Backend server running on http://localhost:3000");
    });
  } catch (error) {
    console.error("Failed to connect to database", error);
  }
}

startServer();

// 1. Register Endpoint (High security validation & password hashing)
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({ success: false, error: 'Username must be at least 3 characters long.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
  }

  try {
    const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email or Username is already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      username,
      email,
      password: hashedPassword,
      code: null,
      createdAt: new Date()
    };

    await usersCollection.insertOne(newUser);
    res.status(201).json({ success: true, message: 'Account created successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Login Step 1: Verify Password & Send Gmail Code
app.post('/api/login-step1', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found. Please register first.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Save code to user document
    await usersCollection.updateOne({ email }, { $set: { code } });

    // Send code via Gmail
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

// 3. Login Step 2: Verify Gmail Code
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

