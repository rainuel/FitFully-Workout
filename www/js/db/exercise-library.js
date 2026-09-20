// Built-in exercise library (seeded once). Instructions are short cues, not a
// substitute for coaching. Users can edit these and add their own exercises.

export const EXERCISE_LIBRARY = [
  // ---- Chest ----
  {
    name: 'Bench Press',
    muscle: 'Chest',
    instructions:
      'Lie on the bench with your eyes under the bar and your feet flat on the floor. Lower the bar to your mid-chest with control, then press it back up until your arms are straight. Keep your shoulder blades pulled back and down.',
  },
  {
    name: 'Incline Bench Press',
    muscle: 'Chest',
    instructions:
      'Set the bench to a low incline, about 30 degrees. Lower the bar to your upper chest and press it back up, keeping your wrists stacked over your elbows.',
  },
  {
    name: 'Dumbbell Bench Press',
    muscle: 'Chest',
    instructions:
      'Lie back with a dumbbell in each hand at chest level. Press them up until your arms are straight, then lower slowly until your upper arms are just below the bench.',
  },
  {
    name: 'Incline Dumbbell Press',
    muscle: 'Chest',
    instructions:
      'On a bench set to a low incline, press the dumbbells up from your upper chest. Lower them slowly and keep your elbows about 45 degrees from your body.',
  },
  {
    name: 'Dumbbell Fly',
    muscle: 'Chest',
    instructions:
      'Lie on a flat bench with the dumbbells above your chest and a soft bend in your elbows. Open your arms in a wide arc until you feel a stretch across your chest, then bring the weights back together.',
  },
  {
    name: 'Cable Fly',
    muscle: 'Chest',
    instructions:
      'Stand between two cable stacks with the handles at shoulder height and a slight forward lean. Sweep your hands together in front of your chest, then return slowly to a deep stretch.',
  },
  {
    name: 'Push-Up',
    muscle: 'Chest',
    instructions:
      'Start in a plank with your hands slightly wider than your shoulders. Lower your chest to just above the floor while keeping your body in a straight line, then push back up.',
  },
  {
    name: 'Chest Dip',
    muscle: 'Chest',
    instructions:
      'On parallel bars, lean your torso forward and lower until your upper arms are about parallel to the floor. Press back up without swinging.',
  },

  // ---- Back ----
  {
    name: 'Deadlift',
    muscle: 'Back',
    instructions:
      'Stand with the bar over your mid-foot. Hinge at the hips, grip the bar just outside your legs, brace your core, and keep your back flat. Push the floor away until you stand tall, then lower the bar under control.',
  },
  {
    name: 'Barbell Row',
    muscle: 'Back',
    instructions:
      'Hinge forward with a flat back and the bar hanging at arm length. Pull the bar toward your lower ribs, squeeze your shoulder blades together, and lower it slowly.',
  },
  {
    name: 'Dumbbell Row',
    muscle: 'Back',
    instructions:
      'Support one hand and knee on a bench with your back flat. Pull the dumbbell toward your hip, keeping your elbow close to your body, then lower it fully.',
  },
  {
    name: 'Lat Pulldown',
    muscle: 'Back',
    instructions:
      'Grip the bar a little wider than your shoulders and sit tall. Pull the bar to your upper chest by driving your elbows down, then let it rise back up with control.',
  },
  {
    name: 'Pull-Up',
    muscle: 'Back',
    instructions:
      'Hang from the bar with an overhand grip a little wider than your shoulders. Pull until your chin clears the bar, then lower yourself all the way down.',
  },
  {
    name: 'Chin-Up',
    muscle: 'Back',
    instructions:
      'Hang from the bar with an underhand, shoulder-width grip. Pull until your chin clears the bar, then lower yourself under control.',
  },
  {
    name: 'Seated Cable Row',
    muscle: 'Back',
    instructions:
      'Sit tall with your knees slightly bent and pull the handle to your stomach. Squeeze your shoulder blades together, then extend your arms without rounding your back.',
  },
  {
    name: 'Face Pull',
    muscle: 'Shoulders',
    instructions:
      'Set a rope attachment at upper-chest height. Pull it toward your face with your elbows high, spreading the rope apart at the end. Pause briefly, then return slowly.',
  },

  // ---- Shoulders ----
  {
    name: 'Shoulder Press',
    muscle: 'Shoulders',
    instructions:
      'Hold the weights at shoulder height with your core braced. Press overhead until your arms are straight, then lower to your shoulders without arching your lower back.',
  },
  {
    name: 'Lateral Raise',
    muscle: 'Shoulders',
    instructions:
      'Stand with a dumbbell in each hand and a slight bend in your elbows. Raise your arms out to the sides to shoulder height, then lower slowly. Use a weight you can control without swinging.',
  },
  {
    name: 'Front Raise',
    muscle: 'Shoulders',
    instructions:
      'Hold the weights in front of your thighs. Raise them forward to shoulder height with straight arms, then lower with control.',
  },
  {
    name: 'Rear Delt Fly',
    muscle: 'Shoulders',
    instructions:
      'Hinge forward with a flat back and the dumbbells hanging below you. Raise your arms out to the sides, leading with your elbows, then lower slowly.',
  },
  {
    name: 'Shrug',
    muscle: 'Traps',
    instructions:
      'Hold the weights at your sides with your arms straight. Lift your shoulders straight up toward your ears, pause, and lower them slowly.',
  },

  // ---- Arms ----
  {
    name: 'Bicep Curl',
    muscle: 'Biceps',
    instructions:
      'Stand with a dumbbell in each hand and your elbows at your sides. Curl the weights up to shoulder height, then lower them fully without swinging your body.',
  },
  {
    name: 'Hammer Curl',
    muscle: 'Biceps',
    instructions:
      'Hold the dumbbells with your palms facing each other. Curl them up while keeping your elbows pinned to your sides, then lower slowly.',
  },
  {
    name: 'Barbell Curl',
    muscle: 'Biceps',
    instructions:
      'Hold the bar with an underhand, shoulder-width grip. Curl it to your upper chest without moving your elbows forward, then lower it under control.',
  },
  {
    name: 'Tricep Pushdown',
    muscle: 'Triceps',
    instructions:
      'Stand at a cable stack with your elbows tucked at your sides. Push the handle down until your arms are straight, then let it rise until your forearms are about parallel to the floor.',
  },
  {
    name: 'Overhead Tricep Extension',
    muscle: 'Triceps',
    instructions:
      'Hold one dumbbell overhead with both hands. Lower it behind your head by bending your elbows, keeping them pointing forward, then extend your arms back up.',
  },
  {
    name: 'Skull Crusher',
    muscle: 'Triceps',
    instructions:
      'Lie on a bench with the bar or dumbbells above your chest. Bend only your elbows to lower the weight toward your forehead, then extend your arms back up.',
  },
  {
    name: 'Close-Grip Bench Press',
    muscle: 'Triceps',
    instructions:
      'Bench press with your hands about shoulder-width apart and your elbows close to your body. Lower to your lower chest and press back up.',
  },

  // ---- Legs ----
  {
    name: 'Squat',
    muscle: 'Quads',
    instructions:
      'Set the bar across your upper back and stand with your feet about shoulder-width apart. Brace your core, sit down and back until your thighs are at least parallel to the floor, then stand up by driving through your whole foot.',
  },
  {
    name: 'Front Squat',
    muscle: 'Quads',
    instructions:
      'Rest the bar on the front of your shoulders with your elbows high. Squat down keeping your torso upright, then stand back up.',
  },
  {
    name: 'Goblet Squat',
    muscle: 'Quads',
    instructions:
      'Hold one dumbbell against your chest. Squat down between your knees with your chest tall, then stand back up.',
  },
  {
    name: 'Leg Press',
    muscle: 'Quads',
    instructions:
      'Sit with your back flat against the pad and your feet shoulder-width apart on the platform. Lower the platform until your knees are bent to about 90 degrees, then press it away without locking your knees.',
  },
  {
    name: 'Lunge',
    muscle: 'Quads',
    instructions:
      'Step forward and lower until both knees are bent to about 90 degrees. Push through your front foot to return to standing, then repeat on the other leg.',
  },
  {
    name: 'Bulgarian Split Squat',
    muscle: 'Quads',
    instructions:
      'Rest your rear foot on a bench behind you. Lower straight down until your front thigh is about parallel to the floor, then drive back up through your front foot.',
  },
  {
    name: 'Leg Extension',
    muscle: 'Quads',
    instructions:
      'Sit in the machine with the pad on your lower shins. Extend your legs until they are straight, pause, and lower slowly.',
  },
  {
    name: 'Romanian Deadlift',
    muscle: 'Hamstrings',
    instructions:
      'Hold the bar at hip height with a slight bend in your knees. Push your hips back and slide the bar down your thighs until you feel a stretch in your hamstrings, then drive your hips forward to stand.',
  },
  {
    name: 'Leg Curl',
    muscle: 'Hamstrings',
    instructions:
      'Set the pad just above your heels. Curl your heels toward your glutes, pause, and lower slowly without lifting your hips.',
  },
  {
    name: 'Hip Thrust',
    muscle: 'Glutes',
    instructions:
      'Rest your upper back on a bench with the weight across your hips. Drive your hips up until your body forms a straight line from shoulders to knees, squeeze, and lower with control.',
  },
  {
    name: 'Standing Calf Raise',
    muscle: 'Calves',
    instructions:
      'Stand with the balls of your feet on a raised edge. Rise as high as you can, pause at the top, then lower your heels below the edge for a full stretch.',
  },
  {
    name: 'Seated Calf Raise',
    muscle: 'Calves',
    instructions:
      'Sit with the pad on your lower thighs and the balls of your feet on the platform. Raise your heels as high as possible, then lower them slowly for a full stretch.',
  },

  // ---- Core ----
  {
    name: 'Plank',
    muscle: 'Core',
    instructions:
      'Rest on your forearms and toes with your body in a straight line. Squeeze your glutes and brace your core, and hold without letting your hips sag or rise.',
  },
  {
    name: 'Crunch',
    muscle: 'Core',
    instructions:
      'Lie on your back with your knees bent. Curl your shoulders off the floor by contracting your abs, then lower slowly. Do not pull on your neck.',
  },
  {
    name: 'Hanging Leg Raise',
    muscle: 'Core',
    instructions:
      'Hang from a bar with your body still. Raise your legs, or bent knees, in front of you while curling your pelvis up slightly, then lower without swinging.',
  },
  {
    name: 'Cable Crunch',
    muscle: 'Core',
    instructions:
      'Kneel below a high cable with a rope behind your head. Curl your ribs toward your hips, pause, then return slowly. Move through your spine, not by sitting back on your heels.',
  },
];
