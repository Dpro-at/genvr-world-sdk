import type { HumanData } from './format.js';
/** Expressions built from our own baked face targets; no foreign avatar topology is copied. */
export declare const HUMAN_EXPRESSION_TARGETS: {
    readonly faceSmile: {
        readonly 'face.mouthCorners+': 0.55;
        readonly 'face.cheekVolume+': 0.08;
        readonly 'face.eyeOpen-': 0.12;
    };
    readonly faceAngry: {
        readonly 'face.browHeight-': 0.28;
        readonly 'face.browAngle-': 0.35;
        readonly 'face.eyeOpen-': 0.15;
        readonly 'face.mouthCorners-': 0.2;
    };
    readonly faceSad: {
        readonly 'face.browHeight+': 0.12;
        readonly 'face.browAngle+': 0.25;
        readonly 'face.mouthCorners-': 0.45;
        readonly 'face.eyeOpen-': 0.1;
    };
    readonly faceSurprised: {
        readonly 'face.browHeight+': 0.4;
        readonly 'face.eyeOpen+': 0.5;
    };
    readonly faceThinking: {
        readonly 'face.browHeight+': 0.1;
        readonly 'face.browAngle+': 0.15;
        readonly 'face.eyeOpen-': 0.08;
    };
};
export declare function humanExpressionTargets(data: HumanData, drawn: number): Record<keyof typeof HUMAN_EXPRESSION_TARGETS, Float32Array>;
