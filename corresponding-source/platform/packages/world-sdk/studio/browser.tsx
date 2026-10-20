import { LOCAL_BODIES, offerLocalBody } from '@genvr/core-library';
import { mountStudio } from './app';
import { privateMotionLibrary } from './private-motions';

/** Local bodies (models only on the owner's device) are offered when this Studio can load their models. */
async function offerLocalBodies() {
  await Promise.all(LOCAL_BODIES.map(async body => {
    if (!body.model) return;
    const found = await fetch(body.model, { method: 'HEAD' }).then(response => response.ok, () => false);
    if (found) offerLocalBody(body.id);
  }));
}

void Promise.all([privateMotionLibrary(), offerLocalBodies()]).then(([motionLibrary]) => mountStudio(document.getElementById('studio')!, motionLibrary ? { motionLibrary } : {}));
