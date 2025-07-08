const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const studentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  score: { type: Number, default: 0 },
  badges: [{ type: Schema.Types.ObjectId, ref: 'Badge' }],
}, {
  timestamps: true,
});

const Student = mongoose.model('Student', studentSchema);

module.exports = Student; 