const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const skillSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  course: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Course',
  },
  tasks: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }],
}, {
  timestamps: true,
});

const Skill = mongoose.model('Skill', skillSchema);

module.exports = Skill; 