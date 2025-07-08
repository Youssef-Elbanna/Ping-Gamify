const router = require('express').Router();
const User = require('../models/user.model');
const Student = require('../models/student.model');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/authMiddleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Message = require('../models/message.model');

// Generate Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /users/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  const { name, email, password, role, group, section } = req.body;
  
  console.log('Registration data received:', { name, email, role, group, section }); // Debug log

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create a student profile first
    const studentProfile = new Student({ name, score: 0, badges: [] });
    const savedProfile = await studentProfile.save();

    // Then create the user
    const user = await User.create({
      name,
      email,
      password,
      role,
      group,
      section,
      studentProfile: savedProfile._id,
    });

    console.log('User created:', { _id: user._id, name: user.name, email: user.email, role: user.role, group: user.group, section: user.section }); // Debug log

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      group: user.group,
      section: user.section,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Registration error:', error); // Debug log
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /users/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
        enrolledCourses: user.enrolledCourses || [],
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /users/profile
// @desc    Get user profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'enrolledCourses',
      select: 'title name description'
    });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /users/profile
// @desc    Update user profile (name, email, password)
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update name and email
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
      user.email = req.body.email;
    }

    // Handle password change
    if (req.body.currentPassword && req.body.newPassword) {
      // Verify current password
      const isMatch = await user.matchPassword(req.body.currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      // Update password
      user.password = req.body.newPassword;
    }

    // Update group and section
    if (req.body.group !== undefined) user.group = req.body.group;
    if (req.body.section !== undefined) user.section = req.body.section;

    await user.save();
    
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      group: user.group,
      section: user.section,
      token: generateToken(user._id),
      enrolledCourses: user.enrolledCourses || [],
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /users/forgot-password
// @desc    Request password reset (send email)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'No user with that email' });
  // Generate token
  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 hour
  await user.save();
  // Send email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
  const resetUrl = `http://localhost:5173/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  await transporter.sendMail({
    to: email,
    subject: 'Password Reset Request',
    html: `<p>You requested a password reset. <a href="${resetUrl}">Click here to reset your password</a>. This link is valid for 1 hour.</p>`
  });
  res.json({ message: 'Password reset email sent' });
});

// @route   POST /users/reset-password
// @desc    Reset password with token
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ message: 'Missing fields' });
  const user = await User.findOne({ email, resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: 'Password has been reset' });
});

// @route   GET /users/groups
// @desc    List all unique groups and sections
router.get('/groups', async (req, res) => {
  try {
    const groups = await User.distinct('group', { group: { $ne: '' } });
    const sections = await User.distinct('section', { section: { $ne: '' } });
    res.json({ groups, sections });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /users/join-group
// @desc    Coach joins a group/section
// @access  Private (Coach)
router.post('/join-group', protect, async (req, res) => {
  const { group, section } = req.body;
  if (!group || !section) return res.status(400).json({ message: 'Group and section are required' });
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'coach') return res.status(403).json({ message: 'Only coaches can join groups' });
    user.group = group;
    user.section = section;
    await user.save();
    res.json({ message: 'Joined group/section', group: user.group, section: user.section });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /messages/send
// @desc    Coach sends a message to a group/section
// @access  Private (Coach)
router.post('/messages/send', protect, async (req, res) => {
  const { group, section, content } = req.body;
  if (!group || !section || !content) return res.status(400).json({ message: 'All fields required' });
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'coach') return res.status(403).json({ message: 'Only coaches can send messages' });
    const message = await Message.create({
      sender: user._id,
      group,
      section,
      content,
    });
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /messages/group-section
// @desc    Get all messages for a group/section
// @access  Private
router.get('/messages/group-section', protect, async (req, res) => {
  const { group, section } = req.query;
  if (!group || !section) return res.status(400).json({ message: 'Group and section required' });
  try {
    const messages = await Message.find({ group, section }).populate('sender', 'name email');
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;