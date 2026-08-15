const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Your working MongoDB connection string
const uri = "mongodb+srv://airmountcompany_db_user:8DcHOJXkjyZSRMPm@cluster0.2dihhnv.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

let db, subscribersCollection;

async function startServer() {
  try {
    await client.connect();
    db = client.db("instaclone");
    subscribersCollection = db.collection("subscribers");
    console.log("Connected to MongoDB Atlas for web server!");

    app.listen(3000, () => {
      console.log("Backend server running on http://localhost:3000");
    });
  } catch (error) {
    console.er("Failed to connect to database", error);
  }
}

startServer();

// API endpoint for your website frontend to save data
app.post('/api/subscribe', async (req, res) => {
  try {
    const newEntry = {
      email: req.body.email,
      createdAt: new Date()
    };
    const result = await subscribersCollection.insertOne(newEntry);
    res.status(201).json({ success: true, id: result.insertedId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

