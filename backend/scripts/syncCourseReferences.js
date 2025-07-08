const mongoose = require('mongoose');
const Course = require('../models/course.model');
const Skill = require('../models/skill.model');
const Task = require('../models/task.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ping_gamify';

async function syncReferences() {
  await mongoose.connect(MONGO_URI);
  const courses = await Course.find();
  for (const course of courses) {
    // Sync skills
    const skills = await Skill.find({ course: course._id });
    course.skills = skills.map(skill => skill._id);
    await course.save();
    console.log(`Course '${course.name}': set skills to [${course.skills.join(', ')}]`);
    for (const skill of skills) {
      // Sync tasks
      const tasks = await Task.find({ skill: skill._id });
      skill.tasks = tasks.map(task => task._id);
      await skill.save();
      console.log(`  Skill '${skill.title}': set tasks to [${skill.tasks.join(', ')}]`);
    }
  }
  await mongoose.disconnect();
  console.log('Sync complete.');
}

syncReferences().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
}); 