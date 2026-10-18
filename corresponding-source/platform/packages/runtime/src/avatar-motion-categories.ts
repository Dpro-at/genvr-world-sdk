export const MOTION_CATEGORIES = ['Idle', 'Walking', 'Running', 'Jumping', 'Turning', 'Crouching', 'Swimming', 'Traversal', 'Gestures', 'Conversation', 'Dance', 'Combat', 'Reactions', 'Interactions', 'Fitness', 'Sports', 'Poses', 'Utility', 'Review'] as const;
export type MotionCategory = typeof MOTION_CATEGORIES[number];
/** Action words take precedence over posture adjectives such as standing or sitting. */
export function motionCategories(name: string, sourceCategory = ''): MotionCategory[] {
  const text = name.replace(/^GENVR-[A-Z]+-\d+\s*·\s*/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const tags = new Set<MotionCategory>();
  const add = (category: MotionCategory, pattern: RegExp) => { if (pattern.test(text)) tags.add(category); };
  add('Reactions', /\b(death|dying|dead|hit|react\w*|hurt\w*|agoniz\w*|fall\w*|defeated|stumbling|stumble|shoved|scream|yell|roar\w*)\b/);
  add('Jumping', /\b(jump\w*|leap\w*|land\w*)\b/);
  add('Walking', /\b(walk\w*|sneak\w*|backpedal\w*|strafe\w*|stepp?ing)\b/);
  add('Running', /\b(run|running|sprint\w*|jog\w*)\b/);
  add('Turning', /\b(turn\w*|twist\w*|spin\w*)\b/);
  add('Crouching', /\b(crouch\w*|kneel\w*|cover)\b/);
  add('Swimming', /\b(swim\w*|breaststroke)\b/);
  add('Traversal', /\b(climb\w*|vault\w*|crawl\w*|slide|roll\w*|dive\w*)\b/);
  add('Dance', /\b(danc\w*|breakdance\w*|salsa|rumba|samba|capoeira|uprock|hip hop|robot dance)\b/);
  add('Gestures', /\b(wave|clap\w*|cheer\w*|salute|point\w*|nod\w*|head shake|shaking head|gesture|kiss|sigh|taunt\w*|acknowledging|cocky|plotting|look away|weight shift|think\w*|laugh\w*)\b/);
  add('Conversation', /\b(talk\w*|convers\w*|argu\w*|listen\w*)\b/);
  add('Combat', /\b(punch\w*|kick\w*|attack\w*|strike|shoot\w*|aim\w*|recoil|reload\w*|disarm\w*|equip\w*|draw|overdraw|slash\w*|block\w*|dodge\w*|fight\w*|bow|rifle|pistol|sword|weapon)\b/);
  add('Fitness', /\b(stretch\w*|push up\w*|sit up\w*|squat\w*|exercise\w*|burpee\w*|plank|yoga)\b/);
  add('Sports', /\b(sport\w*|soccer|football|basketball|baseball|golf|tennis|boxing|golf\w*)\b/);
  add('Interactions', /\b(sit|sitting|stand up|standing up|stand to|to stand|stand$|build|dig\w*|plant\w*|fruit|water\w*|milk\w*|door|switch\w*|fax|wheelbarrow|torch|removing|pick\w*|carry\w*|lift\w*|pull\w*|push\w*|pray\w*|look\w*|transition)\b/);
  add('Utility', /\b(skinning|test|t pose|bind pose)\b/);
  // Idle is an action; standing alone must never swallow clap, death, aim or dance.
  if (/\bidle\b/.test(text)) tags.add('Idle');
  const known = MOTION_CATEGORIES.find(category => category.toLowerCase() === sourceCategory.toLowerCase());
  if (known && !['Idle', 'Review', 'Interactions'].includes(known)) tags.add(known);
  if (known === 'Interactions' && !tags.has('Combat') && !tags.has('Reactions')) tags.add(known);
  if (!tags.size && known) tags.add(known);
  if (!tags.size && /\b(pose|sit|ground)\b/.test(text)) tags.add('Poses');
  if (!tags.size) tags.add('Review');
  return [...tags];
}
