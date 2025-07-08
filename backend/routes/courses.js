const router = require('express').Router();
const Course = require('../models/course.model');
const { protect, coach } = require('../middleware/authMiddleware');
const User = require('../models/user.model');
const Skill = require('../models/skill.model');
const Task = require('../models/task.model');
const Progress = require('../models/progress.model');
const Student = require('../models/student.model');

// @route   GET /api/courses
// @desc    Get all courses for the logged-in STUDENT
// @access  Private (Student)
router.get('/', protect, async (req, res) => {
  try {
    // Find the user and populate their enrolled courses with skills and tasks
    const user = await User.findById(req.user._id).populate({
      path: 'enrolledCourses',
      populate: {
        path: 'skills',
        populate: {
          path: 'tasks',
          model: 'Task'
        }
      }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.enrolledCourses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/courses/all
// @desc    Get all courses (for browsing)
// @access  Public
router.get('/all', async (req, res) => {
  try {
    const courses = await Course.find({}).populate('coach', 'name');
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/courses/my-courses
// @desc    Get all courses for the logged in COACH
// @access  Private (Coach)
router.get('/my-courses', protect, coach, async (req, res) => {
  try {
    const courses = await Course.find({ coach: req.user._id })
      .populate({
        path: 'skills',
        populate: {
          path: 'tasks',
          model: 'Task'
        }
      })
      .populate({
        path: 'students',
        select: 'role'
      });
    // Add studentCount property (excluding coaches)
    const coursesWithStudentCount = courses.map(course => {
      const studentCount = (course.students || []).filter(student => student.role !== 'coach').length;
      return {
        ...course.toObject(),
        studentCount
      };
    });
    res.json(coursesWithStudentCount);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /courses
// @desc    Create a new course
// @access  Private (Coach)
router.post('/', protect, coach, async (req, res) => {
  const { name, description } = req.body;

  try {
    const course = new Course({
      name,
      description,
      coach: req.user._id,
    });

    const createdCourse = await course.save();
    res.status(201).json(createdCourse);
  } catch (error) {
    console.error('Course creation error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /courses/:id
// @desc    Update a course
// @access  Private (Coach - owner only)
router.put('/:id', protect, coach, async (req, res) => {
  const { name, description } = req.body;

  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if the logged-in user is the coach of this course
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to update this course' });
    }

    course.name = name || course.name;
    course.description = description || course.description;

    const updatedCourse = await course.save();
    res.json(updatedCourse);
  } catch (error) {
    console.error('Course update error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /courses/:id
// @desc    Delete a course
// @access  Private (Coach - owner only)
router.delete('/:id', protect, coach, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if the logged-in user is the coach of this course
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this course' });
    }

    // Remove course from all enrolled students
    await User.updateMany(
      { enrolledCourses: course._id },
      { $pull: { enrolledCourses: course._id } }
    );

    // Delete associated skills and their tasks
    const skills = await Skill.find({ course: course._id });
    for (const skill of skills) {
      // Delete tasks associated with this skill
      await Task.deleteMany({ skill: skill._id });
    }
    await Skill.deleteMany({ course: course._id });

    // Delete progress records for this course
    await Progress.deleteMany({ course: course._id });

    // Delete the course
    await Course.findByIdAndDelete(req.params.id);

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Course deletion error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /courses/:id/enroll
// @desc    Enroll the logged in student in a course
router.post('/:id/enroll', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    const user = await User.findById(req.user._id);

    if (!course || !user) {
      return res.status(404).json({ message: 'Course or User not found' });
    }

    // Prevent coach from enrolling as a student in their own course
    if (course.coach.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'Coach cannot enroll as a student in their own course' });
    }

    // Check if user is already enrolled
    if (user.enrolledCourses.includes(course._id)) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    // Add student to course's student list
    if (!course.students.includes(user._id)) {
      course.students.push(user._id);
      await course.save();
    }

    // Add course to student's enrolled list
    user.enrolledCourses.push(course._id);
    await user.save();

    res.json({ message: 'Enrolled successfully' });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /courses/:id/unenroll
// @desc    Unenroll the logged in student from a course
router.post('/:id/unenroll', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    const user = await User.findById(req.user._id);

    if (!course || !user) {
      return res.status(404).json({ message: 'Course or User not found' });
    }

    // Remove student from course's student list
    course.students = course.students.filter(studentId => studentId.toString() !== user._id.toString());
    await course.save();

    // Remove course from student's enrolled list
    user.enrolledCourses = user.enrolledCourses.filter(courseId => courseId.toString() !== course._id.toString());
    await user.save();

    res.json({ message: 'Unenrolled successfully' });
  } catch (error) {
    console.error('Unenrollment error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /courses/:id/skills-with-tasks
// @desc    Get a course's skills with populated tasks
// @access  Private
router.get('/:id/skills-with-tasks', protect, async (req, res) => {
  try {
    const skills = await Skill.find({ course: req.params.id }).populate('tasks');
    if (!skills) {
      return res.status(404).json({ message: 'No skills found for this course' });
    }
    res.json(skills);
  } catch (err) {
    console.error('Error fetching skills with tasks:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /courses/:id
// @desc    Get single course with its skills and tasks
router.get('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate({
      path: 'skills',
      populate: {
        path: 'tasks',
        model: 'Task'
      }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is enrolled in this course (for students) or is the coach
    const user = await User.findById(req.user._id);
    const isEnrolled = user.enrolledCourses.includes(course._id);
    const isCoach = course.coach.toString() === req.user._id.toString();
    
    if (!isEnrolled && !isCoach) {
      return res.status(403).json({ message: 'You must be enrolled in this course to view it' });
    }
    
    res.json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /courses/:id/dashboard
// @desc    Get comprehensive course dashboard data for coaches
router.get('/:id/dashboard', protect, coach, async (req, res) => {
  try {
    console.log('Dashboard request for course:', req.params.id);
    console.log('User ID:', req.user._id);
    
    const course = await Course.findById(req.params.id).populate('students', 'email name role');
    if (!course) {
      console.log('Course not found');
      return res.status(404).json({ message: 'Course not found' });
    }
    
    console.log('Course found:', course.name);
    console.log('Course coach:', course.coach);
    console.log('User ID:', req.user._id);
    
    // Check if the logged-in user is the coach of this course
    if (course.coach.toString() !== req.user._id.toString()) {
      console.log('Authorization failed - user is not the coach');
      return res.status(401).json({ message: 'Not authorized' });
    }

    console.log('Authorization successful');

    // Get skills for this course
    const skills = await Skill.find({ course: req.params.id }).populate('tasks');
    console.log('Skills found:', skills.length);
    
    // Get progress for all students in this course
    const studentProgress = await Progress.find({ course: req.params.id })
      .populate('user', 'email name')
      .populate({
        path: 'taskProgress.task',
        populate: {
          path: 'skill',
          select: 'name'
        }
      });
    console.log('Student progress found:', studentProgress.length);

    // Calculate statistics
    const totalTasks = skills.reduce((sum, skill) => sum + (skill.tasks ? skill.tasks.length : 0), 0);
    const totalStudents = course.students ? course.students.length : 0;
    
    console.log('Total tasks:', totalTasks);
    console.log('Total students:', totalStudents);
    
    // Filter out coaches from the students list
    const filteredStudents = (course.students || []).filter(student => student.role !== 'coach');
    const totalStudentsFiltered = filteredStudents.length;

    // Enhanced student data with progress details
    const studentsWithProgress = await Promise.all(filteredStudents.map(async student => {
      const progress = studentProgress.find(p => p.user && p.user._id.toString() === student._id.toString());
      let completedTasksCount = 0;
      let totalTasksForStudent = totalTasks;
      if (progress) {
        // Recalculate completedTasksCount and totalTasks for this student
        completedTasksCount = progress.completedTasks ? progress.completedTasks.length : 0;
        // Find all skills for the course and count all tasks
        const skillsForCourse = await Skill.find({ course: req.params.id }).populate('tasks');
        const allTasks = skillsForCourse.flatMap(skill => skill.tasks.map(task => task._id));
        totalTasksForStudent = allTasks.length;
      }
      if (!progress) {
        return {
          ...student.toObject(),
          progress: {
            completedTasks: 0,
            totalTasks: totalTasks,
            completionPercentage: 0,
            averageRating: 0,
            lastActivity: null,
            pendingReviews: 0,
            taskProgress: []
          }
        };
      }
      // Safely calculate pending reviews
      const pendingReviews = progress.taskProgress ? 
        progress.taskProgress.filter(tp => tp.submittedForReview && !tp.coachRating).length : 0;
      return {
        ...student.toObject(),
        progress: {
          completedTasks: completedTasksCount,
          totalTasks: totalTasksForStudent,
          completionPercentage: totalTasksForStudent > 0 ? Math.round((completedTasksCount / totalTasksForStudent) * 100) : 0,
          averageRating: progress.getAverageRating ? progress.getAverageRating() : 0,
          lastActivity: progress.lastActivity || null,
          pendingReviews: pendingReviews,
          taskProgress: progress.taskProgress || []
        }
      };
    }));

    // Course statistics
    const courseStats = {
      totalStudents: totalStudentsFiltered,
      totalTasks,
      averageCompletion: totalStudentsFiltered > 0 ? 
        Math.round(studentsWithProgress.reduce((sum, s) => sum + (s.progress.completionPercentage || 0), 0) / totalStudentsFiltered) : 0,
      averageRating: totalStudentsFiltered > 0 ? 
        Math.round(studentsWithProgress.reduce((sum, s) => sum + (s.progress.averageRating || 0), 0) / totalStudentsFiltered * 10) / 10 : 0,
      pendingReviews: studentsWithProgress.reduce((sum, s) => sum + (s.progress.pendingReviews || 0), 0)
    };
    
    console.log('Dashboard response prepared successfully');
    res.json({ 
      course, 
      students: studentsWithProgress,
      skills: skills,
      stats: courseStats
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @route   POST /courses/:id/rate-task
// @desc    Rate a student's task completion
// @access  Private (Coach - owner only)
router.post('/:id/rate-task', protect, coach, async (req, res) => {
  try {
    const { studentId, taskId, rating, feedback } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if the logged-in user is the coach of this course
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to rate tasks in this course' });
    }

    // Find the student's progress
    const progress = await Progress.findOne({ 
      course: req.params.id, 
      user: studentId 
    });

    if (!progress) {
      return res.status(404).json({ message: 'Student progress not found' });
    }

    // Find the task progress entry
    const taskProgressIndex = progress.taskProgress.findIndex(
      tp => tp.task.toString() === taskId
    );

    if (taskProgressIndex === -1) {
      return res.status(404).json({ message: 'Task progress not found' });
    }

    // Update the task progress with rating
    progress.taskProgress[taskProgressIndex].coachRating = rating;
    progress.taskProgress[taskProgressIndex].coachFeedback = feedback || '';
    progress.taskProgress[taskProgressIndex].coachRatedAt = new Date();
    progress.taskProgress[taskProgressIndex].submittedForReview = false;

    // Recalculate average rating
    progress.averageRating = progress.getAverageRating();

    await progress.save();

    res.json({ 
      message: 'Task rated successfully',
      taskProgress: progress.taskProgress[taskProgressIndex]
    });
  } catch (error) {
    console.error('Task rating error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /courses/:id/student/:studentId/progress
// @desc    Get detailed progress for a specific student
// @access  Private (Coach - owner only)
router.get('/:id/student/:studentId/progress', protect, coach, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if the logged-in user is the coach of this course
    if (course.coach.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const progress = await Progress.findOne({ 
      course: req.params.id, 
      user: req.params.studentId 
    }).populate('user', 'email name')
    .populate({
      path: 'taskProgress.task',
      populate: {
        path: 'skill',
        select: 'name'
      }
    });

    if (!progress) {
      return res.status(404).json({ message: 'Student progress not found' });
    }

    // Get skills for this course
    const skills = await Skill.find({ course: req.params.id }).populate('tasks');

    res.json({
      student: progress.user,
      progress: {
        completedTasks: progress.completedTasksCount,
        totalTasks: progress.totalTasks,
        completionPercentage: progress.getCompletionPercentage(),
        averageRating: progress.getAverageRating(),
        lastActivity: progress.lastActivity,
        taskProgress: progress.taskProgress
      },
      skills: skills
    });
  } catch (error) {
    console.error('Student progress error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router; 