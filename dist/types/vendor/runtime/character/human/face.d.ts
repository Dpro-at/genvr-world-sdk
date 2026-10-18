import { Color, Vector2, Vector3, Vector4, type Node } from 'three/webgpu';
type Vec3 = [number, number, number];
/** Shape of the anime eye and face parts (metres on the head). */
export declare const FACE_SHAPE: {
    eye: {
        halfWidth: number;
        halfHeight: number;
        lowerFlat: number;
        raise: number;
    };
    iris: {
        width: number;
        height: number;
    };
    pupil: number;
    lash: {
        upper: number;
        lower: number;
        wing: number;
        lowerStrength: number;
        rim: number;
        rimSoft: number;
    };
    brow: {
        above: number;
        halfLength: number;
        thickness: number;
        arch: number;
    };
    nose: {
        below: number;
        halfLength: number;
        strength: number;
    };
    mouth: {
        y: number;
        halfWidth: number;
        thickness: number;
        open: number;
        strength: number;
    };
    /** Seconds between blinks and how long a blink takes (as a share of the period). */
    blink: {
        period: number;
        closing: number;
    };
};
/** A uniform node with its CPU value (three's types lose the node type of `uniform`). */
type Uniform<T extends 'float' | 'vec2' | 'vec3' | 'vec4', V> = Node<T> & {
    value: V;
};
export interface FaceUniforms {
    eyeColor: Uniform<'vec3', Color>;
    lineColor: Uniform<'vec3', Color>;
    browColor: Uniform<'vec3', Color>;
    /** Where the eyes look: -1..1 left/right, down/up. */
    look: Uniform<'vec2', Vector2>;
    /** Mouth opening 0..1 and width 0..1 (lip sync). */
    mouthOpen: Uniform<'float', number>;
    /** -1 automatic blinking; 0 open .. 1 closed for eyelid inspection. */
    eyeClosure: Uniform<'float', number>;
    leftEye: Uniform<'vec3', Vector3>;
    rightEye: Uniform<'vec3', Vector3>;
    expressions: Uniform<'vec4', Vector4>;
    thinking: Uniform<'float', number>;
    emotion: Uniform<'float', number>;
    browTilt: Uniform<'float', number>;
    surprise: Uniform<'float', number>;
    mouthWide: Uniform<'float', number>;
}
export declare function faceUniforms(eye?: string, brow?: string): FaceUniforms;
/**
 * Paints the face over `skin` (a colour node) and returns the new colour node. `face` holds the landmarks of the
 * shaped head; without them the skin is returned unchanged.
 */
export declare function drawFace(skin: Node<'vec3'>, face: Record<string, Vec3> | undefined, u: FaceUniforms): Node<'vec3'>;
/**
 * The eyeball (region 2 of the generated body, MakeHuman's CC0 eyeball in the opening of the lids): a white with an
 * anime iris in two tones, a pupil and two highlights, drawn from the direction of each point seen from the
 * eyeball's centre (`face.leftEye` / `face.rightEye`), turned by the look.
 */
export declare function drawEyeball(face: Record<string, Vec3> | undefined, u: FaceUniforms): Node<'vec3'>;
/**
 * Where the face is (0..1, rest space): the front of the head around the eyes, nose and mouth. Anime faces are lit
 * softly there (the ChatGPT review: face light influence 0.35), so the realistic sculpt of cheeks, nose and lips
 * does not break into cel-shading patches.
 */
export declare function faceMask(face: Record<string, Vec3> | undefined): Node<'float'>;
export {};
