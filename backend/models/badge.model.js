const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const badgeSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, required: true }, // URL or icon name
  criteria: { type: String, required: true }, // e.g., 'Complete 5 tasks'
  type: { type: String, default: 'general' }, // e.g., 'completion', 'streak', etc.
}, {
  timestamps: true,
});

const Badge = mongoose.model('Badge', badgeSchema);

module.exports = Badge; 