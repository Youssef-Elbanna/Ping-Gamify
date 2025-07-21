const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { protect, coach } = require('../middleware/authMiddleware');
const Skill = require('../models/skill.model');
const Task = require('../models/task.model');
const Course = require('../models/course.model');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow video and PDF files
    if (file.mimetype.startsWith('video/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only video and PDF files are allowed'), false);
    }
  }
});

// @route   GET /skills
// @desc    Get all skills (can be filtered by course)
router.get('/', (req, res) => {
  const { courseId } = req.query;
  const filter = courseId ? { course: courseId } : {};
  Skill.find(filter)
    .then(skills => res.json(skills))
    .catch(err => res.status(400).json('Error: ' + err));
});

// @route   POST /skills/add
// @desc    Add a new skill to a course
router.post('/add', protect, coach, async (req, res) => {
  console.log('Request body:', req.body); // Debug log
  
  const { title, description, courseId } = req.body;

  if (!title || !description || !courseId) {
    return res.status(400).json({ 
      message: 'Missing required fields: title, description, courseId',
      received: { title, description, courseId }
    });
  }

  try {
    // 1. Find the course to ensure it exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // 2. Check if the logged-in user is the coach of the course
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const newSkill = new Skill({
      title,
      description,
      course: courseId,
    });

    const savedSkill = await newSkill.save();

    // Also add the skill to the course's skills array
    course.skills.push(savedSkill._id);
    await course.save();

    res.json(savedSkill);
  } catch (err) {
    console.error('Error creating skill:', err);
    res.status(400).json('Error: ' + err.message);
  }
});

// @route   DELETE /api/skills/:skillId
// @desc    Delete a skill
// @access  Private (Coach)
router.delete('/:skillId', protect, coach, async (req, res) => {
  const { skillId } = req.params;

  try {
    const skill = await Skill.findById(skillId);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    const course = await Course.findById(skill.course);
    if (!course || course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Remove tasks associated with the skill
    await Task.deleteMany({ skill: skillId });

    // Remove skill from course's skills array
    await Course.updateOne({ _id: skill.course }, { $pull: { skills: skillId } });

    // Delete the skill
    await skill.deleteOne();

    res.json({ message: 'Skill and associated tasks deleted successfully' });
  } catch (err) {
    console.error('Error deleting skill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /skills/:skillId/tasks
// @desc    Add a new task to a skill
router.post('/:skillId/tasks', protect, coach, upload.array('taskContent', 10), async (req, res) => {
  const { title, deadline } = req.body;
  const { skillId } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'At least one task content file is required.' });
  }

  if (!title) {
    return res.status(400).json({ message: 'Task title is required.' });
  }

  try {
    const skill = await Skill.findById(skillId);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    // Check if the user is the coach of the course this skill belongs to
    const course = await Course.findById(skill.course);
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // Determine task type based on the first file (assuming all files are same type)
    const firstFile = req.files[0];
    const taskType = firstFile.mimetype.startsWith('video/') ? 'video' : 
                    (firstFile.mimetype === 'application/pdf' ? 'pdf' : 'text');

    // Extract file paths from all uploaded files
    const contentUrls = req.files.map(file => 'uploads/' + file.filename);

    const newTask = new Task({
      title,
      type: taskType,
      contentUrls: contentUrls,
      skill: skillId,
      deadline: deadline ? new Date(deadline) : undefined,
    });

    const savedTask = await newTask.save();

    // Add task to skill's tasks array
    skill.tasks.push(savedTask._id);
    await skill.save();

    res.status(201).json(savedTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(400).json('Error: ' + err.message);
  }
});

// @route   PUT /skills/tasks/:taskId
// @desc    Update a task
// @access  Private (Coach)
router.put('/tasks/:taskId', protect, coach, async (req, res) => {
  const { taskId } = req.params;
  const { title, deadline } = req.body;

  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const skill = await Skill.findById(task.skill);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    const course = await Course.findById(skill.course);
    if (!course || course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // Update task fields
    if (title) task.title = title;
    if (deadline !== undefined) task.deadline = deadline ? new Date(deadline) : undefined;

    const updatedTask = await task.save();
    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/skills/tasks/:taskId
// @desc    Delete a task
// @access  Private (Coach)
router.delete('/tasks/:taskId', protect, coach, async (req, res) => {
  const { taskId } = req.params;

  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const skill = await Skill.findById(task.skill);
    if (!skill) {
      // If the skill doesn't exist, the task is orphaned, so just delete it
      await task.deleteOne();
      if (task.contentUrls && task.contentUrls.length > 0) {
        task.contentUrls.forEach(url => {
          if (fs.existsSync(url)) {
            fs.unlinkSync(url);
          }
        });
      }
      return res.json({ message: 'Task deleted (skill not found)' });
    }

    const course = await Course.findById(skill.course);
    if (!course || course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Remove task from skill's tasks array
    await Skill.updateOne({ _id: task.skill }, { $pull: { tasks: taskId } });
    
    // Delete the task files from uploads folder if they exist
    if (task.contentUrls && task.contentUrls.length > 0) {
      task.contentUrls.forEach(url => {
        if (fs.existsSync(url)) {
          fs.unlinkSync(url);
        }
      });
    }
    
    // Delete the task
    await task.deleteOne();

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /skills/:skillId
// @desc    Update a skill
// @access  Private (Coach)
router.put('/:skillId', protect, coach, async (req, res) => {
  const { skillId } = req.params;
  const { title, description } = req.body;

  try {
    const skill = await Skill.findById(skillId);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    const course = await Course.findById(skill.course);
    if (!course || course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // Update skill fields
    if (title) skill.title = title;
    if (description) skill.description = description;

    const updatedSkill = await skill.save();
    res.json(updatedSkill);
  } catch (err) {
    console.error('Error updating skill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /tasks/titles?ids=taskId1,taskId2,...
// Returns { taskId: title, ... }
router.get('/tasks/titles', async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return res.status(400).json({ message: 'No task IDs provided' });
  try {
    const tasks = await Task.find({ _id: { $in: ids } });
    const result = {};
    tasks.forEach(task => {
      result[task._id] = task.title;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 