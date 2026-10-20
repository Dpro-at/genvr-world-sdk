import { mountStudio } from './app';
import { privateMotionLibrary } from './private-motions';
void privateMotionLibrary().then(motionLibrary => mountStudio(document.getElementById('studio')!, motionLibrary ? { motionLibrary } : {}));
