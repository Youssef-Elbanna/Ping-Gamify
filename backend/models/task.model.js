const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['video', 'pdf', 'text'], // Defines the kind of task
  },
  contentUrls: [{ // Array of URLs for multiple video or PDF content files
    type: String,
    required: true,
  }],
  skill: {
    type: Schema.Types.ObjectId,
    ref: 'Skill',
    required: true,
  },
  deadline: {
    type: Date,
    required: false,
  },
}, {
  timestamps: true,
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task; 