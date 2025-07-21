const mongoose = require('mongoose');
const Progress = require('../models/progress.model');
const Task = require('../models/task.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ping_gamify';

async function syncCompletedTasksToTaskProgress() {
  await mongoose.connect(MONGO_URI);
  const progresses = await Progress.find();
  let updatedCount = 0;
  for (const progress of progresses) {
    let changed = false;
    for (const taskId of progress.completedTasks) {
      // Check if taskProgress already has an entry for this task
      let tp = progress.taskProgress.find(tp => tp.task.toString() === taskId.toString());
      if (!tp) {
        // Optionally, fetch the task to get more info if needed
        tp = {
          task: taskId,
          completed: true,
          completedAt: new Date(),
          studentUploads: [],
        };
        progress.taskProgress.push(tp);
        changed = true;
        console.log(`Added taskProgress for progress ${progress._id}, task ${taskId}`);
      } else if (!tp.completed) {
        tp.completed = true;
        tp.completedAt = new Date();
        changed = true;
        console.log(`Marked existing taskProgress as completed for progress ${progress._id}, task ${taskId}`);
      }
    }
    if (changed) {
      await progress.save();
      updatedCount++;
    }
  }
  await mongoose.disconnect();
  console.log(`Sync complete. Updated ${updatedCount} progress documents.`);
}

syncCompletedTasksToTaskProgress().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
}); 