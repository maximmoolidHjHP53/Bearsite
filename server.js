const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');

const app = express();

// Increase payload limits for image/base64 uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname)));

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("FATAL ERROR: MONGO_URI environment variable is missing!");
  process.exit(1);
}

const client = new MongoClient(uri);
let db, usersCollection, postsCollection;

// --- PASSPORT SERIALIZATION ---
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// --- GOOGLE STRATEGY ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://bearsite.onrender.com/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await usersCollection.findOne({ email });

        if (!user) {
          const result = await usersCollection.insertOne({
            email,
            name: profile.displayName,
            provider: 'google',
            providerId: profile.id,
            profileCompleted: false,
            createdAt: new Date()
          });
          user = await usersCollection.findOne({ _id: result.insertedId });
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
}

// --- AUTH ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    if (req.user && req.user.profileCompleted) {
      res.redirect('/home.html');
    } else {
      res.redirect('/creation.html');
    }
  }
);

// --- PROFILE COMPLETION ROUTE ---
app.post('/api/complete-profile', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });

  const { username, birthday, profilePicture } = req.body;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

  if (age < 18) {
    await usersCollection.deleteOne({ _id: req.user._id });
    req.logout(() => {
      res.json({ success: false, underAge: true });
    });
    return;
  }

  await usersCollection.updateOne(
    { _id: req.user._id },
    { $set: { username, birthday, profilePicture, profileCompleted: true } }
  );
  res.json({ success: true });
});

// --- CURRENT USER ---
app.get('/api/current-user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: req.user });
  } else {
    res.json({ success: false });
  }
});

// --- FRIENDS / USERS ROUTE (For Collab feature) ---
app.get('/api/friends', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });
  try {
    const friends = await usersCollection.find({
      _id: { $ne: req.user._id },
      profileCompleted: true
    }).project({ username: 1, profilePicture: 1 }).toArray();
    res.json({ success: true, friends });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching friends' });
  }
});

// --- POSTS ROUTES ---
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await postsCollection.find().sort({ createdAt: -1 }).toArray();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching posts' });
  }
});

app.post('/api/posts', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });

  const { content, mediaUrls, mediaUrl, collabWith } = req.body;

  let collabWithId = null;
  let collabWithName = '';

  if (collabWith) {
    try {
      const collabUser = await usersCollection.findOne({ _id: new ObjectId(collabWith) });
      if (collabUser) {
        collabWithId = collabUser._id;
        collabWithName = collabUser.username;
      }
    } catch (e) {
      // Invalid ObjectId or user not found, skip
    }
  }

  const formattedMediaUrls = mediaUrls && mediaUrls.length > 0 
    ? mediaUrls 
    : (mediaUrl ? [mediaUrl] : []);

  const newPost = {
    userId: req.user._id,
    userName: req.user.username,
    userProfilePic: req.user.profilePicture,
    content: content || '',
    mediaUrls: formattedMediaUrls,
    mediaUrl: formattedMediaUrls[0] || '',
    mediaType: formattedMediaUrls.length > 0 ? 'image' : '',
    collabWith: collabWithId,
    collabWithName: collabWithName,
    likes: [],
    comments: [],
    createdAt: new Date()
  };

  const result = await postsCollection.insertOne(newPost);
  const createdPost = await postsCollection.findOne({ _id: result.insertedId });
  res.json({ success: true, post: createdPost });
});

// Like / Unlike Post
app.post('/api/posts/:id/like', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });
  try {
    const postId = new ObjectId(req.params.id);
    const post = await postsCollection.findOne({ _id: postId });
    if (!post) return res.status(404).json({ success: false });

    const userIdStr = req.user._id.toString();
    let likes = post.likes || [];
    if (likes.includes(userIdStr)) {
      likes = likes.filter(id => id !== userIdStr);
    } else {
      likes.push(userIdStr);
    }

    await postsCollection.updateOne({ _id: postId }, { $set: { likes } });
    res.json({ success: true, likes });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Add Comment
app.post('/api/posts/:id/comment', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });
  try {
    const postId = new ObjectId(req.params.id);
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false });

    const comment = {
      id: new ObjectId(),
      userId: req.user._id,
      userName: req.user.username,
      userProfilePic: req.user.profilePicture,
      text,
      createdAt: new Date(),
      replies: []
    };

    await postsCollection.updateOne({ _id: postId }, { $push: { comments: comment } });
    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Add Reply to Comment
app.post('/api/posts/:postId/comment/:commentId/reply', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ success: false });
  try {
    const postId = new ObjectId(req.params.postId);
    const commentId = req.params.commentId;
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false });

    const reply = {
      id: new ObjectId(),
      userId: req.user._id,
      userName: req.user.username,
      userProfilePic: req.user.profilePicture,
      text,
      createdAt: new Date()
    };

    await postsCollection.updateOne(
      { _id: postId, "comments.id": new ObjectId(commentId) },
      { $push: { "comments.$.replies": reply } }
    );
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

async function startServer() {
  try {
    await client.connect();
    db = client.db("instaclone");
    usersCollection = db.collection("users");
    postsCollection = db.collection("posts");
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
