const router = require('express').Router();
const Group = require('../models/group.model');
const User = require('../models/user.model');
const { protect } = require('../middleware/authMiddleware');

// Create a new group
router.post('/create', protect, async (req, res) => {
  const { name } = req.body;
  try {
    const group = new Group({
      name,
      creator: req.user._id,
      members: [req.user._id],
    });
    await group.save();
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Invite a user to group
router.post('/:groupId/invite', protect, async (req, res) => {
  const { userId } = req.body;
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (!group.members.includes(req.user._id)) return res.status(403).json({ message: 'Only group members can invite' });
    group.invitations.push({ user: userId, invitedBy: req.user._id, status: 'pending' });
    await group.save();
    res.json({ message: 'Invitation sent' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Accept or decline invitation
router.post('/:groupId/respond', protect, async (req, res) => {
  const { status } = req.body; // 'accepted' or 'declined'
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    const invitation = group.invitations.find(inv => inv.user.toString() === req.user._id.toString());
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    invitation.status = status;
    if (status === 'accepted') {
      group.members.push(req.user._id);
    }
    await group.save();
    res.json({ message: `Invitation ${status}` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Search for students or coaches
router.get('/search-users', protect, async (req, res) => {
  const { q, role } = req.query;
  try {
    const users = await User.find({
      role: role || { $in: ['student', 'coach'] },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
    }).select('name email role');
    res.json(users);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Assign a coach to group
router.post('/:groupId/assign-coach', protect, async (req, res) => {
  const { coachId } = req.body;
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.creator.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Only the group creator can assign a coach' });
    group.coach = coachId;
    await group.save();
    res.json({ message: 'Coach assigned' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Upload a video to group (URL-based, can be extended to file upload)
router.post('/:groupId/upload-video', protect, async (req, res) => {
  const { url } = req.body;
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (!group.members.includes(req.user._id) && group.coach?.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Only group members or coach can upload' });
    group.videos.push({ url, uploadedBy: req.user._id });
    await group.save();
    res.json({ message: 'Video uploaded' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List all groups (for join)
router.get('/all', protect, async (req, res) => {
  try {
    const groups = await Group.find({})
      .populate('creator', 'name email')
      .populate('members', 'name email')
      .populate('coach', 'name email');
    res.json(groups);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get group details (must come after /all)
router.get('/:groupId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('creator', 'name email')
      .populate('members', 'name email')
      .populate('coach', 'name email')
      .populate('invitations.user', 'name email')
      .populate('invitations.invitedBy', 'name email')
      .populate('videos.uploadedBy', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List all groups for a user
router.get('/my', protect, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id });
    res.json(groups);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get pending invitations for the logged-in user
router.get('/invitations', protect, async (req, res) => {
  try {
    const groups = await Group.find({ 'invitations.user': req.user._id });
    const pending = groups
      .map(group => {
        const inv = group.invitations.find(i => i.user.toString() === req.user._id.toString() && i.status === 'pending');
        if (inv) return { groupId: group._id, groupName: group.name, invitedBy: inv.invitedBy, invitedAt: inv.invitedAt };
        return null;
      })
      .filter(Boolean);
    res.json(pending);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a member (creator or coach only)
router.post('/:groupId/remove-member', protect, async (req, res) => {
  const { memberId } = req.body;
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.creator.toString() !== req.user._id.toString() && (!group.coach || group.coach.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Only the creator or coach can remove members' });
    }
    group.members = group.members.filter(m => m.toString() !== memberId);
    await group.save();
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Leave group (member only)
router.post('/:groupId/leave', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.creator.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'Creator cannot leave the group' });
    }
    group.members = group.members.filter(m => m.toString() !== req.user._id.toString());
    await group.save();
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove coach (creator only)
router.post('/:groupId/remove-coach', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can remove the coach' });
    }
    group.coach = null;
    await group.save();
    res.json({ message: 'Coach removed' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete group (creator only)
router.delete('/:groupId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete the group' });
    }
    await group.deleteOne();
    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Join a group (for students and coaches)
router.post('/:groupId/join', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (
      group.members.includes(req.user._id) ||
      (group.coach && group.coach.toString() === req.user._id.toString()) ||
      group.creator.toString() === req.user._id.toString()
    ) {
      return res.status(400).json({ message: 'Already a member/coach/creator' });
    }
    group.members.push(req.user._id);
    await group.save();
    res.json({ message: 'Joined group' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a video from a group (coach only)
router.delete('/:groupId/video/:videoId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (!group.coach || group.coach.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the coach can delete videos' });
    }
    const videoIndex = group.videos.findIndex(v => v._id.toString() === req.params.videoId);
    if (videoIndex === -1) return res.status(404).json({ message: 'Video not found' });
    group.videos.splice(videoIndex, 1);
    await group.save();
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router; 