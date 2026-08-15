const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');

const app = express();
app.use(express.json());
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

async function startServer() {
  try {
    await client.connect();
    const db = client.db("instaclone");
    const usersCollection = db.collection("users");
    console.log("Connected to MongoDB Atlas & ready!");

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
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID || 'missing',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'missing',
        callbackURL: "https://bearsite.onrender.com/auth/google/callback"
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (!email) {
            return done(new Error("No email found in Google profile"));
          }
          
          let user = await usersCollection.findOne({ email });

          if (!user) {
            const result = await usersCollection.insertOne({
              email,
              name: profile.displayName,
              provider: 'google',
              providerId: profile.id,
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

    // --- AUTH ROUTES ---
    app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/auth/google/callback', 
      passport.authenticate('google', { failureRedirect: '/' }),
      (req, res) => {
        res.redirect('/?login=success');
      }
    );

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
