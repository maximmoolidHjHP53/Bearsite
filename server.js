const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Firebase Admin using default environment credentials or project config
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "twitter-app-d879c"
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("FATAL ERROR: MONGO_URI environment variable is missing!");
  process.exit(1);
}

const client = new MongoClient(uri);
let db, usersCollection;

async function startServer() {
  try {
    await client.connect();
    db = client.db("instaclone");
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB Atlas & ready!");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

startServer();

// --- API AUTH ROUTE FOR FIREBASE ---
app.post('/api/auth/google', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // Save or update user in MongoDB Atlas
    const user = await usersCollection.findOneAndUpdate(
      { firebaseUid: uid },
      { 
        $set: { 
          email, 
          name, 
          avatar: picture, 
          lastLoginAt: new Date() 
        },
        $setOnInsert: { firebaseUid: uid, createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, user });
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});
