const router = require('express').Router();
const Progress = require('../models/progress.model');
const { protect } = require('../middleware/authMiddleware');
const Student = require('../models/student.model');
const Badge = require('../models/badge.model');
const Skill = require('../models/skill.model');
const Task = require('../models/task.model');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Course = require('../models/course.model');
const User = require('../models/user.model');
const { coach } = require('../middleware/authMiddleware');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max per file
});

// @route   POST /progress/complete-task
// @desc    Mark a task as completed for a user
router.post('/complete-task', protect, async (req, res) => {
  const { taskId, courseId } = req.body;
  const userId = req.user._id;

  try {
    // Find the progress document for the user and course, or create if it doesn't exist
    let progress = await Progress.findOne({
      user: userId,
      course: courseId,
    });

    if (!progress) {
      progress = new Progress({
        user: userId,
        course: courseId,
        completedTasks: [],
      });
    }

    // Add the task to the completedTasks array if it's not already there
    if (!progress.completedTasks.includes(taskId)) {
      progress.completedTasks.push(taskId);
    }

    // Recalculate completedTasksCount and totalTasks
    progress.completedTasksCount = progress.completedTasks.length;
    // Find all skills for the course and count all tasks
    const skills = await Skill.find({ course: courseId }).populate('tasks');
    const allTasks = skills.flatMap(skill => skill.tasks.map(task => task._id));
    progress.totalTasks = allTasks.length;

    const savedProgress = await progress.save();
    console.log('Progress after marking complete:', savedProgress);

    // --- Badge awarding logic ---
    // Find the student profile
    const student = await Student.findOne({ name: req.user.name });
    let newBadges = [];
    if (student) {
      // Example: Award a badge for completing 5 tasks
      const completedCount = await Progress.aggregate([
        { $match: { user: userId } },
        { $unwind: '$completedTasks' },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]);
      const totalCompleted = completedCount[0]?.count || 0;
      // Find the badge for 'Complete 5 Tasks'
      const badge = await Badge.findOne({ criteria: 'Complete 5 tasks' });
      if (badge && totalCompleted >= 5 && !student.badges.includes(badge._id)) {
        student.badges.push(badge._id);
        await student.save();
        newBadges.push(badge);
      }
    }
    // --- End badge logic ---

    res.status(201).json({ progress: savedProgress, newBadges });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /progress/:courseId
// @desc    Get user's progress for a specific course
router.get('/:courseId', protect, async (req, res) => {
  try {
    let progress = await Progress.findOne({
      user: req.user._id,
      course: req.params.courseId,
    }).populate('completedTasks');
    // Always recalculate completedTasksCount and totalTasks
    if (progress) {
      progress.completedTasksCount = progress.completedTasks.length;
      const skills = await Skill.find({ course: req.params.courseId }).populate('tasks');
      const allTasks = skills.flatMap(skill => skill.tasks.map(task => task._id));
      progress.totalTasks = allTasks.length;
      await progress.save();
    }
    console.log('Progress fetched for user:', req.user._id, 'course:', req.params.courseId, progress);
    if (!progress) {
      // If no progress, return an empty array of completed tasks
      return res.json({ completedTasks: [], completedTasksCount: 0, totalTasks: 0 });
    }
    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /progress/submit-task
// @desc    Student uploads files for a task
// @access  Private (Student)
router.post('/submit-task', protect, upload.array('studentFiles', 10), async (req, res) => {
  const { taskId, courseId } = req.body;
  const userId = req.user._id;
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'At least one file is required.' });
  }
  try {
    let progress = await Progress.findOne({ user: userId, course: courseId });
    if (!progress) {
      progress = new Progress({ user: userId, course: courseId, completedTasks: [] });
    }
    // Find or create the taskProgress entry
    let tp = progress.taskProgress.find(tp => tp.task.toString() === taskId);
    if (!tp) {
      tp = { task: taskId, studentUploads: [] };
      progress.taskProgress.push(tp);
    }
    // Add uploaded files
    req.files.forEach(file => {
      tp.studentUploads = tp.studentUploads || [];
      tp.studentUploads.push({
        url: 'uploads/' + file.filename,
        originalName: file.originalname,
        uploadedAt: new Date()
      });
    });
    tp.submittedForReview = true;
    tp.submittedAt = new Date();
    await progress.save();
    res.status(201).json({ message: 'Files uploaded and submitted for review.', progress });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /progress/submissions/:courseId
// @desc    Coach views all student submissions for a course
// @access  Private (Coach)
router.get('/submissions/:courseId', protect, async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user._id;
  try {
    const course = await Course.findById(courseId);
    if (!course || course.coach.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // Get all progress docs for this course
    const progresses = await Progress.find({ course: courseId })
      .populate('user', 'name email')
      .populate('taskProgress.task', 'title');
    res.json(progresses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PATCH /progress/:courseId/mark-seen
// @desc    Mark all reviewed taskProgress as seen by student
// @access  Private (Student)
router.patch('/:courseId/mark-seen', protect, async (req, res) => {
  const { courseId } = req.params;
  try {
    const progress = await Progress.findOne({ user: req.user._id, course: courseId });
    if (!progress) return res.status(404).json({ message: 'Progress not found' });
    let updated = false;
    progress.taskProgress.forEach(tp => {
      if (tp.reviewed && !tp.seenByStudent) {
        tp.seenByStudent = true;
        updated = true;
      }
    });
    if (updated) await progress.save();
    res.json({ message: 'Marked as seen' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /progress/:courseId/student/:studentId
// @desc    Coach views a specific student's progress (tasks) for a course
// @access  Private (Coach)
router.get('/:courseId/student/:studentId', protect, coach, async (req, res) => {
  const { courseId, studentId } = req.params;
  try {
    // Get all skills and tasks for the course
    const skills = await Skill.find({ course: courseId }).populate('tasks');
    const allTasks = skills.flatMap(skill => skill.tasks.map(task => ({
      ...task.toObject(),
      skill: { _id: skill._id, title: skill.title }
    })));

    // Get the student's progress for this course
    const progress = await Progress.findOne({ user: studentId, course: courseId })
      .populate('taskProgress.task', 'title');
    const taskProgressMap = {};
    if (progress && Array.isArray(progress.taskProgress)) {
      progress.taskProgress.forEach(tp => {
        if (tp.task && tp.task._id) taskProgressMap[tp.task._id.toString()] = tp;
      });
    }
    // Build array of { task, progress } for all course tasks
    const tasksWithProgress = allTasks.map(task => ({
      task,
      progress: taskProgressMap[task._id.toString()] || null
    }));
    res.json({
      tasks: tasksWithProgress,
      completedTasks: progress ? progress.completedTasks : [],
      completedTasksCount: progress ? progress.completedTasksCount : 0,
      totalTasks: allTasks.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router; 