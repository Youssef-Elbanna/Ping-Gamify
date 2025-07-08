const router = require('express').Router();
let Student = require('../models/student.model');
const Badge = require('../models/badge.model');

router.route('/').get((req, res) => {
  Student.find()
    .then(students => res.json(students))
    .catch(err => res.status(400).json('Error: ' + err));
});

router.route('/add').post((req, res) => {
  const name = req.body.name;
  const score = Number(req.body.score);
  const badges = req.body.badges;

  const newStudent = new Student({
    name,
    score,
    badges,
  });

  newStudent.save()
    .then(() => res.json('Student added!'))
    .catch(err => res.status(400).json('Error: ' + err));
});

router.route('/seed').get((req, res) => {
  const sampleStudents = [
    { name: 'Amal Ghanem', score: 1257, badges: ['Top Performer'] },
    { name: 'Ahmed Al Rayyan', score: 529, badges: [] },
    { name: 'Adrien C', score: 525, badges: [] },
    { name: 'John Doe', score: 800, badges: ['Fast Learner'] },
    { name: 'Jane Smith', score: 1100, badges: ['Top Performer', 'Consistent'] },
  ];

  Student.insertMany(sampleStudents)
    .then(() => res.json('Sample students added!'))
    .catch(err => res.status(400).json('Error: ' + err));
});

// Get a student's earned badges
router.get('/:id/badges', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('badges');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.badges);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all possible badges
router.get('/badges/all', async (req, res) => {
  try {
    const badges = await Badge.find();
    res.json(badges);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 