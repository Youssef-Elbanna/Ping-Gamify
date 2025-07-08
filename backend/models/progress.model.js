const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskProgressSchema = new Schema({
  task: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  coachRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  coachFeedback: {
    type: String,
    default: '',
  },
  coachRatedAt: {
    type: Date,
  },
  submittedForReview: {
    type: Boolean,
    default: false,
  },
  submittedAt: {
    type: Date,
  },
  studentUploads: [{
    url: { type: String, required: true },
    originalName: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  reviewed: {
    type: Boolean,
    default: false,
  },
  approved: {
    type: Boolean,
    default: null,
  },
  reviewedAt: {
    type: Date,
  },
  reviewFeedback: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

const progressSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  completedTasks: [{
    type: Schema.Types.ObjectId,
    ref: 'Task',
  }],
  taskProgress: [taskProgressSchema],
  totalTasks: {
    type: Number,
    default: 0,
  },
  completedTasksCount: {
    type: Number,
    default: 0,
  },
  averageRating: {
    type: Number,
    default: 0,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Ensure a student can only have one progress entry per course
progressSchema.index({ user: 1, course: 1 }, { unique: true });

// Method to calculate completion percentage
progressSchema.methods.getCompletionPercentage = function() {
  if (this.totalTasks === 0) return 0;
  return Math.round((this.completedTasksCount / this.totalTasks) * 100);
};

// Method to calculate average rating
progressSchema.methods.getAverageRating = function() {
  const ratedTasks = this.taskProgress.filter(tp => tp.coachRating !== null);
  if (ratedTasks.length === 0) return 0;
  
  const totalRating = ratedTasks.reduce((sum, tp) => sum + tp.coachRating, 0);
  return Math.round((totalRating / ratedTasks.length) * 10) / 10; // Round to 1 decimal place
};

const Progress = mongoose.model('Progress', progressSchema);

module.exports = Progress; 