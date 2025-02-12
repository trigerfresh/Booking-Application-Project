const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const imageDownloader = require('image-downloader');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cookieParser());
app.use(express.json());

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'dummykey';

app.use(
  cors({
    credentials: true,
    origin: 'http://localhost:5173', // Adjust for your frontend URL
  })
);

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log('Connected to mongoDB'))
  .catch((err) => {
    console.log('Error is ', err);
  });

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Serve static files (images) from the uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/test', (req, res) => {
  res.json('Text Ok');
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (error) {
    res.status(422).json(error);
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });

  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        { email: userDoc.email, id: userDoc._id },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie('token', token).json(userDoc);
        }
      );
    } else {
      res.status(422).json('Password wrong');
    }
  } else {
    res.status(422).json('User not found');
  }
});

app.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0) }).json(true); // Corrected logout route
});

app.post('/upload-by-link', async (req, res) => {
  const { link } = req.body;
  console.log('Received link:', link);

  // A more general URL regex for validating the image link
  const validImageUrlRegex =
    /^(https?:\/\/)([a-zA-Z0-9.-]+)(\/[a-zA-Z0-9/-]*)+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?[^ ]*)?$/i;

  // Check if the URL matches the pattern
  if (!link || typeof link !== 'string' || !validImageUrlRegex.test(link)) {
    console.log('Invalid or missing image link:', link);
    return res.status(400).json({ error: 'Invalid or missing image link' });
  }

  // Clean up the URL by removing query parameters (if any)
  const cleanUrl = link.split('?')[0];
  console.log('Cleaned URL:', cleanUrl);

  try {
    // Check if the URL is accessible using axios (HEAD request)
    const response = await axios.head(cleanUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    if (response.status !== 200) {
      console.log('Failed to access the URL. Status code:', response.status);
      return res.status(400).json({ error: 'Failed to access the image URL' });
    }

    // Download the image using image-downloader
    const newName = Date.now() + '.jpg';
    await imageDownloader.image({
      url: cleanUrl,
      dest: path.join(__dirname, 'uploads', newName),
    });

    console.log('Image downloaded successfully');
    res.json({ imageUrl: 'uploads/' + newName }); // Return relative path
  } catch (error) {
    console.error('Error during URL check or image download:', error.message);
    res.status(500).json({ error: 'Failed to download image' });
  }
});

// Fetch image details (list of images)
app.get('/images', (req, res) => {
  const imagesFolderPath = path.join(__dirname, 'uploads');
  
  fs.readdir(imagesFolderPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch images' });
    }
    
    // Filter for image files (if needed, adjust based on your criteria)
    const images = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file)
    );
    const limitedImages = images.slice(0, 3);

    // Return the list of image filenames
    res.json(limitedImages);
  });
});

// app.get('/images', async (req, res) => {
//   try {
//     const images = await getImagesFromDatabase(); // Fetch all images from the database or storage
//     const limitedImages = images.slice(0, 4); // Limit to first 4 images
//     res.json(limitedImages); // Send only 4 images to the frontend
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to fetch images' });
//   }
// });

app.listen(4000, () => console.log(`Running @ 4000`));
