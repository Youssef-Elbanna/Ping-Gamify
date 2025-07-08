const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const studentsRouter = require('./routes/students');
const skillsRouter = require('./routes/skills');
const usersRouter = require('./routes/users');
const coursesRouter = require('./routes/courses');
const progressRouter = require('./routes/progress');
const groupsRouter = require('./routes/groups');

app.use('/students', studentsRouter);
app.use('/skills', skillsRouter);
app.use('/users', usersRouter);
app.use('/courses', coursesRouter);
app.use('/progress', progressRouter);
app.use('/groups', groupsRouter);

const uri = process.env.ATLAS_URI;
if (!uri) {
  console.error('ATLAS_URI is not set in your .env file!');
  process.exit(1);
}
const safeUri = uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1<hidden>$3');
console.log('Connecting to MongoDB with URI:', safeUri);

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB database connection established successfully');
    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }); 