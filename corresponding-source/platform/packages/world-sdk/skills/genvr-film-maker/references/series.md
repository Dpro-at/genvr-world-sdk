# Episodes and series

Studio's Scene inspector has a **Production mode: Film / series**. A series is made of episodes; an
episode is a sequence of scenes; a scene is one or more shots (takes) on the timeline.

## Plan before filming

- Write an episode sheet: episode number and title, scenes in order, per shot: actor, action,
  dialogue lines per language, camera, length.
- Keep a **cast sheet** for the series: each character's library ID, saved voice ID per language and
  usual expressions, so every episode sounds and looks the same. Assign the same IDs every time.
- Reuse the same world (or a copy) for recurring places; Build and Filming share the live world.

## Building an episode

1. One shot at a time: cues → voices → close Avatar Live → record → inspect.
2. Next shot of the same scene: new cues, record again; clips follow on the picture track.
3. Next scene: add a marker, then use `dialogue_track` with `append:true` and the scene's start.
4. Transitions between scenes: Transitions workspace (`transition.add`); they may trim clips to make
   handles — check timing after adding.
5. Export each episode as the full film; export single shots for review.

## Honest limits

- Each project holds one timeline; a long series is easier as one project per episode.
- Several independent imported cast members in one shot are not guaranteed; the reliable path is
  one acting avatar per take (My avatar), plus scene actors directed by cues.
- Lip sync needs facial controls on the character; check before casting an imported rig.
