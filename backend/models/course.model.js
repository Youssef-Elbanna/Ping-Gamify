const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const courseSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: false,
  },
  coach: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model (the coach)
    required: true,
  },
  students: [{
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model (the student)
  }],
  skills: [{
    type: Schema.Types.ObjectId,
    ref: 'Skill',
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

const Course = mongoose.model('Course', courseSchema);

module.exports = Course; 