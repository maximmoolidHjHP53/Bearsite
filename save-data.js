const { MongoClient } = require('mongodb');

// Your working connection string
const uri = "mongodb+srv://airmountcompany_db_user:8DcHOJXkjyZSRMPm@cluster0.2dihhnv.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

async function saveSubscriber() {
  try {
    await client.connect();
    
    // 1. Choose your database and collection (like a table)
    const database = client.db("instaclone");
    const subscribersCollection = database.collection("subscribers");

    // 2. Data you want to save
    const newSubscriber = {
      email: "user@example.com",
      createdAt: new Date()
    };

    // 3. Insert the document into MongoDB
    const result = await subscribersCollection.insertOne(newSubscriber);
    console.log(`Success! Inserted document with ID: ${result.insertedId}`);

  } finally {
    await client.close();
  }
}

saveSubscriber().catch(console.dir);

