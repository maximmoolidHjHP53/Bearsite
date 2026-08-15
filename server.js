const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');

const app = express();

// Increase JSON and urlencoded payload limits to handle base64 image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Required for Passport sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("FATAL ERROR: MONGO_URI environment variable is missing!");
  process.exit(1);
}

const client = new MongoClient(uri);
let db, usersCollection;

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
            profileCompleted: false, // Tracks if creation.html was completed
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
} else {
  console.warn("WARNING: Google Client ID or Secret is missing in environment variables.");
}

// --- AUTH & PROFILE ROUTES ---

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // If the user already finished profile creation, go to home/feed. Otherwise, go to creation page.
    if (req.user && req.user.profileCompleted) {
      res.redirect('/home.html');
    } else {
      res.redirect('/creation.html');
    }
  }
);

// --- COMPLETE PROFILE & AGE VERIFICATION ROUTE ---
app.post('/api/complete-profile', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { username, birthday, profilePicture } = req.body;

  if (!username || !birthday || !profilePicture) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Calculate age from birthday
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  // Check if under 18 -> Delete user account and log out
  if (age < 18) {
    await usersCollection.deleteOne({ _id: req.user._id });
    req.logout((err) => {
      res.json({ 
        success: false, 
        underAge: true, 
        message: "You cannot access on this apps or web" 
      });
    });
    return;
  }

  // If 18 or older, save profile details to MongoDB
  await usersCollection.updateOne(
    { _id: req.user._id },
    { 
      $set: { 
        username, 
        birthday, 
        profilePicture, 
        profileCompleted: true,
        updatedAt: new Date()
      } 
    }
  );

  res.json({ success: true });
});

app.get('/api/current-user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: req.user });
  } else {
    res.json({ success: false });
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
